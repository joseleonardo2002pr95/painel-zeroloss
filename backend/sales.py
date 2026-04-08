from fastapi import APIRouter, Request, HTTPException, Query
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from typing import Optional
import asyncio
import json
import logging
import sqlite3
import datetime
import os
import uuid

from supabase_client import get_supabase, is_supabase_available

router = APIRouter()

DEBUG_PAYLOADS = []

# Fila assíncrona para SSE
sales_queue = asyncio.Queue()

DB_PATH = os.path.join(os.path.dirname(__file__), "sales.db")
logger = logging.getLogger("uvicorn.error")

# ──────────────────────────────────────────────
# SQLite (cache local / fallback)
# ──────────────────────────────────────────────

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sales (
            id TEXT PRIMARY KEY,
            name TEXT,
            product TEXT,
            value REAL,
            platform TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

init_db()


def _save_to_sqlite(data: dict):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        if data.get("created_at"):
            cursor.execute(
                'INSERT OR IGNORE INTO sales (id, name, product, value, platform, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                (data["id"], data.get("name", ""), data.get("product", ""),
                 float(data.get("value", 0.0)), data.get("platform", ""), data["created_at"])
            )
        else:
            cursor.execute(
                'INSERT OR IGNORE INTO sales (id, name, product, value, platform) VALUES (?, ?, ?, ?, ?)',
                (data["id"], data.get("name", ""), data.get("product", ""),
                 float(data.get("value", 0.0)), data.get("platform", ""))
            )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"[SQLite] Erro ao salvar: {e}")


def save_sale(sale_event: dict, created_at: str = None):
    """Salva venda no Supabase (primário) e SQLite (cache/fallback)."""
    data = {
        "id":       sale_event["id"],
        "name":     sale_event.get("name", ""),
        "product":  sale_event.get("product", ""),
        "value":    float(sale_event.get("value", 0.0)),
        "platform": sale_event.get("platform", ""),
    }
    if created_at:
        data["created_at"] = created_at

    # 1. Tenta salvar no Supabase
    sb = get_supabase()
    if sb:
        try:
            sb.table("sales").upsert(data).execute()
        except Exception as e:
            logger.error(f"[Supabase] Erro ao salvar venda: {e}")

    # 2. Salva no SQLite como cache local
    _save_to_sqlite(data)


# ──────────────────────────────────────────────
# Helpers de data (Horário de Brasília GMT-3)
# ──────────────────────────────────────────────

BRT = datetime.timezone(datetime.timedelta(hours=-3))

def _today_start_utc() -> datetime.datetime:
    now_brt = datetime.datetime.now(BRT)
    today_start_brt = now_brt.replace(hour=0, minute=0, second=0, microsecond=0)
    return today_start_brt.astimezone(datetime.timezone.utc).replace(tzinfo=None)

def _day_start_utc(date_str: str) -> datetime.datetime:
    """Retorna a meia-noite BRT de uma data YYYY-MM-DD em UTC (naive)."""
    d = datetime.date.fromisoformat(date_str)
    dt_brt = datetime.datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=BRT)
    return dt_brt.astimezone(datetime.timezone.utc).replace(tzinfo=None)


# ──────────────────────────────────────────────
# Endpoints de leitura
# ──────────────────────────────────────────────

@router.get("/api/sales/today")
def get_sales_today():
    """Retorna todas as vendas do dia atual (BRT)."""
    today_start = _today_start_utc()

    # Supabase (primário)
    sb = get_supabase()
    if sb:
        try:
            today_start_iso = today_start.isoformat() + "Z"
            res = sb.table("sales").select("*") \
                .gte("created_at", today_start_iso) \
                .order("created_at", desc=False) \
                .execute()
            sales = res.data or []
            return {"sales": sales, "source": "supabase"}
        except Exception as e:
            logger.error(f"[Supabase] Erro ao buscar vendas de hoje: {e}")

    # Fallback SQLite
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        'SELECT id, name, product, value, platform, created_at FROM sales WHERE created_at >= ? ORDER BY created_at ASC',
        (today_start,)
    )
    rows = cursor.fetchall()
    conn.close()
    sales = [{"id": r[0], "name": r[1], "product": r[2], "value": r[3], "platform": r[4], "created_at": r[5]} for r in rows]
    return {"sales": sales, "source": "sqlite"}


