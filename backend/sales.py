from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
import asyncio
import json
import logging

router = APIRouter()

# Fila assíncrona para enviar dados de vendas recebidos via webhook para os clientes SSE conectados
sales_queue = asyncio.Queue()

# Histórico em memória das últimas vendas para quem se conectar agora (opcional, mantendo max 50)
recent_sales = []

logger = logging.getLogger("uvicorn.error")

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
        
        await sales_queue.put(sale_event)
        
        recent_sales.append(sale_event)
        if len(recent_sales) > 50:
            recent_sales.pop(0)

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
        raw_body = await request.json()
        body = raw_body.get("data", raw_body) # Fallback para caso venha encapsulado
        
        status = str(body.get("status", raw_body.get("event", ""))).lower()
        if status not in ["approved", "paid", "aprovada", "1", "2"]:
            pass
            
        tx_id = body.get("transaction", body.get("id", body.get("transaction_id", "N/A")))
        
        customer = body.get("customer", body.get("buyer", {}))
        name = customer.get("name", customer.get("full_name", body.get("customer_name", "Cliente")))
        
        product_obj = body.get("product", {})
        product = product_obj.get("name", body.get("product_name", "Produto Oculto"))
        
        val = body.get("price", body.get("amount", body.get("value", 0.0)))
        try:
            val = float(val)
        except:
            val = 0.0
            
        sale_event = {
            "id": f"payt_{tx_id}",
            "name": name,
            "product": product,
            "value": val,
            "platform": "Payt"
        }
        
        await sales_queue.put(sale_event)
        recent_sales.append(sale_event)
        if len(recent_sales) > 50: recent_sales.pop(0)

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
            pass
            
        tx_id = body.get("transaction_id", body.get("id", "N/A"))
        
        buyer = body.get("buyer", body.get("customer", {}))
        name = buyer.get("name", buyer.get("full_name", body.get("customer_name", "Cliente")))
        
        product_obj = body.get("product", {})
        product = product_obj.get("name", body.get("product_name", "Produto Oculto"))
        
        val = body.get("amount", body.get("value", body.get("price", 0.0)))
        try:
            val = float(val)
        except:
            val = 0.0
            
        sale_event = {
            "id": f"kirvano_{tx_id}",
            "name": name,
            "product": product,
            "value": val,
            "platform": "Kirvano"
        }
        
        await sales_queue.put(sale_event)
        recent_sales.append(sale_event)
        if len(recent_sales) > 50: recent_sales.pop(0)

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
        
        await sales_queue.put(sale_event)
        recent_sales.append(sale_event)
        if len(recent_sales) > 50: recent_sales.pop(0)

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
    await sales_queue.put(sale_event)
    recent_sales.append(sale_event)
    if len(recent_sales) > 50: recent_sales.pop(0)

    logger.info(f"[Venda Manual] {data.name} - {data.value} - {data.platform}")
    return {"status": "success"}
