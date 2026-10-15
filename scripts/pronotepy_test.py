import os, json
from datetime import date, timedelta
import pronotepy

qr = json.loads(os.environ["QR"])
client = pronotepy.Client.qrcode_login(qr, os.environ["PIN"], "classheure-gh")
print("CONNEXION OK :", client.logged_in)

cours = client.lessons(date.today(), date.today() + timedelta(days=7))
print(len(cours), "cours trouvés cette semaine")