@router.get("/api/sales/history")
def get_sales_history(days: int = Query(7, ge=1, le=90)):
    """
    Retorna o faturamento agregado por dia para os últimos N dias.
    Resposta: [ { date, total, count }, ... ] do mais antigo ao mais novo.
    """
    sb = get_supabase()
    if sb:
        try:
            # Calcula o início do período
            now_brt = datetime.datetime.now(BRT)
            start_brt = (now_brt - datetime.timedelta(days=days - 1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            start_utc = start_brt.astimezone(datetime.timezone.utc).isoformat()

            res = sb.table("sales").select("value, created_at") \
                .gte("created_at", start_utc) \
                .order("created_at", desc=False) \
                .execute()
            rows = res.data or []

            # Agrupa por data (BRT)
            agg: dict = {}
            for row in rows:
                # Converte created_at para data BRT
                try:
                    ts_str = row["created_at"]
                    # Supabase retorna como "2026-04-02T13:53:17+00:00" ou similar
                    if ts_str.endswith("Z"):
                        ts_str = ts_str[:-1] + "+00:00"
                    ts_utc = datetime.datetime.fromisoformat(ts_str)
                    ts_brt = ts_utc.astimezone(BRT)
                    date_key = ts_brt.strftime("%Y-%m-%d")
                except Exception:
                    continue

                if date_key not in agg:
                    agg[date_key] = {"date": date_key, "total": 0.0, "count": 0}
                agg[date_key]["total"] += float(row.get("value", 0))
                agg[date_key]["count"] += 1

            # Preenche dias sem vendas
            result = []
            for i in range(days):
                d = (now_brt - datetime.timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
                result.append(agg.get(d, {"date": d, "total": 0.0, "count": 0}))
            return {"history": result, "source": "supabase"}
        except Exception as e:
            logger.error(f"[Supabase] Erro ao buscar histórico: {e}")

    return {"history": [], "source": "none", "error": "Supabase não configurado"}


@router.get("/api/sales/range")
def get_sales_range(start: str = Query(...), end: str = Query(...)):
    """
    Retorna faturamento por dia para um intervalo de datas (YYYY-MM-DD).
    Exemplo: /api/sales/range?start=2026-04-01&end=2026-04-30
    """
    sb = get_supabase()
    if sb:
        try:
            start_utc = _day_start_utc(start).isoformat() + "Z"
            # end = fim do dia (23:59:59 BRT)
            end_d = datetime.date.fromisoformat(end)
            end_dt_brt = datetime.datetime(end_d.year, end_d.month, end_d.day, 23, 59, 59, tzinfo=BRT)
            end_utc = end_dt_brt.astimezone(datetime.timezone.utc).isoformat()

            res = sb.table("sales").select("value, created_at") \
                .gte("created_at", start_utc) \
                .lte("created_at", end_utc) \
                .order("created_at", desc=False) \
                .execute()
            rows = res.data or []

            agg: dict = {}
            for row in rows:
                try:
                    ts_str = row["created_at"]
                    if ts_str.endswith("Z"):
                        ts_str = ts_str[:-1] + "+00:00"
                    ts_utc = datetime.datetime.fromisoformat(ts_str)
                    ts_brt = ts_utc.astimezone(BRT)
                    date_key = ts_brt.strftime("%Y-%m-%d")
                except Exception:
                    continue
                if date_key not in agg:
                    agg[date_key] = {"date": date_key, "total": 0.0, "count": 0}
                agg[date_key]["total"] += float(row.get("value", 0))
                agg[date_key]["count"] += 1

            # Ordena por data
            result = sorted(agg.values(), key=lambda x: x["date"])
            return {"range": result, "source": "supabase"}
        except Exception as e:
            logger.error(f"[Supabase] Erro ao buscar range: {e}")

    return {"range": [], "source": "none", "error": "Supabase não configurado"}


@router.delete("/api/sales/{sale_id}")
async def delete_sale(sale_id: str):
    """Remove uma venda do BD e avisa o frontend via SSE."""
    sale_value = 0.0
    sale_platform = ""

    # Tenta deletar no Supabase
    sb = get_supabase()
    if sb:
        try:
            res = sb.table("sales").select("value, platform").eq("id", sale_id).single().execute()
            if res.data:
                sale_value = res.data.get("value", 0.0)
                sale_platform = res.data.get("platform", "")
                sb.table("sales").delete().eq("id", sale_id).execute()
            else:
                # Tenta no SQLite antes de dar 404
                pass
        except Exception as e:
            logger.error(f"[Supabase] Erro ao deletar venda: {e}")

    # Também deleta no SQLite
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT value, platform FROM sales WHERE id = ?", (sale_id,))
        row = cursor.fetchone()
        if row:
            if not sale_value:
                sale_value = row[0]
            if not sale_platform:
                sale_platform = row[1]
            cursor.execute("DELETE FROM sales WHERE id = ?", (sale_id,))
            conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"[SQLite] Erro ao deletar venda: {e}")

    if not sale_value and not sale_platform:
        raise HTTPException(status_code=404, detail="Sale not found")

    await sales_queue.put({
        "__action": "delete",
        "id": sale_id,
        "value": sale_value,
        "platform": sale_platform
    })
    return {"status": "success"}


# ──────────────────────────────────────────────
# SSE Stream
# ──────────────────────────────────────────────

@router.get("/api/sales/stream")
async def sales_stream(request: Request):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            try:
                sale_data = await asyncio.wait_for(sales_queue.get(), timeout=1.0)
                if sale_data.get("__action") == "delete":
                    yield {"event": "delete_sale", "data": json.dumps(sale_data)}
                else:
                    yield {"event": "new_sale", "data": json.dumps(sale_data)}
            except asyncio.TimeoutError:
                yield {"event": "ping", "data": '{"ping": 1}'}

    return EventSourceResponse(event_generator())


# ──────────────────────────────────────────────
# Manual / Bulk import
# ──────────────────────────────────────────────

class ManualSalePayload(BaseModel):
    name: str = "Venda Manual"
    product: str = "Produto"
    value: float = 0.0
    platform: str = "Pix Manual"
    created_at: Optional[str] = None  # ISO 8601, ex: "2026-04-02T13:53:17"


@router.post("/api/sales/manual")
async def manual_sale(data: ManualSalePayload):
    sale_id = f"manual_{uuid.uuid4().hex[:12]}"
    sale_event = {
        "id":       sale_id,
        "name":     data.name,
        "product":  data.product,
        "value":    data.value,
        "platform": data.platform,
    }

    # Normaliza created_at para ISO com timezone BRT se não tiver timezone
    created_at_str = None
    if data.created_at:
        try:
            # Tenta parsear e garantir timezone
            ts = datetime.datetime.fromisoformat(data.created_at)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=BRT)
            created_at_str = ts.isoformat()
        except Exception:
            created_at_str = data.created_at

    save_sale(sale_event, created_at=created_at_str)

    # Só envia para SSE se for venda de hoje
    today_start = datetime.datetime.now(BRT).replace(hour=0, minute=0, second=0, microsecond=0)
    is_today = True
    if created_at_str:
        try:
            ts = datetime.datetime.fromisoformat(created_at_str)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=BRT)
            is_today = ts >= today_start
        except Exception:
            pass

    if is_today:
        await sales_queue.put({**sale_event, "created_at": created_at_str or ""})

    logger.info(f"[Venda Manual] {data.name} - {data.value} - {data.platform}")
    return {"status": "success", "id": sale_id}


