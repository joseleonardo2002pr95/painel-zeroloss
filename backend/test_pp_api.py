import requests
import datetime

token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIzIiwianRpIjoiMWYyYmI5MjE1OGQzMzM5MTk4Y2JjODg4YWNkNDlmZmRjNjliNGZiZGUwNDZmNDY1NjRkYWFmODc2MGYxNTYzNzJiOWFhYTJlYjBmNWI5ZWMiLCJpYXQiOjE3NzQ4MDYyMzcuMDM2Mjk3LCJuYmYiOjE3NzQ4MDYyMzcuMDM2MzAzLCJleHAiOjE5MzI1NzI2MzcuMDE5NCwic3ViIjoiNjEyMjQ0Iiwic2NvcGVzIjpbImludGVncmF0aW9uIl19.zH46jryiESTHguiBwAQgB2Euvx1OHgJZFUhm_vkDmCHzucN5nwsz2tC8jGm4-o8joWTMeg5Jh6qOZ8Cz0TDFKMqq_cXIF999D7GYESr-xDNaR0Nf-R9Lx3jwnZPwPo65JTnbbtg2nposN-3ss0DCBBVcu4k81g7TrDdZrpceZ7HSGEm63ThJ5zm59iX5PbRKyvnr9ARS6TsBViHMtZBpYzZ7puRLJlPPYed_lYbGoGpW0OWq1fVrgBHLwMRVo64tSFUplwMeNzR5SMiXJ3o8VGAUXrYXO4o9hFVgjuORJvkdzUCrtey4CGCMdMjuTvA0u0XhfQHY2cvEU5qkGpwmtScWKWy1r3xjkRn2C_ZsmPor1ZLGqatuk3vXgbvn230ystEzwz9zW_6qlJn_sWIgdOvuvW2gmUD_Kk3B97JBH2eDYaem-RkHkc3aa_EG3eqfhXErfH86GkzklARFlmRv97tdD45ukkmro3MbLqdBzAVzivlFjTFyJtqNIgtZ_yXYqH9bWmr8goDyqSComCmKRbQ2v9TsZWrAP03UXhXvbTFBfRxC_3VKp4nsgQZEJc_fFz0tJjT-RvuumX-3nUnZTXIXDJYvqjpYZIwLG61XMGI49AUnCMzY6Wu9t5g7G1eInzGAlYXaydiB-sl-4g0XdhGcTcUz8d6HW8LmJ5MmBpM"

today = datetime.datetime.now().strftime("%Y-%m-%d")

url = "https://app.perfectpay.com.br/api/v1/sales/get"
headers = {"Authorization": f"Bearer {token}"}
params = {
    "sale_date_start": today,
    "sale_date_end": today,
    "sale_status": 2
}

try:
    resp = requests.post(url, headers=headers, data=params) # sometimes APIs use POST for /get with params
    if resp.status_code == 405:
        resp = requests.get(url, headers=headers, params=params)
    print("Status:", resp.status_code)
    print("Body:", resp.text[:500])
except Exception as e:
    print("Error:", e)
