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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  BarChart3,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
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
};

function dateShort(ts: number) {
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <img src="/logo.svg" alt="Classheure" className="size-10 animate-pulse rounded-lg" />
      </main>
    );
  }

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

        {!polls ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : polls.length === 0 ? (
          <Card className="panel border-border/70">
            <CardContent className="py-12 text-center">
              <BarChart3 className="mx-auto size-10 text-muted-foreground" />
              <p className="mt-3 font-medium">Aucun sondage pour l'instant</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {canCreate
                  ? "Créez un premier sondage pour consulter la classe."
                  : "Les responsables de classe et administrateurs publieront des sondages ici."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {polls.map((p) => (
              <PollCard key={p._id} poll={p} />
            ))}
          </div>
        )}
      </div>

      <NewPollDialog open={creating} onOpenChange={setCreating} />
    </AppShell>
  );
}

// ---------- Carte sondage ----------

function PollCard({ poll }: { poll: Poll }) {
  const vote = useMutation(api.forum.votePoll);
  const close = useMutation(api.forum.closePoll);
  const remove = useMutation(api.forum.deletePoll);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Suppression impossible");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const hasVoted = poll.myChoice !== null;
  const showResults = hasVoted || poll.closed;

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
              <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={handleClose}>
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
            <button
              key={i}
              type="button"
              disabled={poll.closed || busy}
              onClick={() => handleVote(i)}
              className={cn(
                "relative w-full overflow-hidden rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors",
                poll.closed
                  ? "cursor-default border-border bg-secondary/30"
                  : "cursor-pointer border-border hover:border-primary/60",
                isMyChoice && "border-primary",
              )}
            >
              {showResults && (
                <span
                  className={cn("absolute inset-y-0 left-0 transition-all", BAR_COLORS[i % BAR_COLORS.length], "opacity-20")}
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  {isMyChoice ? (
                    <CheckCircle2 className="size-4 text-primary shrink-0" />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  {opt}
                </span>
                {showResults && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {count} vote{count > 1 ? "s" : ""} · {pct}%
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {!hasVoted && !poll.closed && (
          <p className="pt-1 text-xs text-muted-foreground">
            Cliquez sur un choix pour voter. Vous pourrez changer votre avis
            jusqu'à la clôture.
          </p>
        )}
      </CardContent>

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

// ---------- Dialog : nouveau sondage ----------

function NewPollDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useMutation(api.forum.createPoll);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [sending, setSending] = useState(false);

  const setOption = (i: number, value: string) => {
    setOptions((prev) => prev.map((o, j) => (j === i ? value : o)));
  };

  const filled = options.map((o) => o.trim()).filter(Boolean);

  const handleSubmit = async () => {
    if (sending) return;
    setSending(true);
    try {
      await create({ question, options: filled });
      toast.success(
        "Sondage publié ! Un email a été envoyé aux membres de la classe.",
      );
      setQuestion("");
      setOptions(["", ""]);
      onOpenChange(false);
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
            Les membres de la classe recevront un email avec votre question.
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
                      onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || sending}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : null}
            Publier et notifier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
