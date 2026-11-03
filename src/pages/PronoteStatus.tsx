import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react";

type Mode = "refresh" | "reinit";

export default function PronoteStatus() {
  const status = useQuery(api.pronote.status);
  const syncNow = useAction(api.pronoteTrigger.syncNow);
  const [busy, setBusy] = useState<Mode | null>(null);
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);

  if (status === undefined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-6 space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Accès réservé aux admins. Connecte-toi avec ton compte admin.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard">Retour</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const run = async (mode: Mode) => {
    if (
      mode === "reinit" &&
      !window.confirm(
        "Réinitialiser va modifier les cours de base (prof, salle, matière) pour qu'ils soient comme sur Pronote. Continuer ?",
      )
    ) {
      return;
    }
    setBusy(mode);
    setOut(null);
    try {
      const r = await syncNow({ mode });
      setOut({ ok: true, text: r.note });
    } catch (e: any) {
      setOut({ ok: false, text: e?.data ?? e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
        <div className="space-y-1">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Tableau de bord
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Connexion Pronote</h1>
          <p className="text-sm text-muted-foreground">
            Synchronisation de l'emploi du temps : annulations, remplacements et mise à jour des cours.
          </p>
        </div>

        {!status.connected ? (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Pas encore connecté</p>
                <p className="text-xs text-muted-foreground">
                  Lance le workflow « Pronote setup » sur GitHub avec un nouveau QR code.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                Connecté à Pronote
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {status.connections.map((c) => (
                <div
                  key={c.label}
                  className="rounded-lg border border-border p-3 space-y-1.5 text-sm"
                >
                  <div className="font-medium capitalize">{c.label}</div>
                  <div className="text-xs text-muted-foreground">
                    Dernière synchro :{" "}
                    {c.lastSyncAt
                      ? new Date(c.lastSyncAt).toLocaleString("fr-FR", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "jamais"}
                  </div>
                  {c.lastResult && (
                    <div className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{c.lastResult}</span>
                    </div>
                  )}
                  {c.lastError && (
                    <div className="flex items-start gap-2 text-xs text-destructive">
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span className="break-words">{c.lastError}</span>
                    </div>
                  )}
                </div>
              ))}

              <div className="grid gap-3 sm:grid-cols-2 pt-1">
                <div className="space-y-1.5">
                  <Button className="w-full" onClick={() => run("refresh")} disabled={busy !== null}>
                    {busy === "refresh" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Actualiser
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Ajoute les annulations et remplacements. Les cours de base ne changent pas.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => run("reinit")}
                    disabled={busy !== null}
                  >
                    {busy === "reinit" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-2" />
                    )}
                    Réinitialiser
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Modifie les cours de base (prof, salle, matière) pour qu'ils soient comme sur Pronote.
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Actualisation automatique toutes les 3 heures.
              </p>

              {out && (
                <p className={`text-sm ${out.ok ? "text-muted-foreground" : "text-destructive"}`}>
                  {out.ok ? out.text : "Erreur : " + out.text}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
