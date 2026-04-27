import asyncio
import base64
import os
from types import SimpleNamespace
from aiogram import Bot
from aiogram.types import BufferedInputFile
from dotenv import load_dotenv
from history import add_record

load_dotenv()
TOKEN      = os.getenv("TELEGRAM_BOT_TOKEN", "")
ADMIN_ID   = int(os.getenv("TELEGRAM_ADMIN_ID", "0"))   # ID do admin para pré-upload


async def test_send_one(chat_id: int, text: str = "✅ Teste de conectividade do bot.") -> dict:
    """Tenta enviar uma mensagem para UM usuário e retorna o resultado detalhado."""
    if not TOKEN:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN não configurado", "token_set": False}
    bot = Bot(token=TOKEN)
    try:
        await bot.send_message(chat_id=chat_id, text=text)
        return {"ok": True, "chat_id": chat_id}
    except Exception as e:
        return {"ok": False, "chat_id": chat_id, "error_type": type(e).__name__, "error": str(e)}
    finally:
        await bot.session.close()


async def _preupload(bot: Bot, messages: list, fallback_uid: int):
    """
    Faz upload de blocos de mídia UMA vez e retorna lista de mensagens
    com file_id no lugar dos bytes brutos.

    - Se TELEGRAM_ADMIN_ID estiver configurado, faz upload para o admin
      (sem contaminar a lista de destinatários).
    - Caso contrário, envia para o primeiro destinatário e retorna seu ID
      para ser marcado como já enviado.

    Retorna: (prepared_messages, already_sent_uid_or_None)
    """
    upload_to = ADMIN_ID if ADMIN_ID else fallback_uid
    already_sent = None if ADMIN_ID else fallback_uid

    prepared = []
    for msg in messages:
        if msg.type == "image_b64":
            header, b64_data = msg.content.split(",", 1)
            sent = await bot.send_photo(
                chat_id=upload_to,
                photo=BufferedInputFile(base64.b64decode(b64_data), filename="image.jpg"),
            )
            file_id = sent.photo[-1].file_id
            prepared.append(SimpleNamespace(type="image_file_id", content=file_id))

        elif msg.type == "video_b64":
            header, b64_data = msg.content.split(",", 1)
            sent = await bot.send_video(
                chat_id=upload_to,
                video=BufferedInputFile(base64.b64decode(b64_data), filename="video.mp4"),
            )
            file_id = sent.video.file_id
            prepared.append(SimpleNamespace(type="video_file_id", content=file_id))

        else:
            prepared.append(msg)   # texto / image_url — sem mudança

    return prepared, already_sent


async def send_broadcast(job_id: str, target_ids, messages, jobs: dict):
    """Sends messages to each target_id and updates the job store."""
    jobs[job_id].setdefault("last_error", None)
    jobs[job_id].setdefault("error_sample", [])

    if not TOKEN:
        err = "TELEGRAM_BOT_TOKEN não configurado nas variáveis de ambiente."
        print(f"[bot] {err}")
        jobs[job_id]["status"]       = "done"
        jobs[job_id]["last_error"]   = err
        jobs[job_id]["error_sample"] = [err]
        add_record(dict(jobs[job_id]))
        return

    # Verifica conectividade antes de iniciar
    try:
        bot = Bot(token=TOKEN)
        me = await bot.get_me()
        print(f"[bot] Conectado como @{me.username} — iniciando disparo para {len(target_ids)} usuários")
    except Exception as e:
        err = f"Falha ao conectar ao bot: {type(e).__name__}: {e}"
        print(f"[bot] {err}")
        jobs[job_id]["status"]       = "done"
        jobs[job_id]["last_error"]   = err
        jobs[job_id]["error_sample"] = [err]
        try:
            await bot.session.close()
        except Exception:
            pass
        add_record(dict(jobs[job_id]))
        return

    try:
        # ── Pré-upload de mídia ─────────────────────────────────────────
        has_media = any(m.type in ("image_b64", "video_b64") for m in messages)
        already_sent_uid = None
        if has_media and target_ids:
            try:
                messages, already_sent_uid = await _preupload(bot, messages, int(target_ids[0]))
                print(f"[bot] Pré-upload concluído — usando file_ids para o disparo")
                if already_sent_uid:
                    # Primeiro usuário já recebeu durante o pré-upload
                    jobs[job_id]["sent"] += 1
            except Exception as e:
                err = f"Falha no pré-upload de mídia: {type(e).__name__}: {e}"
                print(f"[bot] {err}")
                jobs[job_id]["last_error"]   = err
                jobs[job_id]["error_sample"] = [err]
                jobs[job_id]["status"]       = "done"
                jobs[job_id]["finished_at"]  = __import__("datetime").datetime.now().isoformat()
                add_record(dict(jobs[job_id]))
                return

        # ── Loop principal ──────────────────────────────────────────────
        for uid in target_ids:
            if jobs[job_id]["status"] == "canceled":
                print(f"[bot] Job {job_id} cancelado.")
                break

            uid_int = int(uid)

            # Pula o primeiro usuário se ele já recebeu no pré-upload
            if already_sent_uid and uid_int == already_sent_uid:
                continue

            success = True
            for msg in messages:
                try:
                    if msg.type == "text":
                        await bot.send_message(chat_id=uid_int, text=msg.content)

                    elif msg.type == "image_url":
                        await bot.send_photo(chat_id=uid_int, photo=msg.content)

                    elif msg.type == "image_file_id":
                        await bot.send_photo(chat_id=uid_int, photo=msg.content)

                    elif msg.type == "video_file_id":
                        await bot.send_video(chat_id=uid_int, video=msg.content)

                    # Fallback: se por algum motivo chegou aqui com bytes (não deve)
                    elif msg.type == "image_b64":
                        header, b64_data = msg.content.split(",", 1)
                        sent = await bot.send_photo(
                            chat_id=uid_int,
                            photo=BufferedInputFile(base64.b64decode(b64_data), filename="image.jpg"),
                        )
                    elif msg.type == "video_b64":
                        header, b64_data = msg.content.split(",", 1)
                        sent = await bot.send_video(
                            chat_id=uid_int,
                            video=BufferedInputFile(base64.b64decode(b64_data), filename="video.mp4"),
                        )

                except Exception as e:
                    print(f"[bot] Falha uid={uid}: {type(e).__name__}: {e}")
                    jobs[job_id]["last_error"] = str(e)
                    sample = jobs[job_id]["error_sample"]
                    err_key = f"{type(e).__name__}: {str(e)[:120]}"
                    if err_key not in sample and len(sample) < 5:
                        sample.append(err_key)
                    success = False
                    break

                await asyncio.sleep(0.05)

            if success:
                jobs[job_id]["sent"] += 1
            else:
                jobs[job_id]["failed"] += 1

            if (jobs[job_id]["sent"] + jobs[job_id]["failed"]) % 50 == 0:
                add_record(dict(jobs[job_id]))

        if jobs[job_id]["status"] != "canceled":
            jobs[job_id]["status"] = "done"

        jobs[job_id]["finished_at"] = __import__("datetime").datetime.now().isoformat()

    except Exception as outer_e:
        outer_err = f"Erro externo no disparo: {type(outer_e).__name__}: {outer_e}"
        print(f"[bot] {outer_err}")
        jobs[job_id]["last_error"] = outer_err
        jobs[job_id]["error_sample"].append(outer_err[:200])
        jobs[job_id]["status"]      = "done"
        jobs[job_id]["finished_at"] = __import__("datetime").datetime.now().isoformat()
    finally:
        await bot.session.close()
        add_record(dict(jobs[job_id]))
