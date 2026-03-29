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
    Recebe o Webhook da PerfectPay.
    Geralmente enviam form-data no PerfectPay, então pegamos via form().
    A documentação oficial pede para checar sale_status_enum == 2 (Aprovada) 
    ou tratamos status == 'Aprovada'.
    """
    try:
        # A PerfectPay envia os dados como application/x-www-form-urlencoded
        form = await request.form()
        
        # Filtra apenas transações aprovadas/pagas
        status = form.get("sale_status_enum")
        
        # O 2 significa "Aprovada" na PerfectPay
        if status != "2": 
            return {"message": "Ignorado - não aprovado"}
            
        # Extrai os dados essenciais para o Dashboard
        # Campos variam, mas costumam mandar: sale_amount, customer_name, product_name, code
        tx_id = form.get("code", "N/A")
        name = form.get("customer_name", "Cliente")
        product = form.get("product_name", "Produto Oculto")
        
        # O valor na PP vem com vírgula as vezes ou string, precisa tratar
        val_str = form.get("sale_amount", "0")
        try:
            val = float(str(val_str).replace(',', '.'))
        except:
            val = 0.0

        sale_event = {
            "id": f"pp_{tx_id}",
            "name": name,
            "product": product,
            "value": val,
            "platform": "PerfectPay"
        }
        
        # Envia a notificação pro frontend
        await sales_queue.put(sale_event)
        
        # Adiciona no histórico rápido da memória
        recent_sales.append(sale_event)
        if len(recent_sales) > 50:
            recent_sales.pop(0)

        logger.info(f"[PerfectPay] Venda Aprovada Webhook recebida: {name} comprou {product} por {val}")

        return {"status": "ok"}
        
    except Exception as e:
        logger.error(f"Erro no webhook da PerfectPay: {e}")
        # Mesmo com erro de parse, retorna 200 pra plataforma não ficar tentando enviar repetidamente
        return {"status": "error", "message": str(e)}

@router.post("/webhooks/payt")
async def payt_webhook(request: Request):
    """
    Recebe o Webhook da Payt. 
    Geralmente envia via JSON. 
    Status de aprovação precisa ser validado.
    """
    try:
        body = await request.json()
        
        # Normalmente o status aprovado na payt vem como 'approved', 'paid', ou id de status.
        # Vamos assumir 'approved' ou 'aprovada' como base. Pode precisar ajuste baseado no log real
        status = str(body.get("status", "")).lower()
        if status not in ["approved", "paid", "aprovada", "1", "2"]:
            # Se a payt manda 1 para aprovado, está coberto.
            # logger.info(f"Payt ignorado (status: {status})")
            pass
            
        # Tenta extrair dados do body (Exemplo genérico, varia conforme o payload real da Payt)
        tx_id = body.get("transaction", body.get("id", "N/A"))
        
        # Payt costuma mandar customer como objeto
        customer = body.get("customer", {})
        name = customer.get("name", body.get("customer_name", "Cliente"))
        
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
        body = await request.json()
        
        status = str(body.get("status", "")).lower()
        # Kirvano usualmente manda 'approved'
        if status not in ["approved", "paid", "aprovado"]:
            pass
            
        tx_id = body.get("transaction_id", body.get("id", "N/A"))
        
        buyer = body.get("buyer", {})
        name = buyer.get("name", body.get("customer_name", "Cliente"))
        
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
