from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
import asyncio
import json
import logging
import sqlite3
import datetime
import os

router = APIRouter()

DEBUG_PAYLOADS = []

# Fila assíncrona para enviar dados de vendas recebidos via webhook para os clientes SSE conectados
sales_queue = asyncio.Queue()

DB_PATH = os.path.join(os.path.dirname(__file__), "sales.db")

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

def save_sale(sale_event: dict):
    """Salva a venda no SQLite ignorando duplicatas pelo ID da transação"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR IGNORE INTO sales (id, name, product, value, platform)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            sale_event["id"], 
            sale_event.get("name", ""), 
            sale_event.get("product", ""), 
            float(sale_event.get("value", 0.0)), 
            sale_event.get("platform", "")
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Erro ao salvar no BD: {e}")

@router.get("/api/sales/today")
def get_sales_today():
    """Retorna todas as vendas ocorridas desde a meia-noite (UTC/Server Time)."""
    conn = sqlite3.connect(DB_PATH)
    # Definindo a meia noite de hoje
    today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, name, product, value, platform, created_at 
        FROM sales 
        WHERE created_at >= ? 
        ORDER BY created_at ASC
    ''', (today_start,))
    
    rows = cursor.fetchall()
    conn.close()
    
    sales = []
    for r in rows:
        sales.append({
            "id": r[0],
            "name": r[1],
            "product": r[2],
            "value": r[3],
            "platform": r[4],
            "created_at": r[5]
        })
        
    return {"sales": sales}

@router.delete("/api/sales/{sale_id}")
async def delete_sale(sale_id: str):
    """Remove uma venda do banco de dados e avisa o frontend SSE."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM sales WHERE id = ?", (sale_id,))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="Sale not found")
            
        sale_value = row[0]
        cursor.execute("DELETE FROM sales WHERE id = ?", (sale_id,))
        conn.commit()
        conn.close()
        
        # Envia comando de deleção para os clientes ao vivo
        await sales_queue.put({
            "__action": "delete",
            "id": sale_id,
            "value": sale_value
        })
        
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao deletar venda: {e}")
        raise HTTPException(status_code=500, detail=str(e))

logger = logging.getLogger("uvicorn.error")

@router.get("/api/debug")
async def get_debug_payloads():
    """Retorna os últimos webhooks recebidos na memória para debugar estruturas desconhecidas."""
    return {"status": "ok", "payloads": DEBUG_PAYLOADS[::-1]}

@router.get("/api/sales/stream")
async def sales_stream(request: Request):
    """
    Endpoint SSE (Server-Sent Events) para o Frontend ouvir as compras em tempo real.
    """
    async def event_generator():
        # Quando o cliente conecta, podemos mandar as últimas vendas imediatamente
        # (Para ficar mais realista e o dashboard não começar vazio)
        # Por enquanto vamos apenas focar nas vendas ao vivo
        while True:
            if await request.is_disconnected():
                break
            
            try:
                # Espera por uma nova venda na fila
                sale_data = await asyncio.wait_for(sales_queue.get(), timeout=1.0)
                
                if sale_data.get("__action") == "delete":
                    yield {
                        "event": "delete_sale",
                        "data": json.dumps(sale_data)
                    }
                else:
                    yield {
                        "event": "new_sale",
                        "data": json.dumps(sale_data)
                    }
            except asyncio.TimeoutError:
                # Mantém a conexão viva (ping)
                yield {
                    "event": "ping",
                    "data": '{"ping": 1}'
                }

    return EventSourceResponse(event_generator())


@router.post("/webhooks/perfectpay")
async def perfectpay_webhook(request: Request):
    """
    Recebe o Webhook da PerfectPay (Formato JSON).
    """
    try:
        # Tenta pegar JSON primeiro
        try:
            payload = await request.json()
        except:
            payload = dict(await request.form())
            
        DEBUG_PAYLOADS.append({"platform": "PerfectPay", "payload": payload})
        if len(DEBUG_PAYLOADS) > 10: DEBUG_PAYLOADS.pop(0)

        status = str(payload.get("sale_status_enum", ""))
        
        # O 2 significa "Aprovada" na PerfectPay
        if status != "2": 
            return {"message": "Ignorado - não aprovado"}
            
        tx_id = payload.get("code", "N/A")
        
        # O Nome e Produto agora vêm em sub-objetos
        customer = payload.get("customer", {})
        name = customer.get("full_name", payload.get("customer_name", "Cliente"))
        
        product_obj = payload.get("product", {})
        product = product_obj.get("name", payload.get("product_name", "Produto Oculto"))
        
        val = payload.get("sale_amount", 0)
        try:
            # Tenta pegar apenas o valor da comissão recebido (tipo produtor ou afiliado)
            commissions = payload.get("commission", [])
            for c in commissions:
                # Na PerfectPay, a taxa deles costuma ser affiliation_type_enum 0.
                if c.get("name") != "PerfectPay" and c.get("affiliation_type_enum") != 0:
                    val = c.get("commission_amount", val)
                    break
        except Exception:
            pass
            
        try:
            val = float(val)
        except:
            val = 0.0

        sale_event = {
            "id": f"pp_{tx_id}",
            "name": name,
            "product": product,
            "value": val,
            "platform": "PerfectPay"
        }
        
        save_sale(sale_event)
        await sales_queue.put(sale_event)

        logger.info(f"[PerfectPay] Venda Aprovada Webhook recebida: {name} comprou {product} por {val}")

        return {"status": "ok"}
        
    except Exception as e:
        logger.error(f"Erro no webhook da PerfectPay: {e}")
        return {"status": "error", "message": str(e)}

