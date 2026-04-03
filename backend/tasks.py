"""
tasks.py – Gerenciamento de Rotinas/Tarefas

Tabelas necessárias no Supabase (execute no SQL Editor do Supabase):

    -- Definições das tarefas
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,          -- 'daily' | 'weekly' | 'continuous'
      target_count INTEGER DEFAULT 1,
      project TEXT DEFAULT '',
      frequency TEXT DEFAULT 'daily',  -- 'daily' | 'weekly' | 'continuous'
      custom_interval_days INTEGER DEFAULT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Registros de conclusão
    CREATE TABLE IF NOT EXISTS task_completions (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL,  -- 'YYYY-MM-DD' para diárias | 'YYYY-WNN' para semanais
      count INTEGER DEFAULT 1,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(task_id, period_key)
    );
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import datetime
import logging

from supabase_client import get_supabase

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

BRT = datetime.timezone(datetime.timedelta(hours=-3))

# ── Tarefas iniciais (seed) ────────────────────────────────────────────────────
INITIAL_TASKS = [
    # Diárias
    {"id": "daily-vip-video",      "title": "1 vídeo Sala VIP Zero",              "type": "daily",      "target_count": 1, "project": "ZeroLoss", "frequency": "daily",      "custom_interval_days": None, "sort_order": 1},
    {"id": "daily-entrada-video",  "title": "1 vídeo de entrada (Zero)",          "type": "daily",      "target_count": 1, "project": "ZeroLoss", "frequency": "daily",      "custom_interval_days": None, "sort_order": 2},
    {"id": "daily-disparo-leads",  "title": "Disparo para todos os leads",        "type": "daily",      "target_count": 1, "project": "Geral",    "frequency": "daily",      "custom_interval_days": None, "sort_order": 3},
    {"id": "daily-disparo-clientes","title": "Disparo para clientes",             "type": "daily",      "target_count": 1, "project": "Geral",    "frequency": "daily",      "custom_interval_days": None, "sort_order": 4},
    {"id": "daily-wincerto-criativo","title": "1 criativo novo Wincerto",         "type": "daily",      "target_count": 1, "project": "Wincerto", "frequency": "custom",     "custom_interval_days": 3,    "sort_order": 5},
    # Semanais
    {"id": "weekly-zeroloss",      "title": "5 criativos por semana ZeroLoss",    "type": "weekly",     "target_count": 5, "project": "ZeroLoss", "frequency": "weekly",     "custom_interval_days": None, "sort_order": 6},
    {"id": "weekly-virtual",       "title": "2 criativos por semana - Virtual",   "type": "weekly",     "target_count": 2, "project": "Virtual",  "frequency": "weekly",     "custom_interval_days": None, "sort_order": 7},
    {"id": "weekly-cashout",       "title": "2 criativos por semana - Cashout",   "type": "weekly",     "target_count": 2, "project": "Cashout",  "frequency": "weekly",     "custom_interval_days": None, "sort_order": 8},
    # Contínuas / Metas
    {"id": "cont-chips-wincerto",  "title": "3 Chips rodando na Wincerto",        "type": "continuous", "target_count": 3, "project": "Wincerto", "frequency": "continuous", "custom_interval_days": None, "sort_order": 9},
]


def seed_tasks():
    """Insere as tarefas iniciais no Supabase (idempotente)."""
    sb = get_supabase()
    if not sb:
        return
    try:
        for task in INITIAL_TASKS:
            sb.table("tasks").upsert(task, on_conflict="id").execute()
        logger.info("✅ [Tasks] Tarefas iniciais verificadas/inseridas.")
    except Exception as e:
        logger.error(f"❌ [Tasks] Erro no seed de tarefas: {e}")


def _today_key() -> str:
    return datetime.datetime.now(BRT).strftime("%Y-%m-%d")


def _week_key() -> str:
    """Retorna 'YYYY-WNN' para a semana ISO atual no horário BRT."""
    now = datetime.datetime.now(BRT)
    return now.strftime("%Y-W%W")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/api/tasks")
def get_tasks():
    """Retorna todas as tarefas ativas com o status de conclusão de hoje/semana."""
    sb = get_supabase()
    if not sb:
        return {"tasks": [], "error": "Supabase não configurado"}

    try:
        tasks_res = sb.table("tasks").select("*").eq("is_active", True).order("sort_order").execute()
        tasks = tasks_res.data or []

        today_key = _today_key()
        week_key  = _week_key()

        # Busca completions do período atual para todas as tarefas
        task_ids = [t["id"] for t in tasks]
        completions_res = sb.table("task_completions").select("*") \
            .in_("task_id", task_ids) \
            .in_("period_key", [today_key, week_key]) \
            .execute()
        completions = {(c["task_id"], c["period_key"]): c for c in (completions_res.data or [])}

        result = []
        for task in tasks:
            tid = task["id"]
            period = today_key if task["frequency"] in ("daily", "custom") else \
                     week_key  if task["frequency"] == "weekly" else \
                     "continuous"

            comp = completions.get((tid, period)) or completions.get((tid, "continuous"))
            current_count = comp["count"] if comp else 0

            result.append({
                **task,
                "current_count": current_count,
                "period_key":    period,
                "completed":     current_count >= task["target_count"],
            })

        return {"tasks": result, "today": today_key, "week": week_key}
    except Exception as e:
        logger.error(f"[Tasks] Erro ao buscar tarefas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class NewTaskPayload(BaseModel):
    title: str
    type: str = "daily"           # 'daily' | 'weekly' | 'continuous'
    target_count: int = 1
    project: str = "Geral"
    frequency: str = "daily"      # 'daily' | 'weekly' | 'continuous' | 'custom'
    custom_interval_days: Optional[int] = None


@router.post("/api/tasks")
def create_task(payload: NewTaskPayload):
    """Cria uma nova tarefa."""
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="Supabase não configurado")
    try:
        import uuid as _uuid
        new_id = f"custom-{_uuid.uuid4().hex[:10]}"
        # Descobre o próximo sort_order
        res = sb.table("tasks").select("sort_order").order("sort_order", desc=True).limit(1).execute()
        last_order = res.data[0]["sort_order"] if res.data else 0
        task = {
            "id":                   new_id,
            "title":                payload.title,
            "type":                 payload.type,
            "target_count":         payload.target_count,
            "project":              payload.project,
            "frequency":            payload.frequency,
            "custom_interval_days": payload.custom_interval_days,
            "sort_order":           last_order + 1,
            "is_active":            True,
        }
        sb.table("tasks").insert(task).execute()
        return {"status": "ok", "task": task}
    except Exception as e:
        logger.error(f"[Tasks] Erro ao criar tarefa: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/tasks/{task_id}")
def delete_task(task_id: str):
    """Desativa (soft-delete) uma tarefa."""
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="Supabase não configurado")
    try:
        sb.table("tasks").update({"is_active": False}).eq("id", task_id).execute()
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"[Tasks] Erro ao deletar tarefa {task_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CompletePayload(BaseModel):
    delta: int = 1  # +1 para completar, -1 para desfazer


@router.post("/api/tasks/{task_id}/complete")
def complete_task(task_id: str, payload: CompletePayload):
    """Incrementa ou decrementa o contador de conclusão de uma tarefa."""
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="Supabase não configurado")

    try:
        # Pega a definição da tarefa
        task_res = sb.table("tasks").select("*").eq("id", task_id).single().execute()
        task = task_res.data
        if not task:
            raise HTTPException(status_code=404, detail="Tarefa não encontrada")

        freq = task.get("frequency", "daily")
        if freq in ("daily", "custom"):
            period_key = _today_key()
        elif freq == "weekly":
            period_key = _week_key()
        else:
            period_key = "continuous"

        # Upsert do completion (incrementa/decrementa o count)
        comp_res = sb.table("task_completions").select("*") \
            .eq("task_id", task_id) \
            .eq("period_key", period_key) \
            .execute()
        existing = comp_res.data[0] if comp_res.data else None

        new_count = max(0, (existing["count"] if existing else 0) + payload.delta)

        if existing:
            sb.table("task_completions").update(
                {"count": new_count, "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
            ).eq("id", existing["id"]).execute()
        else:
            sb.table("task_completions").insert({
                "task_id":    task_id,
                "period_key": period_key,
                "count":      new_count,
            }).execute()

        completed = new_count >= task["target_count"]
        return {"status": "ok", "task_id": task_id, "count": new_count, "completed": completed}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Tasks] Erro ao completar tarefa {task_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
