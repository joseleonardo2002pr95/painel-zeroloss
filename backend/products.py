"""
products.py – Gestão de produtos e comissões

Tabela necessária no Supabase:
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      hash TEXT UNIQUE,                            -- product_hash da Paradise
      type TEXT NOT NULL DEFAULT 'coprodutor',     -- 'produtor' | 'coprodutor'
      commission_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
      platform TEXT DEFAULT 'Paradise',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Adicionar coluna hash em tabela existente:
    ALTER TABLE products ADD COLUMN IF NOT EXISTS hash TEXT UNIQUE;
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging

from supabase_client import get_supabase

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

# ── Produtos com hashes ────────────────────────────────────────────────────────
INITIAL_PRODUCTS = [
    # Produtor — Circle Digital é dono, co-produtor leva 16,66%
    {"name": "ZeroLoss Virtual",      "hash": "prod_e76afa5c3d120331", "type": "produtor",   "commission_percent": 83.34, "platform": "Paradise"},
    # Coprodução — Circle Digital recebe % sobre o líquido
    {"name": "Delay",                 "hash": "prod_0aea65cba434babd", "type": "coprodutor", "commission_percent": 70.0,  "platform": "Paradise"},
    {"name": "Gabriel Virtual",       "hash": "prod_191baaa0476acb0c", "type": "coprodutor", "commission_percent": 56.0,  "platform": "Paradise"},
    {"name": "Alavancagem Virtual",   "hash": "prod_c2d197a7924f1910", "type": "coprodutor", "commission_percent": 57.0,  "platform": "Paradise"},
    {"name": "Duplo Green",           "hash": "prod_1a0b5c845100dd24", "type": "coprodutor", "commission_percent": 80.0,  "platform": "Paradise"},
    {"name": "Fut Cashout",           "hash": "prod_99fafbc2a96c8333", "type": "coprodutor", "commission_percent": 80.0,  "platform": "Paradise"},
    {"name": "Gabriel Cashout",       "hash": "prod_27ef277e291b278f", "type": "coprodutor", "commission_percent": 67.0,  "platform": "Paradise"},
    {"name": "Breno Futebol Virtual", "hash": "prod_2b5bc174f21dd96d", "type": "coprodutor", "commission_percent": 67.0,  "platform": "Paradise"},
    {"name": "Grupo Lancamento",      "hash": "prod_696727e36448b777", "type": "coprodutor", "commission_percent": 100.0, "platform": "Paradise"},
]


def seed_products():
    """Insere/atualiza produtos no Supabase (idempotente por hash)."""
    sb = get_supabase()
    if not sb:
        return
    try:
        for p in INITIAL_PRODUCTS:
            sb.table("products").upsert(p, on_conflict="hash").execute()
        logger.info("✅ [Products] Produtos verificados/inseridos por hash.")
    except Exception as e:
        logger.error(f"❌ [Products] Erro no seed: {e}")


def get_product_by_hash(product_hash: str) -> Optional[dict]:
    """Busca produto pelo hash da Paradise (lookup exato e rápido)."""
    if not product_hash:
        return None
    sb = get_supabase()
    if not sb:
        return None
    try:
        res = sb.table("products").select("*").eq("hash", product_hash).eq("is_active", True).limit(1).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"[Products] Erro ao buscar hash '{product_hash}': {e}")
        return None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/api/products")
def list_products():
    sb = get_supabase()
    if not sb:
        return {"products": [], "error": "Supabase não configurado"}
    try:
        res = sb.table("products").select("*").eq("is_active", True).order("type").order("name").execute()
        return {"products": res.data or []}
    except Exception as e:
        logger.error(f"[Products] list: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ProductPayload(BaseModel):
    name: str
    hash: Optional[str] = None
    type: str = "coprodutor"
    commission_percent: float = 100.0
    platform: str = "Paradise"


@router.post("/api/products")
def create_product(payload: ProductPayload):
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="Supabase não configurado")
    try:
        data = {
            "name":               payload.name,
            "type":               payload.type,
            "commission_percent": payload.commission_percent,
            "platform":           payload.platform,
            "is_active":          True,
        }
        if payload.hash:
            data["hash"] = payload.hash
        res = sb.table("products").insert(data).execute()
        return {"status": "ok", "product": res.data[0] if res.data else {}}
    except Exception as e:
        logger.error(f"[Products] create: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ProductUpdatePayload(BaseModel):
    commission_percent: Optional[float] = None
    type: Optional[str] = None
    name: Optional[str] = None
    hash: Optional[str] = None


@router.patch("/api/products/{product_id}")
def update_product(product_id: int, payload: ProductUpdatePayload):
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="Supabase não configurado")
    try:
        updates = {k: v for k, v in payload.dict().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
        sb.table("products").update(updates).eq("id", product_id).execute()
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Products] update {product_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/products/{product_id}")
def delete_product(product_id: int):
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="Supabase não configurado")
    try:
        sb.table("products").update({"is_active": False}).eq("id", product_id).execute()
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"[Products] delete {product_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
