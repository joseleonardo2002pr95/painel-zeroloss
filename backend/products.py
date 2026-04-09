"""
products.py – Gestão de produtos e comissões

Tabela necessária no Supabase:
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'coprodutor',  -- 'produtor' | 'coprodutor'
      commission_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
      platform TEXT DEFAULT 'Paradise',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging

from supabase_client import get_supabase

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

# ── Produtos iniciais (seed) ───────────────────────────────────────────────────
INITIAL_PRODUCTS = [
    # Produtor — Circle Digital é dono, co-produtor leva 16,66%
    {"name": "ZeroLoss Virtual",     "type": "produtor",   "commission_percent": 83.34, "platform": "Paradise"},
    # Coprodução — Circle Digital recebe % sobre o líquido
    {"name": "DELAY",                "type": "coprodutor", "commission_percent": 70.0,  "platform": "Paradise"},
    {"name": "GABRIEL VIRTUAL",      "type": "coprodutor", "commission_percent": 56.0,  "platform": "Paradise"},
    {"name": "ALVANCAGEM VIRTUAL",   "type": "coprodutor", "commission_percent": 57.0,  "platform": "Paradise"},
    {"name": "DUPLO GREEN",          "type": "coprodutor", "commission_percent": 80.0,  "platform": "Paradise"},
    {"name": "FUT CASHOUT",          "type": "coprodutor", "commission_percent": 80.0,  "platform": "Paradise"},
    {"name": "GABRIEL CASHOUT",      "type": "coprodutor", "commission_percent": 67.0,  "platform": "Paradise"},
    {"name": "Breno Futebol Virtual","type": "coprodutor", "commission_percent": 67.0,  "platform": "Paradise"},
]


def seed_products():
    """Insere produtos iniciais no Supabase (idempotente por nome)."""
    sb = get_supabase()
    if not sb:
        return
    try:
        for p in INITIAL_PRODUCTS:
            sb.table("products").upsert(p, on_conflict="name").execute()
        logger.info("✅ [Products] Produtos iniciais verificados/inseridos.")
    except Exception as e:
        logger.error(f"❌ [Products] Erro no seed: {e}")


def get_product_by_name(name: str) -> Optional[dict]:
    """Busca produto por nome (case-insensitive, busca parcial)."""
    sb = get_supabase()
    if not sb:
        return None
    try:
        res = sb.table("products").select("*").eq("is_active", True).execute()
        products = res.data or []
        name_lower = name.lower().strip()
        # Busca exata primeiro
        for p in products:
            if p["name"].lower().strip() == name_lower:
                return p
        # Busca parcial (produto contém o nome ou vice-versa)
        for p in products:
            pn = p["name"].lower().strip()
            if pn in name_lower or name_lower in pn:
                return p
        return None
    except Exception as e:
        logger.error(f"[Products] Erro ao buscar produto '{name}': {e}")
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
    type: str = "coprodutor"           # 'produtor' | 'coprodutor'
    commission_percent: float = 100.0
    platform: str = "Paradise"


@router.post("/api/products")
def create_product(payload: ProductPayload):
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="Supabase não configurado")
    try:
        res = sb.table("products").insert({
            "name":               payload.name,
            "type":               payload.type,
            "commission_percent": payload.commission_percent,
            "platform":           payload.platform,
            "is_active":          True,
        }).execute()
        return {"status": "ok", "product": res.data[0] if res.data else {}}
    except Exception as e:
        logger.error(f"[Products] create: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ProductUpdatePayload(BaseModel):
    commission_percent: Optional[float] = None
    type: Optional[str] = None
    name: Optional[str] = None


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