# ──────────────────────────────────────────────
# Webhooks
# ──────────────────────────────────────────────

@router.get("/api/debug")
async def get_debug_payloads():
    return {"status": "ok", "payloads": DEBUG_PAYLOADS[::-1]}


@router.post("/webhooks/perfectpay")
async def perfectpay_webhook(request: Request):
    try:
        try:
            payload = await request.json()
        except Exception:
            payload = dict(await request.form())

        DEBUG_PAYLOADS.append({"platform": "PerfectPay", "payload": payload})
        if len(DEBUG_PAYLOADS) > 10:
            DEBUG_PAYLOADS.pop(0)

        status = str(payload.get("sale_status_enum", ""))
        if status != "2":
            return {"message": "Ignorado - não aprovado"}

        tx_id = payload.get("code", "N/A")
        customer = payload.get("customer", {})
        name = customer.get("full_name", payload.get("customer_name", "Cliente"))
        product_obj = payload.get("product", {})
        product = product_obj.get("name", payload.get("product_name", "Produto Oculto"))

        val = payload.get("sale_amount", 0)
        try:
            commissions = payload.get("commission", [])
            # Sempre pega a MAIOR comissão — Circle Digital tem sempre a maior parte
            amounts = []
            for c in commissions:
                amt = c.get("commission_amount")
                if amt is not None:
                    try:
                        amounts.append(float(amt))
                    except Exception:
                        pass
            if amounts:
                val = max(amounts)
        except Exception:
            pass

        try:
            val = float(val)
        except Exception:
            val = 0.0

        sale_event = {"id": f"pp_{tx_id}", "name": name, "product": product, "value": val, "platform": "PerfectPay"}
        save_sale(sale_event)
        await sales_queue.put(sale_event)
        logger.info(f"[PerfectPay] {name} - {product} - {val}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Erro PerfectPay webhook: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/webhooks/payt")
