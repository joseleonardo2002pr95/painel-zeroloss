"""
history.py — Persistência de histórico de disparos em arquivo JSON.
Os dados sobrevivem ao reinício do servidor.
"""
import json
import os
import threading
from datetime import datetime

HISTORY_FILE = os.path.join(os.path.dirname(__file__), "broadcast_history.json")
_lock = threading.Lock()


def _load() -> list:
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save(records: list):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def add_record(job: dict):
    """Salva ou atualiza um registro de disparo no arquivo de histórico."""
    with _lock:
        records = _load()
        # Atualiza se já existe, senão adiciona
        for i, r in enumerate(records):
            if r.get("job_id") == job.get("job_id"):
                records[i] = job
                _save(records)
                return
        records.insert(0, job)   # mais recente primeiro
        _save(records)


def get_records(limit: int = 50) -> list:
    with _lock:
        return _load()[:limit]
