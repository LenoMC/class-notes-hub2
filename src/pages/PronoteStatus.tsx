import { useState } from "react";
import { useAction, useQuery } from "convex/react";
// Adapte ce chemin selon l'emplacement du fichier (il doit pointer vers convex/_generated/api)
import { api } from "../convex/_generated/api";

export default function PronoteStatus() {
  const status = useQuery(api.pronote.status);
  const syncNow = useAction(api.pronoteSync.syncNow);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string | null>(null);

  if (status === undefined) return <p>Chargement…</p>;
  if (status === null) return <p>Accès réservé aux admins (connecte-toi avec ton compte admin).</p>;

  const run = async () => {
    setBusy(true);
    setOut(null);
    try {
      const r = await syncNow({});
      setOut(`OK : ${r.updated} mis à jour, ${r.cancelled} annulés, ${r.unmatched} sans correspondance`);
    } catch (e: any) {
      setOut("Erreur : " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>État de la connexion Pronote</h1>
      {!status.connected ? (
        <p>❌ Pas encore connecté : lance <code>pronoteSync:setup</code>.</p>
      ) : (
        <>
          <p>✅ Connexion enregistrée.</p>
          <p>
            Dernière synchro :{" "}
            {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString("fr-FR") : "jamais"}
          </p>
          {status.lastResult && <p>✅ {status.lastResult}</p>}
          {status.lastError && <p style={{ color: "#dc2626" }}>❌ Dernière erreur : {status.lastError}</p>}
          <button onClick={run} disabled={busy}>
            {busy ? "Synchronisation…" : "Synchroniser maintenant"}
          </button>
          {out && <p>{out}</p>}
        </>
      )}
    </div>
  );
}
