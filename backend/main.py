import asyncio
import uuid
import json
import time
import os
from datetime import datetime
from typing import Dict, Any, List

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from sheets import get_audience_data, get_last_updated
from bot import send_broadcast
from history import add_record, get_records
import sales
import tasks
from tasks import seed_tasks

app = FastAPI(title="Painel ZeroLoss API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registra as routers
app.include_router(sales.router)
app.include_router(tasks.router)

# Seed das tarefas iniciais no Supabase (idempotente)
@app.on_event("startup")
async def startup_event():
    seed_tasks()

# ──────────────────────────────────────────────
# Broadcast Job Store
# ──────────────────────────────────────────────
broadcast_jobs: Dict[str, Any] = {}

def new_job(total: int, target: str) -> str:
    job_id = str(uuid.uuid4())
    broadcast_jobs[job_id] = {
        "job_id":     job_id,
        "status":     "running",
        "target":     target,
        "total":      total,
        "sent":       0,
        "failed":     0,
        "started_at": datetime.now().isoformat(),
        "finished_at": None,
    }
    # Persiste imediatamente para sobreviver a reinícios
    add_record(dict(broadcast_jobs[job_id]))
    return job_id


# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────
class MessageBlock(BaseModel):
    type: str      # "text" | "image_url" | "image_b64"
    content: str

class BroadcastRequest(BaseModel):
    target: str              # "leads" | "clients"
    messages: List[MessageBlock]


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@app.get("/api/audience")
def get_audience():
    cache = get_audience_data()
    if cache.get("error"):
        raise HTTPException(status_code=500, detail=cache["error"])
    data = cache["data"]
    last_ts = get_last_updated()
    return {
        "leads_count":         len(data["leads"]),
        "clients_count":       len(data["clients"]),
        "total_leads_rows":    data.get("total_leads_rows", 0),
        "total_clients_rows":  data.get("total_clients_rows", 0),
        "last_updated":        datetime.fromtimestamp(last_ts).strftime("%d/%m/%Y %H:%M:%S") if last_ts else None,
    }


@app.get("/api/audience/stream")
async def audience_stream():
    """SSE: envia contagens atualizadas em tempo real para o frontend."""
    async def event_gen():
        last_sent_ts = 0.0
        while True:
            ts = get_last_updated()
            if ts != last_sent_ts:
                cache = get_audience_data()
                data = cache["data"]
                payload = {
                    "leads_count":         len(data["leads"]),
                    "clients_count":       len(data["clients"]),
                    "total_leads_rows":    data.get("total_leads_rows", 0),
                    "total_clients_rows":  data.get("total_clients_rows", 0),
                    "last_updated":        datetime.fromtimestamp(ts).strftime("%d/%m/%Y %H:%M:%S") if ts else None,
                    "error":               cache.get("error"),
                }
                yield f"data: {json.dumps(payload)}\n\n"
                last_sent_ts = ts
            await asyncio.sleep(5)   # checa a cada 5s; refresh real ocorre conforme SHEETS_REFRESH_INTERVAL

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/audience/refresh")
def force_refresh():
    """Força um refresh imediato da planilha (útil para o botão 'Atualizar agora')."""
    from sheets import _refresh
    _refresh()
    return {"status": "ok"}


@app.post("/api/broadcast")
async def start_broadcast(req: BroadcastRequest, background_tasks: BackgroundTasks):
    cache = get_audience_data()
    if cache.get("error"):
        raise HTTPException(status_code=500, detail=cache["error"])
    data = cache["data"]

    target_ids = data["leads"] if req.target == "leads" else data["clients"]
    if not target_ids:
        raise HTTPException(status_code=400, detail="A lista de destinatários está vazia.")

    job_id = new_job(len(target_ids), req.target)
    background_tasks.add_task(send_broadcast, job_id, target_ids, req.messages, broadcast_jobs)
    return {"status": "success", "job_id": job_id, "total": len(target_ids)}


@app.get("/api/broadcasts")
def list_broadcasts():
    """Retorna histórico persistido + jobs em memória."""
    # Começa com histórico do arquivo
    records = {r["job_id"]: r for r in get_records() if "job_id" in r}
    # Sobrepõe com o que está em memória (mais fresco)
    for jid, job in broadcast_jobs.items():
        records[jid] = job
    # Ordena por started_at decrescente
    sorted_records = sorted(
        records.values(),
        key=lambda r: r.get("started_at", ""),
        reverse=True,
    )
    return sorted_records


@app.get("/api/broadcast/{job_id}/status")
def job_status(job_id: str):
    # Tenta em memória primeiro, depois no arquivo
    job = broadcast_jobs.get(job_id)
    if not job:
        for r in get_records():
            if r.get("job_id") == job_id:
                return r
        raise HTTPException(status_code=404, detail="Job não encontrado.")
    return job


@app.get("/api/broadcast/{job_id}/stream")
async def job_stream(job_id: str):
    """SSE: progresso em tempo real de um disparo."""
    async def event_gen():
        while True:
            job = broadcast_jobs.get(job_id)
            if not job:
                break
            yield f"data: {json.dumps(job)}\n\n"
            if job["status"] in ("done", "canceled"):
                break
            await asyncio.sleep(0.4)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/broadcast/{job_id}/cancel")
def cancel_broadcast(job_id: str):
    """Marca um disparo em andamento como cancelado."""
    # Primeiro checa na memória
    if job_id in broadcast_jobs:
        job = broadcast_jobs[job_id]
        if job["status"] != "running":
            raise HTTPException(status_code=400, detail="Job não está em andamento.")
        job["status"] = "canceled"
        return {"status": "success", "message": "Disparo cancelado com sucesso."}
    
    # Se não está na memória, pode ser que o servidor reiniciou com ele "running"
    for r in get_records():
        if r.get("job_id") == job_id:
            if r.get("status") == "running":
                r["status"] = "canceled"
                r["finished_at"] = datetime.now().isoformat()
                add_record(r)
                return {"status": "success", "message": "Disparo órfão cancelado com sucesso."}
            else:
                raise HTTPException(status_code=400, detail="Job já finalizado no histórico.")
                
    raise HTTPException(status_code=404, detail="Job não encontrado.")


# ──────────────────────────────────────────────
# Montar Frontend React (Deploy Mode)
# ──────────────────────────────────────────────
frontend_dist_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.isdir(frontend_dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist_path, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Evita conflito com rotas /api e /webhooks (FastAPI resolve api/webhooks antes, mas pra garantir)
        if full_path.startswith("api/") or full_path.startswith("webhooks/"):
            raise HTTPException(status_code=404)
            
        file_path = os.path.join(frontend_dist_path, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # React SPA fallback
        return FileResponse(os.path.join(frontend_dist_path, "index.html"))

