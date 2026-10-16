import os, sys, requests, pronotepy
from datetime import date, timedelta

BASE = os.environ["CONVEX_SITE_URL"]
H = {"x-sync-secret": os.environ["PRONOTE_SYNC_SECRET"]}

def api(method, path, payload=None):
    r = requests.request(method, f"{BASE}{path}", headers=H, json=payload, timeout=60)
    r.raise_for_status()
    return r.json()

failed = False
connections = api("GET", "/pronote/credentials")["connections"]

for c in connections:
    label = c["label"]
    try:
        client = pronotepy.Client.token_login(c["url"], c["username"], c["token"], c["deviceUUID"])
        if not client.logged_in:
            raise RuntimeError("token_login a échoué (jeton expiré ? refaire le setup)")

        # Le jeton a changé : on le sauvegarde tout de suite
        api("POST", "/pronote/credentials",
            {"id": c["id"], "token": client.password, "username": client.username})

        monday = date.today() - timedelta(days=date.today().weekday())
        lessons = client.lessons(monday, monday + timedelta(days=21))  # semaine actuelle + 2 suivantes

        out = []
        for l in lessons:
            subject = l.subject.name if l.subject else None
            if not subject or not l.start or not l.end:
                continue
            out.append({
                "date": l.start.strftime("%Y-%m-%d"),
                "start": l.start.strftime("%H:%M"),
                "end": l.end.strftime("%H:%M"),
                "subject": subject,
                "teacher": l.teacher_name or None,
                "room": l.classroom or None,
                "color": l.background_color or None,
                "cancelled": bool(l.canceled),
            })
        out = [{k: v for k, v in d.items() if v is not None} for d in out]

        print(f"[{label}]", api("POST", "/pronote/lessons", {"authId": c["id"], "lessons": out}))
    except Exception as e:
        failed = True
        print(f"[{label}] ERREUR : {e}")
        try:
            api("POST", "/pronote/lessons", {"authId": c["id"], "error": f"{e}"})
        except Exception:
            pass

if failed:
    sys.exit(1)
