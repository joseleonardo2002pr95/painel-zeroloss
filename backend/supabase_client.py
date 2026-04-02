import os
import logging

logger = logging.getLogger("uvicorn.error")

_client = None

def get_supabase():
    """
    Retorna o cliente Supabase se configurado via variáveis de ambiente,
    ou None se não configurado (fallback para SQLite).

    Variáveis de ambiente necessárias:
      SUPABASE_URL  = https://<seu-projeto>.supabase.co
      SUPABASE_KEY  = sb_secret_... (chave secreta / service role)
    """
    global _client
    if _client is not None:
        return _client

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()

    if not url or not key:
        logger.warning(
            "[Supabase] SUPABASE_URL ou SUPABASE_KEY não configurados. "
            "Usando SQLite como banco de dados local."
        )
        return None

    try:
        from supabase import create_client
        _client = create_client(url, key)
        logger.info("✅ [Supabase] Conectado com sucesso!")
        return _client
    except Exception as e:
        logger.error(f"❌ [Supabase] Erro ao conectar: {e}")
        return None


def is_supabase_available() -> bool:
    return get_supabase() is not None
