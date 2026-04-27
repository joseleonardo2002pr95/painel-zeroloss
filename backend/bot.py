"""
bot.py — Disparo via Telegram

Estratégia de envio:
  1. Todos os blocos (texto, imagem, vídeo) são enviados UMA VEZ para o
     chat de staging (TELEGRAM_ADMIN_ID ou o primeiro destinatário).
  2. Para cada usuário, usamos copy_message() — operação 100% server-side
     no Telegram, sem re-upload, sem banner "Encaminhado de".
  3. Resultado: muito mais rápido e sem falhas por tamanho de arquivo.

Variáveis de ambiente:
  TELEGRAM_BOT_TOKEN  — obrigatório
  TELEGRAM_ADMIN_ID   — recomendado; se ausente, usa o primeiro lead como staging
"""

import asyncio
import base64
import os
from aiogram import Bot
from aiogram.types import BufferedInputFile
from dotenv import load_dotenv
from history import add_record

load_dotenv()
TOKEN    = os.getenv("TELEGRAM_BOT_TOKEN", "")
_admin_raw = os.getenv("TELEGRAM_ADMIN_ID", "0").strip()
ADMIN_ID   = int(_admin_raw) if _admin_raw.lstrip("-").isdigit() else 0


# ── Diagnóstico ────────────────────────────────────────────────────────────────

async def test_send_one(chat_id: int, text: str = "✅ Teste de conectividade do bot.") -> dict:
    if not TOKEN:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN não configurado"}
    bot = Bot(token=TOKEN)
    try:
        await bot.send_message(chat_id=chat_id, text=text)
        return {"ok": True, "chat_id": chat_id}
    except Exception as e:
        return {"ok": False, "chat_id": chat_id, "error_type": type(e).__name__, "error": str(e)}
    finally:
        await bot.session.close()


# ── Staging ────────────────────────────────────────────────────────────────────

async def _stage_all(bot: Bot, messages: list, staging_id: int) -> list[dict]:
    """
    Envia cada bloco para o chat de staging e retorna lista de
    {"chat_id": ..., "msg_id": ...} para uso com copy_message().
    """
    staged = []
    for msg in messages:
        if msg.type == "text":
            sent = await bot.send_message(chat_id=staging_id, text=msg.content)
            staged.append({"chat_id": staging_id, "msg_id": sent.message_id})

        elif msg.type == "image_url":
            sent = await bot.send_photo(chat_id=staging_id, photo=msg.content)
            staged.append({"chat_id": staging_id, "msg_id": sent.message_id})

        elif msg.type == "image_b64":
            _, b64 = msg.content.split(",", 1)
            sent = await bot.send_photo(
                chat_id=staging_id,
                photo=BufferedInputFile(base64.b64decode(b64), filename="image.jpg"),
            )
            staged.append({"chat_id": staging_id, "msg_id": sent.message_id})

        elif msg.type == "video_b64":
            _, b64 = msg.content.split(",", 1)
            sent = await bot.send_video(
                chat_id=staging_id,
                video=BufferedInputFile(base64.b64decode(b64), filename="video.mp4"),
            )
            staged.append({"chat_id": staging_id, "msg_id": sent.message_id})

        # file_id legado (não deve aparecer mais, mas mantido por segurança)
        elif msg.type == "image_file_id":
            sent = await bot.send_photo(chat_id=staging_id, photo=msg.content)
            staged.append({"chat_id": staging_id, "msg_id": sent.message_id})

        elif msg.type == "video_file_id":
            sent = await bot.send_video(chat_id=staging_id, video=msg.content)
            staged.append({"chat_id": staging_id, "msg_id": sent.message_id})

    return staged


# ── Disparo principal ──────────────────────────────────────────────────────────

async def send_broadcast(job_id: str, target_ids: list, messages: list, jobs: dict):
    jobs[job_id].setdefault("last_error", None)
    jobs[job_id].setdefault("error_sample", [])

    if not TOKEN:
        err = "TELEGRAM_BOT_TOKEN não configurado."
        jobs[job_id].update({"status": "done", "last_error": err, "error_sample": [err]})
        add_record(dict(jobs[job_id]))
        return

    # Conecta e verifica token
    try:
        bot = Bot(token=TOKEN)
        me = await bot.get_me()
        print(f"[bot] @{me.username} — {len(target_ids)} destinatários")
    except Exception as e:
        err = f"Falha ao conectar: {type(e).__name__}: {e}"
        jobs[job_id].update({"status": "done", "last_error": err, "error_sample": [err]})
        try: await bot.session.close()
        except Exception: pass
        add_record(dict(jobs[job_id]))
        return

    try:
        # ── 1. Staging ─────────────────────────────────────────────────
        staging_id    = ADMIN_ID if ADMIN_ID else int(target_ids[0])
        skip_first    = (not ADMIN_ID)   # primeiro lead foi usado como staging

        jobs[job_id]["phase"] = "staging"
        print(f"[bot] Staging para chat_id={staging_id}...")
        try:
            staged = await _stage_all(bot, messages, staging_id)
            jobs[job_id]["phase"] = "sending"
            print(f"[bot] {len(staged)} bloco(s) staged — iniciando copy_message loop")
        except Exception as e:
            err = f"Falha no staging: {type(e).__name__}: {e}"
            print(f"[bot] {err}")
            jobs[job_id].update({"status": "done", "last_error": err, "error_sample": [err],
                                 "finished_at": __import__("datetime").datetime.now().isoformat()})
            add_record(dict(jobs[job_id]))
            return

        # Se staging foi para o primeiro lead, ele já recebeu todas as msgs
        if skip_first:
            jobs[job_id]["sent"] += 1

        # ── 2. Loop de copy_message ─────────────────────────────────────
        for uid in target_ids:
            if jobs[job_id]["status"] == "canceled":
                print(f"[bot] Job {job_id} cancelado.")
                break

            uid_int = int(uid)
            if skip_first and uid_int == staging_id:
                continue   # já enviado no staging

            success = True
            for s in staged:
                try:
                    await bot.copy_message(
                        chat_id=uid_int,
                        from_chat_id=s["chat_id"],
                        message_id=s["msg_id"],
                    )
                except Exception as e:
                    print(f"[bot] uid={uid} err={type(e).__name__}: {e}")
                    jobs[job_id]["last_error"] = str(e)
                    sample = jobs[job_id]["error_sample"]
                    key = f"{type(e).__name__}: {str(e)[:120]}"
                    if key not in sample and len(sample) < 5:
                        sample.append(key)
                    success = False
                    break

                await asyncio.sleep(0.03)   # ~33 msg/s por bloco

            jobs[job_id]["sent" if success else "failed"] += 1

            done = jobs[job_id]["sent"] + jobs[job_id]["failed"]
            if done % 50 == 0:
                add_record(dict(jobs[job_id]))

        if jobs[job_id]["status"] != "canceled":
            jobs[job_id]["status"] = "done"
        jobs[job_id]["finished_at"] = __import__("datetime").datetime.now().isoformat()

    except Exception as outer:
        err = f"Erro externo: {type(outer).__name__}: {outer}"
        print(f"[bot] {err}")
        jobs[job_id].update({"status": "done", "last_error": err,
                             "finished_at": __import__("datetime").datetime.now().isoformat()})
        jobs[job_id]["error_sample"].append(err[:200])
    finally:
        await bot.session.close()
        add_record(dict(jobs[job_id]))
