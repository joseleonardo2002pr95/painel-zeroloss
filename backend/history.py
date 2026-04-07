"""
history.py — Persistência de histórico de disparos.
Primário: Supabase (persiste entre redeploys).
Fallback: arquivo JSON local.

Tabela necessária no Supabase:
    CREATE TABLE IF NOT EXISTS broadcast_history (
      job_id TEXT PRIMARY KEY,
      target TEXT,
      status TEXT,
      total INTEGER DEFAULT 0,
      sent INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
"""
import json
import os
import threading
from datetime import datetime

from supabase_client import get_supabase

HISTORY_FILE = os.path.join(os.path.dirname(__file__), "broadcast_history.json")
_lock = threading.Lock()


# ── Fallback: arquivo JSON ────────────────────────────────────────────────────

def _load_file() -> list:
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_file(records: list):
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


# ── Interface principal ───────────────────────────────────────────────────────

def add_record(job: dict):
    """Salva ou atualiza um registro de disparo (Supabase + arquivo local)."""
    sb = get_supabase()
    if sb:
        try:
            row = {
                "job_id":      job.get("job_id"),
                "target":      job.get("target", ""),
                "status":      job.get("status", "running"),
                "total":       job.get("total", 0),
                "sent":        job.get("sent", 0),
                "failed":      job.get("failed", 0),
                "started_at":  job.get("started_at"),
                "finished_at": job.get("finished_at"),
                "updated_at":  datetime.utcnow().isoformat(),
            }
            sb.table("broadcast_history").upsert(row, on_conflict="job_id").execute()
        except Exception as e:
            import logging
            logging.getLogger("uvicorn.error").error(f"[History/Supabase] {e}")

    # Sempre salva no arquivo também (fallback)
    with _lock:
        records = _load_file()
        for i, r in enumerate(records):
            if r.get("job_id") == job.get("job_id"):
                records[i] = job
                _save_file(records)
                return
        records.insert(0, job)
        _save_file(records)


def get_records(limit: int = 50) -> list:
    """Busca registros do Supabase (primário) ou arquivo local (fallback)."""
    sb = get_supabase()
    if sb:
        try:
            res = sb.table("broadcast_history") \
                .select("*") \
                .order("started_at", desc=True) \
                .limit(limit) \
                .execute()
            return res.data or []
        except Exception as e:
            import logging
            logging.getLogger("uvicorn.error").error(f"[History/Supabase] get_records: {e}")

    # Fallback: arquivo local
    with _lock:
        return _load_file()[:limit]
