"""
sheets.py — Lê dados de Leads e Clientes do Google Sheets (em tempo real)
com fallback para o arquivo Excel local caso o GOOGLE_SHEET_ID não esteja configurado.

Usa cache interno com TTL para não bater na API do Google a cada requisição.
"""
import os
import time
import threading
import pandas as pd
import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv

load_dotenv()

CREDENTIALS_FILE     = os.getenv("GOOGLE_SHEETS_CREDENTIALS_FILE", "credentials.json")
SHEET_ID             = os.getenv("GOOGLE_SHEET_ID", "").strip()
EXCEL_FILE           = os.getenv("VENDAS_EXCEL_FILE", "")
REFRESH_INTERVAL     = int(os.getenv("SHEETS_REFRESH_INTERVAL", "60"))

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

# ──────────────────────────────────────────────
# Cache compartilhado (thread-safe via lock)
# ──────────────────────────────────────────────
_cache = {
    "data": {"leads": [], "clients": [], "total_leads_rows": 0, "total_clients_rows": 0},
    "last_updated": 0.0,
    "error": None,
}
_lock = threading.Lock()


def _ids_from_column(values: list[list], col_index: int) -> list[str]:
    """Extrai IDs de uma coluna, descartando cabeçalho e valores inválidos."""
    ids = []
    for row in values[1:]:  # pula o cabeçalho
        if len(row) > col_index:
            val = str(row[col_index]).strip()
            # Mantém só dígitos (limpa floats como "12345.0")
            digits = val.replace(".0", "")
            if digits.isdigit():
                ids.append(digits)
    return ids


def _fetch_from_sheets() -> dict:
    """Busca dados diretamente do Google Sheets via gspread."""
    import json
    env_creds = os.getenv("GOOGLE_CREDENTIALS_JSON")
    if env_creds:
        try:
            creds_dict = json.loads(env_creds)
            creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
        except Exception as e:
            print(f"Erro ao parsear GOOGLE_CREDENTIALS_JSON: {e}")
            return {"leads": [], "clients": [], "total_leads_rows": 0, "total_clients_rows": 0}
    else:
        if not os.path.exists(CREDENTIALS_FILE):
             print("credentials.json não encontrado. Configure o GOOGLE_CREDENTIALS_JSON no servidor.")
             return {"leads": [], "clients": [], "total_leads_rows": 0, "total_clients_rows": 0}
        creds = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=SCOPES)
        
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SHEET_ID)

    # ── Leads ──
    ws_leads = sh.worksheet("Leads")
    # Pega todos os valores (retorna lista de listas)
    leads_vals = ws_leads.get_all_values()
    # Descobre a coluna 'User_ID' pelo cabeçalho
    header = [h.strip() for h in leads_vals[0]] if leads_vals else []
    user_id_col = header.index("User_ID") if "User_ID" in header else 3
    all_lead_ids = _ids_from_column(leads_vals, user_id_col)

    # ── Vendas ──
    ws_vendas = sh.worksheet("Vendas")
    vendas_vals = ws_vendas.get_all_values()
    header_v = [h.strip() for h in vendas_vals[0]] if vendas_vals else []
    lead_id_col = header_v.index("Lead_ID") if "Lead_ID" in header_v else 5
    client_ids = list(set(_ids_from_column(vendas_vals, lead_id_col)))

    client_set  = set(client_ids)
    pure_leads  = list(set(x for x in all_lead_ids if x not in client_set))

    # Total bruto de linhas (excluindo cabeçalho)
    total_leads_rows   = len(leads_vals) - 1 if leads_vals else 0
    total_clients_rows = len(vendas_vals) - 1 if vendas_vals else 0

    return {
        "leads": pure_leads,
        "clients": client_ids,
        "total_leads_rows":   total_leads_rows,
        "total_clients_rows": total_clients_rows,
    }


def _fetch_from_excel() -> dict:
    """Lê do arquivo Excel local (fallback)."""
    if not os.path.exists(EXCEL_FILE):
        raise FileNotFoundError(f"Arquivo Excel não encontrado: {EXCEL_FILE}")

    xls = pd.ExcelFile(EXCEL_FILE)

    df_leads   = pd.read_excel(xls, "Leads")
    df_clients = pd.read_excel(xls, "Vendas")

    all_lead_ids = df_leads["User_ID"].dropna().astype(str).tolist()
    client_ids   = df_clients["Lead_ID"].dropna().astype(str).tolist()

    all_lead_ids = [str(int(float(x))) for x in all_lead_ids if x.replace(".0","").isdigit()]
    client_ids   = [str(int(float(x))) for x in client_ids   if x.replace(".0","").isdigit()]

    client_set = set(client_ids)
    pure_leads = list(set(x for x in all_lead_ids if x not in client_set))

    return {
        "leads": pure_leads,
        "clients": list(client_set),
        "total_leads_rows":   len(df_leads),
        "total_clients_rows": len(df_clients),
    }


def _refresh():
    """Atualiza o cache buscando do Google Sheets ou Excel."""
    global _cache
    try:
        if SHEET_ID:
            data = _fetch_from_sheets()
        else:
            data = _fetch_from_excel()
        with _lock:
            _cache["data"]         = data
            _cache["last_updated"] = time.time()
            _cache["error"]        = None
    except Exception as e:
        with _lock:
            _cache["error"] = str(e)
        print(f"[sheets] Erro ao atualizar: {e}")


# ──────────────────────────────────────────────
# Background refresh thread
# ──────────────────────────────────────────────
def _start_background_refresh():
    def loop():
        while True:
            _refresh()
            time.sleep(REFRESH_INTERVAL)
    t = threading.Thread(target=loop, daemon=True)
    t.start()


# Primeira carga e inicia o thread de refresh
_refresh()
_start_background_refresh()


# ──────────────────────────────────────────────
# API pública
# ──────────────────────────────────────────────
def get_audience_data() -> dict:
    with _lock:
        return dict(_cache)  # devolve cópia


def get_last_updated() -> float:
    with _lock:
        return _cache["last_updated"]
