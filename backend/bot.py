import asyncio
import base64
import io
from aiogram import Bot
import os
from dotenv import load_dotenv
from history import add_record

load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


async def send_broadcast(job_id: str, target_ids, messages, jobs: dict):
    """Sends messages to each target_id and updates the job store."""
    if not TOKEN:
        print("Token do Telegram não configurado.")
        jobs[job_id]["status"] = "done"
        add_record(dict(jobs[job_id]))
        return

    bot = Bot(token=TOKEN)
    try:
        for uid in target_ids:
            # Verifica se o usuário mandou cancelar via API
            if jobs[job_id]["status"] == "canceled":
                print(f"Job {job_id} cancelado pelo usuário.")
                break
            
            success = True
            for msg in messages:
                try:
                    if msg.type == "text":
                        await bot.send_message(chat_id=uid, text=msg.content)

                    elif msg.type == "image_url":
                        await bot.send_photo(chat_id=uid, photo=msg.content)

                    elif msg.type == "image_b64":
                        # Strip the data-URI header (data:image/png;base64,...)
                        header, b64_data = msg.content.split(",", 1)
                        image_bytes = base64.b64decode(b64_data)
                        from aiogram.types import BufferedInputFile
                        await bot.send_photo(
                            chat_id=uid,
                            photo=BufferedInputFile(file=image_bytes, filename="image.jpg"),
                        )

                except Exception as e:
                    print(f"Falha ao enviar para {uid}: {e}")
                    success = False
                    break   # don't send remaining blocks to this user

                await asyncio.sleep(0.05)

            if success:
                jobs[job_id]["sent"] += 1
            else:
                jobs[job_id]["failed"] += 1

            # Persiste progresso parcial a cada 50 usuários
            if (jobs[job_id]["sent"] + jobs[job_id]["failed"]) % 50 == 0:
                add_record(dict(jobs[job_id]))

        # Se não foi cancelado no meio, marcamos como concluído agora
        if jobs[job_id]["status"] != "canceled":
            jobs[job_id]["status"] = "done"
            
        jobs[job_id]["finished_at"] = __import__("datetime").datetime.now().isoformat()
    finally:
        await bot.session.close()
        # Persiste resultado final
        add_record(dict(jobs[job_id]))
