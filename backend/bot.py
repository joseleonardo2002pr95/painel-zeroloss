import asyncio
import base64
import io
from aiogram import Bot
import os
from dotenv import load_dotenv
from history import add_record

load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


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


async def send_broadcast(job_id: str, target_ids, messages, jobs: dict):
    """Sends messages to each target_id and updates the job store."""
    # Garante campos de debug no job
    jobs[job_id].setdefault("last_error", None)
    jobs[job_id].setdefault("error_sample", [])

    if not TOKEN:
        err = "TELEGRAM_BOT_TOKEN não configurado nas variáveis de ambiente."
        print(f"[bot] {err}")
        jobs[job_id]["status"] = "done"
        jobs[job_id]["last_error"] = err
        jobs[job_id]["error_sample"] = [err]
        add_record(dict(jobs[job_id]))
        return

    # Testa o token antes de disparar para todos
    try:
        bot = Bot(token=TOKEN)
        me = await bot.get_me()
        print(f"[bot] Conectado como @{me.username} (id={me.id})")
    except Exception as e:
        err = f"Falha ao conectar ao bot: {type(e).__name__}: {e}"
        print(f"[bot] {err}")
        jobs[job_id]["status"] = "done"
        jobs[job_id]["last_error"] = err
        jobs[job_id]["error_sample"] = [err]
        try:
            await bot.session.close()
        except Exception:
            pass
        add_record(dict(jobs[job_id]))
        return

    try:
        for uid in target_ids:
            # Verifica se o usuário mandou cancelar via API
            if jobs[job_id]["status"] == "canceled":
                print(f"Job {job_id} cancelado pelo usuário.")
                break

            success = True
            for msg in messages:
                try:
                    uid_int = int(uid)  # Telegram exige inteiro
                    if msg.type == "text":
                        await bot.send_message(chat_id=uid_int, text=msg.content)

                    elif msg.type == "image_url":
                        await bot.send_photo(chat_id=uid_int, photo=msg.content)

                    elif msg.type == "image_b64":
                        header, b64_data = msg.content.split(",", 1)
                        image_bytes = base64.b64decode(b64_data)
                        from aiogram.types import BufferedInputFile
                        await bot.send_photo(
                            chat_id=uid_int,
                            photo=BufferedInputFile(file=image_bytes, filename="image.jpg"),
                        )

                    elif msg.type == "video_b64":
                        header, b64_data = msg.content.split(",", 1)
                        video_bytes = base64.b64decode(b64_data)
                        from aiogram.types import BufferedInputFile
                        await bot.send_video(
                            chat_id=uid_int,
                            video=BufferedInputFile(file=video_bytes, filename="video.mp4"),
                        )

                except Exception as e:
                    err_msg = f"uid={uid} | {type(e).__name__}: {e}"
                    print(f"[bot] Falha: {err_msg}")
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

            # Persiste progresso parcial a cada 50 usuários
            if (jobs[job_id]["sent"] + jobs[job_id]["failed"]) % 50 == 0:
                add_record(dict(jobs[job_id]))

        if jobs[job_id]["status"] != "canceled":
            jobs[job_id]["status"] = "done"

        jobs[job_id]["finished_at"] = __import__("datetime").datetime.now().isoformat()
    except Exception as outer_e:
        # Erro inesperado fora do loop (ex: falha de rede global)
        outer_err = f"Erro externo no disparo: {type(outer_e).__name__}: {outer_e}"
        print(f"[bot] {outer_err}")
        jobs[job_id]["last_error"] = outer_err
        jobs[job_id]["error_sample"].append(outer_err[:200])
        jobs[job_id]["status"] = "done"
        jobs[job_id]["finished_at"] = __import__("datetime").datetime.now().isoformat()
    finally:
        await bot.session.close()
        add_record(dict(jobs[job_id]))
