import os, json, requests, pronotepy

BASE = os.environ["CONVEX_SITE_URL"]          # https://effervescent-seahorse-172.eu-west-1.convex.site
H = {"x-sync-secret": os.environ["PRONOTE_SYNC_SECRET"]}

qr = json.loads(os.environ["QR"])
client = pronotepy.Client.qrcode_login(qr, os.environ["PIN"], "classheure-gh")
assert client.logged_in

url, username, token, uuid = client.export_credentials()
r = requests.post(f"{BASE}/pronote/setup", headers=H, json={
    "url": url, "username": username, "token": token, "deviceUUID": uuid,
    "classId": os.environ["CLASS_ID"], "adminId": os.environ["ADMIN_ID"],
})
r.raise_for_status()
print("Enregistré dans Convex")
