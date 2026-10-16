import os, requests, pronotepy
from datetime import date, timedelta

BASE = os.environ["CONVEX_SITE_URL"]
H = {"x-sync-secret": os.environ["PRONOTE_SYNC_SECRET"]}

def post(path, payload):
    r = requests.post(f"{BASE}{path}", headers=H, json=payload, timeout=30)
    r.raise_for_status()
    return r.json()

try:
    c = requests.get(f"{BASE}/pronote/credentials", headers=H, timeout=30)
    c.raise_for_status()
    c = c.json()

    client = pronotepy.Client.token_login(c["url"], c["username"], c["token"], c["deviceUUID"])
    if not client.logged_in:
        raise RuntimeError("token_login a échoué (jeton expiré ? relance setup.py)")

    # TOUT DE SUITE : le jeton a changé, on le sauvegarde avant de faire autre chose
    post("/pronote/credentials", {"token": client.password, "username": client.username})

    monday = date.today() - timedelta(days=date.today().weekday())
    lessons = client.lessons(monday, monday + timedelta(days=21))   # semaine actuelle + 2 suivantes

    out = []
    for l in lessons:
        subject = l.subject.name if l.subject else None
        if not subject or not l.start or not l.end:
            continue
        out.append({
            "date": l.start.strftime("%Y-%m-%d"),
            "start": l.start.strftime("%H:%M"),   # heure locale, pas d'UTC
            "end": l.end.strftime("%H:%M"),
            "subject": subject,
            "teacher": l.teacher_name or None,
            "room": l.classroom or None,
            "color": l.background_color or None,
            "cancelled": bool(l.canceled),
        })
    # les valeurs None deviennent null en JSON : on les retire pour v.optional
    out = [{k: v for k, v in d.items() if v is not None} for d in out]

    print(post("/pronote/lessons", {"lessons": out}))
except Exception as e:
    try:
        post("/pronote/lessons", {"error": str(e)})
    finally:
        raise