async def payt_webhook(request: Request):
    try:
        content_type = request.headers.get('content-type', '')
        if 'application/json' in content_type:
            raw_body = await request.json()
        else:
            form = await request.form()
            raw_body = {k: v for k, v in form.items()}

        DEBUG_PAYLOADS.append({"platform": "Payt", "payload": raw_body})
        if len(DEBUG_PAYLOADS) > 10:
            DEBUG_PAYLOADS.pop(0)

        body = raw_body.get("data", raw_body)
        status = str(body.get("status", raw_body.get("event", ""))).lower()
        if status not in ["approved", "paid", "aprovada", "1", "2", "charge.approved", "transaction.approved"]:
            return {"message": "Ignorado - Status não aprovado"}

        tx_id = body.get("transaction_id", body.get("id", "textoNA"))
        customer = body.get("customer", body.get("buyer", {}))
        name = customer.get("name", customer.get("full_name", body.get("customer_name", "Cliente")))
        product_obj = body.get("product", {})
        product = product_obj.get("name", body.get("product_name", "Produto Oculto"))

        val = 0.0
        commissions = body.get("commission", [])
        if isinstance(commissions, list):
            for c in commissions:
                if c.get("type", "") == "producer":
                    val = c.get("amount", 0.0)
                    break
        if val == 0.0:
            transaction_data = body.get("transaction", {})
            val = transaction_data.get("total_price", body.get("price", body.get("amount", body.get("value", 0.0))))
        try:
            val = float(val) / 100.0
        except Exception:
            val = 0.0

        sale_event = {"id": f"payt_{tx_id}", "name": name, "product": product, "value": val, "platform": "Payt"}
        save_sale(sale_event)
        await sales_queue.put(sale_event)
        logger.info(f"[Payt] {name} - {product} - {val}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Erro Payt webhook: {e}")
        return {"status": "error"}


