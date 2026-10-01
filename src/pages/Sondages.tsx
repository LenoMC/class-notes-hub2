import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Lock,
  Mail,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Poll = {
  _id: string;
  question: string;
  options: string[];
  closed: boolean;
  mine: boolean;
  myChoice: number | null;
  counts: number[];
  total: number;
  authorName: string;
  createdAt: number;
  canClose: boolean;
  canDelete: boolean;
  visibility: "class" | "admins";
};

function dateShort(ts: number) {
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + second).toUpperCase();
}

const BAR_COLORS = [
  "bg-primary",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-sky-500",
  "bg-fuchsia-500",
  "bg-rose-500",
];

export default function Sondages() {
  const { user, isLoading: authLoading } = useAuth();
  const polls = useQuery(api.forum.listPolls) as Poll[] | undefined;
  const canCreate = !!user?.isAdmin || !!user?.isClassAdmin;
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState("encours");
  const [openId, setOpenId] = useState<string | null>(null);
  const markSectionRead = useMutation(api.app.markSectionRead);

  // Page ouverte = section vue : efface le point rouge de la navbar
  useEffect(() => {
    void markSectionRead({ section: "sondages" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <img src="/logo.svg" alt="ClassHeure" className="size-10 animate-pulse rounded-lg" />
      </main>
    );
  }

  // Un non-admin ne peut jamais se retrouver sur l'onglet Privé
  const activeTab = !canCreate && tab === "prive" ? "encours" : tab;

  const isPrivate = (p: Poll) => p.visibility === "admins";
  const counts = {
    encours: (polls ?? []).filter((p) => !isPrivate(p) && !p.closed).length,
    archives: (polls ?? []).filter((p) => !isPrivate(p) && p.closed).length,
    prive: (polls ?? []).filter(isPrivate).length,
  };

  const list = (polls ?? []).filter((p) => {
    if (activeTab === "prive") return isPrivate(p);
    if (isPrivate(p)) return false;
    return activeTab === "archives" ? p.closed : !p.closed;
  });

  const openPoll = openId
    ? ((polls ?? []).find((p) => p._id === openId) ?? null)
    : null;

  return (
    <AppShell isAdmin={user?.isAdmin}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
              <BarChart3 className="size-6 text-primary" /> Sondages
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Donnez votre avis — les membres de la classe sont notifiés par email
              à chaque nouveau sondage.
            </p>
          </div>
          {canCreate && (
            <Button onClick={() => setCreating(true)} className="gap-1.5">
              <Plus className="size-4" /> Nouveau sondage
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setTab}>
          <TabsList
            className={cn(
              "w-full bg-secondary/60",
              canCreate ? "grid grid-cols-3" : "grid grid-cols-2",
            )}
          >
            <TabsTrigger value="encours" className="gap-1.5 px-2 sm:px-3">
              <BarChart3 className="size-3.5 shrink-0" />
              <span className="truncate">En cours</span>
              {counts.encours > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {counts.encours}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="archives" className="gap-1.5 px-2 sm:px-3">
              <Archive className="size-3.5 shrink-0" />
              <span className="truncate">Archivés</span>
              {counts.archives > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {counts.archives}
                </span>
              )}
            </TabsTrigger>
            {canCreate && (
              <TabsTrigger value="prive" className="gap-1.5 px-2 sm:px-3">
                <Lock className="size-3.5 shrink-0" />
                <span className="truncate">Privé</span>
                {counts.prive > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                    {counts.prive}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        <div className="mt-5 space-y-2.5">
          {!polls ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : list.length === 0 ? (
            <Card className="panel border-border/70">
              <CardContent className="py-12 text-center">
                <BarChart3 className="mx-auto size-10 text-muted-foreground" />
                <p className="mt-3 font-medium">
                  {activeTab === "prive"
                    ? "Aucun sondage privé"
                    : activeTab === "archives"
                      ? "Aucun sondage clôturé"
                      : "Aucun sondage pour l'instant"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeTab === "prive"
                    ? "Créez un sondage réservé aux admins : aucun email n'est envoyé."
                    : activeTab === "archives"
                      ? "Les sondages terminés apparaîtront ici."
                      : canCreate
                        ? "Créez un premier sondage pour consulter la classe."
                        : "Les responsables de classe et administrateurs publieront des sondages ici."}
                </p>
              </CardContent>
            </Card>
          ) : (
            list.map((poll) => (
              <button
                key={poll._id}
                type="button"
                onClick={() => setOpenId(poll._id)}
                className="group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-4 text-left transition-colors hover:border-primary/50 hover:bg-secondary/40"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BarChart3 className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{poll.question}</span>
                    {isPrivate(poll) && (
                      <Badge
                        variant="outline"
                        className="gap-1 shrink-0 text-[10px] text-amber-300 border-amber-500/40"
                      >
                        <Lock className="size-3" /> Privé
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {poll.authorName} · {dateShort(poll.createdAt)} · {poll.total}{" "}
                    vote{poll.total > 1 ? "s" : ""}
                  </span>
                </span>
                {poll.closed ? (
                  <Badge
                    variant="secondary"
                    className="hidden shrink-0 gap-1 text-[10px] sm:flex"
                  >
                    <Lock className="size-3" /> Clôturé
                  </Badge>
                ) : (
                  <Badge className="hidden shrink-0 bg-emerald-500/15 text-emerald-300 border-emerald-500/40 text-[10px] sm:flex">
                    En cours
                  </Badge>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Détail du sondage cliqué */}
      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{openPoll?.question ?? "Sondage"}</DialogTitle>
          </DialogHeader>
          {openPoll ? (
            <PollCard poll={openPoll} onDeleted={() => setOpenId(null)} />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </DialogContent>
      </Dialog>

      <NewPollDialog
        open={creating}
        onOpenChange={setCreating}
        defaultPrivate={activeTab === "prive"}
        onCreated={(priv) => setTab(priv ? "prive" : "encours")}
      />
    </AppShell>
  );
}

// ---------- Carte sondage (vue détail) ----------

function PollCard({
  poll,
  onDeleted,
}: {
  poll: Poll;
  onDeleted?: () => void;
}) {
  const vote = useMutation(api.forum.votePoll);
  const close = useMutation(api.forum.closePoll);
  const remove = useMutation(api.forum.deletePoll);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [votersFor, setVotersFor] = useState<number | null>(null);

  const handleVote = async (choice: number) => {
    if (poll.closed || busy) return;
    setBusy(true);
    try {
      await vote({ pollId: poll._id as Id<"polls">, choice });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Vote impossible");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    setBusy(true);
    try {
      await close({ pollId: poll._id as Id<"polls"> });
      toast.success("Sondage clôturé.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await remove({ pollId: poll._id as Id<"polls"> });
      toast.success("Sondage supprimé.");
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Suppression impossible");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const hasVoted = poll.myChoice !== null;
  // Admins et auteur voient les résultats (et les votants) même avant de voter
  const canSeeVoters = poll.canClose;
  const showResults = hasVoted || poll.closed || canSeeVoters;

  return (
    <Card className={cn("panel border-border/70", poll.closed && "opacity-90")}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg">{poll.question}</CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5">
              <span>{poll.authorName}</span>
              <span>·</span>
              <span>{dateShort(poll.createdAt)}</span>
              {poll.visibility === "admins" && (
                <Badge
                  variant="outline"
                  className="gap-1 text-[10px] text-amber-300 border-amber-500/40"
                >
                  <Lock className="size-3" /> Privé — admins
                </Badge>
              )}
              {poll.closed ? (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Lock className="size-3" /> Clôturé
                </Badge>
              ) : (
                <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40 text-[10px]">
                  En cours
                </Badge>
              )}
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Users className="size-3" /> {poll.total} vote{poll.total > 1 ? "s" : ""}
              </Badge>
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-1">
            {poll.canClose && !poll.closed && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={handleClose}
              >
                <Lock className="size-3.5 mr-1" /> Clôturer
              </Button>
            )}
            {poll.canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {poll.options.map((opt, i) => {
          const count = poll.counts[i] ?? 0;
          const pct = poll.total > 0 ? Math.round((count / poll.total) * 100) : 0;
          const isMyChoice = poll.myChoice === i;
          return (
            <div
              key={i}
              className={cn(
                "relative overflow-hidden rounded-lg border",
                poll.closed
                  ? "cursor-default border-border bg-secondary/30"
                  : "cursor-pointer border-border hover:border-primary/60",
                isMyChoice && "border-primary",
              )}
            >
              {showResults && (
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 transition-all",
                    BAR_COLORS[i % BAR_COLORS.length],
                    "opacity-20",
                  )}
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-stretch gap-1 pr-2.5">
                <button
                  type="button"
                  disabled={poll.closed || busy}
                  onClick={() => handleVote(i)}
                  className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-3.5 pr-1 text-left text-sm"
                >
                  {isMyChoice ? (
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 font-medium break-words">{opt}</span>
                </button>
                {showResults &&
                  (canSeeVoters ? (
                    <button
                      type="button"
                      title="Voir qui a voté pour ce choix"
                      onClick={() => setVotersFor(i)}
                      className="my-1.5 flex shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Users className="size-3.5" />
                      {count} · {pct}%
                    </button>
                  ) : (
                    <span className="flex shrink-0 items-center self-center text-xs text-muted-foreground">
                      {count} vote{count > 1 ? "s" : ""} · {pct}%
                    </span>
                  ))}
              </div>
            </div>
          );
        })}
        {canSeeVoters && showResults && (
          <p className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
            <Users className="size-3" />
            Cliquez sur « n » d'un choix pour voir qui a voté.
          </p>
        )}
        {!hasVoted && !poll.closed && !canSeeVoters && (
          <p className="pt-1 text-xs text-muted-foreground">
            Cliquez sur un choix pour voter. Vous pourrez changer votre avis
            jusqu'à la clôture.
          </p>
        )}
      </CardContent>

      {votersFor !== null && (
        <VotersDialog
          poll={poll}
          optionIndex={votersFor}
          onClose={() => setVotersFor(null)}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce sondage ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tous les votes seront supprimés avec. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ---------- Dialog : qui a voté pour ce choix ----------

function VotersDialog({
  poll,
  optionIndex,
  onClose,
}: {
  poll: Poll;
  optionIndex: number;
  onClose: () => void;
}) {
  const voters = useQuery(api.forum.getPollVoters, {
    pollId: poll._id as Id<"polls">,
  });
  const names = voters?.[optionIndex] ?? [];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-primary" /> Qui a voté ?
          </DialogTitle>
          <DialogDescription className="break-words">
            Choix « {poll.options[optionIndex]} »
          </DialogDescription>
        </DialogHeader>
        {!voters ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : names.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Personne n'a encore voté pour ce choix.
          </p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-none">
            {names.map((name, i) => (
              <li
                key={i}
                className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-sm"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                  {initials(name)}
                </span>
                <span className="min-w-0 truncate">{name}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Visible uniquement par les admins et l'auteur du sondage.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Dialog : nouveau sondage ----------

function NewPollDialog({
  open,
  onOpenChange,
  defaultPrivate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultPrivate: boolean;
  onCreated?: (isPrivate: boolean) => void;
}) {
  const create = useMutation(api.forum.createPoll);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [sending, setSending] = useState(false);

  // À l'ouverture : précoché quand on vient de l'onglet Privé
  useEffect(() => {
    if (open) setIsPrivate(defaultPrivate);
  }, [open, defaultPrivate]);

  const setOption = (i: number, value: string) => {
    setOptions((prev) => prev.map((o, j) => (j === i ? value : o)));
  };

  const filled = options.map((o) => o.trim()).filter(Boolean);

  const handleSubmit = async () => {
    if (sending) return;
    setSending(true);
    try {
      await create({
        question,
        options: filled,
        visibility: isPrivate ? "admins" : "class",
      });
      toast.success(
        isPrivate
          ? "Sondage privé publié — visible uniquement par les admins (aucun email envoyé)."
          : "Sondage publié ! Un email a été envoyé aux membres de la classe.",
      );
      setQuestion("");
      setOptions(["", ""]);
      setIsPrivate(false);
      onOpenChange(false);
      onCreated?.(isPrivate);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Création impossible");
    } finally {
      setSending(false);
    }
  };

  const valid =
    question.trim().length >= 5 &&
    filled.length >= 2 &&
    new Set(filled.map((o) => o.toLowerCase())).size === filled.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4 text-primary" /> Nouveau sondage
          </DialogTitle>
          <DialogDescription>
            {isPrivate
              ? "Sondage réservé aux admins : aucun email ne sera envoyé."
              : "Les membres de la classe recevront un email avec votre question."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="np-question">Question</Label>
            <Input
              id="np-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ex. On décale le contrôle de maths en semaine B ?"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label>Choix (2 à 6)</Label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    placeholder={`Choix ${i + 1}`}
                    maxLength={80}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        setOptions((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="text-muted-foreground hover:text-destructive cursor-pointer"
                      aria-label="Retirer ce choix"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 6 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => setOptions((prev) => [...prev, ""])}
              >
                <Plus className="size-3.5 mr-1" /> Ajouter un choix
              </Button>
            )}
          </div>
          <div className="space-y-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="np-private"
                checked={isPrivate}
                onCheckedChange={(v) => setIsPrivate(v === true)}
              />
              <Label
                htmlFor="np-private"
                className="flex cursor-pointer items-center gap-1.5 text-sm"
              >
                <Lock className="size-3.5 text-amber-300" /> Réservé aux admins
                (privé)
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Visible uniquement dans l'onglet Privé, aucun email envoyé aux
              élèves.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || sending}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : null}
            {isPrivate ? "Publier (privé)" : "Publier et notifier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