@router.post("/webhooks/payt")
async def payt_webhook(request: Request):
    """
    Recebe o Webhook da Payt. 
    Geralmente envia via JSON. 
    Status de aprovação precisa ser validado.
    """
    try:
        # Payt manda form-data ou json
        content_type = request.headers.get('content-type', '')
        if 'application/json' in content_type:
            raw_body = await request.json()
        else:
            form = await request.form()
            raw_body = {k: v for k, v in form.items()}
            
        DEBUG_PAYLOADS.append({"platform": "Payt", "payload": raw_body})
        if len(DEBUG_PAYLOADS) > 10: DEBUG_PAYLOADS.pop(0)
            
        body = raw_body.get("data", raw_body) # Fallback para caso venha encapsulado
        
        status = str(body.get("status", raw_body.get("event", ""))).lower()
        if status not in ["approved", "paid", "aprovada", "1", "2", "charge.approved", "transaction.approved"]:
            return {"message": "Ignorado - Status não aprovado"}
            
        tx_id = body.get("transaction_id", body.get("id", "textoNA"))
        
        customer = body.get("customer", body.get("buyer", {}))
        name = customer.get("name", customer.get("full_name", body.get("customer_name", "Cliente")))
        
        product_obj = body.get("product", {})
        product = product_obj.get("name", body.get("product_name", "Produto Oculto"))
        
        # Payt value - Extrai do array "commission" (Produtor) ou "transaction.total_price". Valores vêm em centavos.
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
        except:
            val = 0.0
            
        sale_event = {
            "id": f"payt_{tx_id}",
            "name": name,
            "product": product,
            "value": val,
            "platform": "Payt"
        }
        
        save_sale(sale_event)
        await sales_queue.put(sale_event)

        logger.info(f"[Payt] Venda Recebida: {name} - {product} - {val}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Erro no webhook da Payt: {e}")
        return {"status": "error"}

@router.post("/webhooks/kirvano")
async def kirvano_webhook(request: Request):
    """
    Recebe o Webhook da Kirvano.
    Geralmente envia JSON com transação aprovada.
    """
    try:
        raw_body = await request.json()
        body = raw_body.get("data", raw_body)
        
        status = str(body.get("status", raw_body.get("event", ""))).lower()
        # Kirvano usualmente manda 'approved'
        if status not in ["approved", "paid", "aprovado", "charge.approved", "transaction.approved"]:
            return {"message": "Ignorado - Status não aprovado"}
            
        tx_id = body.get("transaction_id", body.get("id", "textoNA"))
        
        buyer = body.get("buyer", body.get("customer", {}))
        name = buyer.get("name", buyer.get("full_name", body.get("customer_name", "Cliente")))
        
        product_name = "Produto Oculto"
        products_list = body.get("products", [])
        if products_list and isinstance(products_list, list):
            product_name = products_list[0].get("name", "Produto Oculto")
        else:
            product_obj = body.get("product", {})
            product_name = product_obj.get("name", body.get("product_name", "Produto Oculto"))
        
        # Kirvano value - Cuidado: "R$ 169,80"
        val = body.get("commission", body.get("net_amount", body.get("total_price", body.get("amount", body.get("value", body.get("price", 0.0))))))
        try:
            if isinstance(val, str):
                val_clean = val.replace("R$", "").replace(".", "").replace(",", ".").strip()
                val = float(val_clean)
            else:
                val = float(val)
        except:
            val = 0.0
            
        sale_event = {
            "id": f"kirvano_{tx_id}",
            "name": name,
            "product": product_name,
            "value": val,
            "platform": "Kirvano"
        }
        
        save_sale(sale_event)
        await sales_queue.put(sale_event)

        logger.info(f"[Kirvano] Venda Recebida: {name} - {product} - {val}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Erro no webhook da Kirvano: {e}")
        return {"status": "error"}

@router.post("/webhooks/xp")
async def xp_webhook(request: Request):
    """
    Recebe notificação de PIX da XP Empresas.
    O sistema espera que um serviço corporativo de RPA, Zapier ou Make.com 
    leia o E-mail de transação da XP e atire um POST JSON simples para cá.
    
    Exemplo esperado do Make.com:
    { "name": "José Bezerra", "value": 150.50 }
    """
    try:
        body = await request.json()
        
        name = body.get("name", body.get("customer_name", "Remetente PIX"))
        
        val = body.get("value", body.get("amount", body.get("price", 0.0)))
        try:
            val = float(str(val).replace(',', '.'))
        except:
            val = 0.0
            
        sale_event = {
            "id": f"xp_{asyncio.get_event_loop().time()}",
            "name": name,
            "product": "Depósito PIX",
            "value": val,
            "platform": "XP Empresas (Pix)"
        }
        
        save_sale(sale_event)
        await sales_queue.put(sale_event)

        logger.info(f"[XP Pix] Transferência Recebida: {name} - {val}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Erro no webhook da XP: {e}")
        return {"status": "error"}

class ManualSalePayload(BaseModel):
    name: str = "Venda Manual"
    product: str = "Produto"
    value: float = 0.0
    platform: str = "Pix Manual"

@router.post("/api/sales/manual")
async def manual_sale(data: ManualSalePayload):
    """
    Injeta uma venda manual no dashboard. Pode ser por qualquer plataforma.
    """
    sale_event = {
        "id": f"manual_{asyncio.get_event_loop().time()}",
        "name": data.name,
        "product": data.product,
        "value": data.value,
        "platform": data.platform
    }
    
    save_sale(sale_event)
    await sales_queue.put(sale_event)

    logger.info(f"[Venda Manual] {data.name} - {data.value} - {data.platform}")
    return {"status": "success"}