@router.post("/webhooks/kirvano")
async def kirvano_webhook(request: Request):
    try:
        raw_body = await request.json()
        DEBUG_PAYLOADS.append({"platform": "Kirvano", "payload": raw_body})
        if len(DEBUG_PAYLOADS) > 10:
            DEBUG_PAYLOADS.pop(0)

        body = raw_body.get("data", raw_body)
        status = str(body.get("status", "")).lower()
        event  = str(body.get("event", raw_body.get("event", ""))).lower()
        approved_statuses = ["approved", "paid", "aprovado", "charge.approved", "transaction.approved"]
        approved_events   = ["sale_approved", "purchase_approved", "approved"]

        if status not in approved_statuses and event not in approved_events:
            logger.info(f"[Kirvano] Ignorado - status={status}, event={event}")
            return {"message": f"Ignorado - status={status}, event={event}"}

        tx_id = body.get("sale_id", body.get("transaction_id", body.get("id", "textoNA")))
        buyer = body.get("customer", body.get("buyer", {}))
        name = buyer.get("name", buyer.get("full_name", body.get("customer_name", "Cliente")))

        product_name = "Produto Oculto"
        products_list = body.get("products", [])
        if products_list and isinstance(products_list, list):
            product_name = products_list[0].get("name", "Produto Oculto")
        else:
            product_obj = body.get("product", {})
            product_name = product_obj.get("name", body.get("product_name", "Produto Oculto"))

        fiscal = body.get("fiscal", {})
        coprod_val = body.get("coproductionCommission", fiscal.get("coproduction_commission", 0))
        try:
            coprod_val = float(coprod_val)
        except Exception:
            coprod_val = 0.0

        if coprod_val > 0:
            val = coprod_val
        else:
            val = body.get("commission", fiscal.get("commission", 0.0))
            try:
                if isinstance(val, str):
                    val = float(val.replace("R$", "").replace(".", "").replace(",", ".").strip())
                else:
                    val = float(val)
            except Exception:
                val = 0.0

        sale_event = {"id": f"kirvano_{tx_id}", "name": name, "product": product_name, "value": val, "platform": "Kirvano"}
        save_sale(sale_event)
        await sales_queue.put(sale_event)
        logger.info(f"[Kirvano] {name} - {product_name} - {val}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Erro Kirvano webhook: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/webhooks/xp")
async def xp_webhook(request: Request):
    try:
        body = await request.json()
        name = body.get("name", body.get("customer_name", "Remetente PIX"))
        val = body.get("value", body.get("amount", body.get("price", 0.0)))
        try:
            val_str = str(val).strip()
            if ',' in val_str:
                val_str = val_str.replace('.', '').replace(',', '.')
            val = float(val_str)
        except Exception:
            val = 0.0

        sale_event = {
            "id":       f"xp_{uuid.uuid4().hex[:12]}",
            "name":     name,
            "product":  "Depósito PIX",
            "value":    val,
            "platform": "XP Empresas (Pix)"
        }
        save_sale(sale_event)
        await sales_queue.put(sale_event)
        logger.info(f"[XP Pix] {name} - {val}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Erro XP webhook: {e}")
        return {"status": "error"}


@router.post("/webhooks/paradise")
async def paradise_webhook(request: Request):
    try:
        try:
            payload = await request.json()
        except Exception:
            payload = dict(await request.form())

        DEBUG_PAYLOADS.append({"platform": "Paradise", "payload": payload})
        if len(DEBUG_PAYLOADS) > 10:
            DEBUG_PAYLOADS.pop(0)

        # Só processa transações aprovadas
        status = str(payload.get("status", "")).lower()
        raw_status = str(payload.get("raw_status", "")).lower()
        if status not in ("approved", "aprovado") and raw_status not in ("approved", "aprovado"):
            return {"message": f"Ignorado - status: {status}"}

        tx_id   = payload.get("transaction_id", uuid.uuid4().hex[:12])
        customer = payload.get("customer", {})
        name    = customer.get("name", "Cliente")
        product_obj = payload.get("product", {})
        product = product_obj.get("name", "Produto Oculto")

        # amount vem em centavos (ex: 100 = R$1,00)
        try:
            val = float(payload.get("amount", 0)) / 100.0
        except Exception:
            val = 0.0

        sale_event = {
            "id":       f"paradise_{tx_id}",
            "name":     name,
            "product":  product,
            "value":    val,
            "platform": "Paradise",
        }
        save_sale(sale_event)
        await sales_queue.put(sale_event)
        logger.info(f"[Paradise] {name} - {product} - R${val:.2f}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Erro Paradise webhook: {e}")
        return {"status": "error", "message": str(e)}
