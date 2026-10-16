import os, json, requests, pronotepy

BASE = os.environ["CONVEX_SITE_URL"]
H = {"x-sync-secret": os.environ["PRONOTE_SYNC_SECRET"]}

qr = json.loads(os.environ["QR"])
client = pronotepy.Client.qrcode_login(qr, os.environ["PIN"], "classheure-gh")
assert client.logged_in

creds = client.export_credentials()
print("DEBUG nb valeurs:", len(creds))

url = client.pronote_url
username = client.username
token = client.password
uuid = client.uuid

r = requests.post(f"{BASE}/pronote/setup", headers=H, json={
    "url": url, "username": username, "token": token, "deviceUUID": uuid,
    "classId": os.environ["CLASS_ID"], "adminId": os.environ["ADMIN_ID"],
    "label": os.environ["LABEL"],
})
print("Réponse Convex:", r.status_code, r.text)
r.raise_for_status()
print("Enregistré dans Convex")
