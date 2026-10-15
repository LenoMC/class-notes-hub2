import * as pawnote from "pawnote";
import { execFileSync } from "node:child_process";

const { JETON, LOGIN, PIN } = process.env;
const url = "https://0762123v.index-education.net/pronote/mobile.eleve.html";
const deviceUUID = "classheure-convex";

const handle = pawnote.createSessionHandle();
const refresh = await pawnote.loginQrCode(handle, {
  deviceUUID,
  pin: PIN,
  qr: { jeton: JETON, login: LOGIN, url },
});
console.log("CONNEXION OK", refresh.kind, refresh.username);

execFileSync("npx", [
  "convex", "run", "pronote:saveAuth",
  JSON.stringify({
    url: refresh.url,
    kind: refresh.kind,
    username: refresh.username,
    token: refresh.token,
    deviceUUID,
    classId: "k578vg405r8rb1rth9ve90zbvs8f732k",
    adminId: "kh76rz7eykt31s1ja0vgpjbtq98f6g0n",
  }),
], { stdio: "inherit" });
console.log("Jeton enregistré dans Convex.");
