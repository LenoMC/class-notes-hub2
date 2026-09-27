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
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  ThumbsUp,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const SUBJECTS = [
  "Mathématiques",
  "Français",
  "Histoire-Géographie",
  "Anglais",
  "Espagnol",
  "Allemand",
  "Physique-Chimie",
  "SVT",
  "Technologie",
  "EPS",
  "Arts Plastiques",
  "Musique",
  "Latin",
  "LCE",
  "Autre",
];

type Thread = {
  _id: string;
  title: string;
  body: string;
  subject: string | null;
  authorId: string;
  authorName: string;
  mine: boolean;
  resolved: boolean;
  votes: number;
  voted: boolean;
  answerCount: number;
  createdAt: number;
  canResolve: boolean;
  canDelete: boolean;
};

type ThreadDetail = Thread & {
  posts: Array<{
    _id: string;
    body: string;
    authorId: string;
    authorName: string;
    mine: boolean;
    createdAt: number;
  }>;
};

function dateShort(ts: number) {
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Forum() {
  const { user, isLoading: authLoading } = useAuth();
  const threads = useQuery(api.forum.listForumThreads) as Thread[] | undefined;
  const [selectedId, setSelectedId] = useState<Id<"forumThreads"> | null>(null);
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
              <CircleDot className="size-6 text-primary" /> Forum d'entraide
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Posez vos questions, répondez aux autres, marquez résolu quand c'est bon.
            </p>
          </div>
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="size-4" /> Poser une question
          </Button>
        </div>

        {!threads ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : threads.length === 0 ? (
          <Card className="panel border-border/70">
            <CardContent className="py-12 text-center">
              <MessageSquare className="mx-auto size-10 text-muted-foreground" />
              <p className="mt-3 font-medium">Aucune question pour l'instant</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Soyez le premier à poser une question à votre classe.
              </p>
              <Button className="mt-4" onClick={() => setCreating(true)}>
                <Plus className="size-4 mr-1.5" /> Poser la première question
              </Button>
            </CardContent>
          </Card>
        ) : selectedId ? (
          <ThreadView
            threadId={selectedId}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="space-y-3">
            {threads.map((t) => (
              <ThreadCard key={t._id} thread={t} onOpen={() => setSelectedId(t._id as Id<"forumThreads">)} />
            ))}
          </div>
        )}
      </div>

      <NewThreadDialog open={creating} onOpenChange={setCreating} />
    </AppShell>
  );
}

// ---------- Carte d'une question (liste) ----------

function ThreadCard({ thread, onOpen }: { thread: Thread; onOpen: () => void }) {
  const vote = useMutation(api.forum.voteForumThread);
  const resolve = useMutation(api.forum.resolveForumThread);
  const remove = useMutation(api.forum.deleteForumThread);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleVote = async () => {
    setBusy(true);
    try {
      await vote({ threadId: thread._id as Id<"forumThreads"> });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async () => {
    setBusy(true);
    try {
      await resolve({ threadId: thread._id as Id<"forumThreads">, resolved: !thread.resolved });
      toast.success(thread.resolved ? "Marquée non résolue." : "Question marquée résolue ✓");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await remove({ threadId: thread._id as Id<"forumThreads"> });
      toast.success("Question supprimée.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Suppression impossible");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Card
      className={cn(
        "panel border-border/70 transition-colors hover:border-primary/50",
        thread.resolved && "border-emerald-500/40",
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <button onClick={onOpen} className="min-w-0 flex-1 text-left cursor-pointer group">
            <CardTitle className="flex items-center gap-2 text-base group-hover:text-primary transition-colors">
              {thread.resolved && (
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
              )}
              <span className="truncate">{thread.title}</span>
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2">
              {thread.body}
            </CardDescription>
          </button>
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={handleVote}
              disabled={busy}
              aria-label="Voter pour cette question"
              className={cn(
                "flex flex-col items-center rounded-lg border px-2.5 py-1.5 transition-colors cursor-pointer disabled:opacity-50",
                thread.voted
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
              )}
            >
              <ThumbsUp className="size-3.5" />
              <span className="text-xs font-bold">{thread.votes}</span>
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{thread.authorName}</span>
          <span>·</span>
          <span>{dateShort(thread.createdAt)}</span>
          {thread.subject && (
            <Badge variant="outline" className="text-[10px]">
              {thread.subject}
            </Badge>
          )}
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <MessageSquare className="size-3" />
            {thread.answerCount} réponse{thread.answerCount > 1 ? "s" : ""}
          </Badge>
          {thread.resolved && (
            <Badge className="gap-1 bg-emerald-500/15 text-emerald-300 border-emerald-500/40 text-[10px]">
              <CheckCircle2 className="size-3" /> Résolue
            </Badge>
          )}
          <span className="flex-1" />
          {thread.canResolve && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={busy}
              onClick={handleResolve}
            >
              <CheckCircle2 className="size-3.5" />
              {thread.resolved ? "Rouvrir" : "Résoudre"}
            </Button>
          )}
          {thread.canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" /> Supprimer
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onOpen}>
            Ouvrir
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette question ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les {thread.answerCount} réponse(s) et les votes seront supprimés avec.
              Cette action est irréversible.
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

// ---------- Vue détaillée d'une question ----------

function ThreadView({ threadId, onBack }: { threadId: Id<"forumThreads">; onBack: () => void }) {
  const detail = useQuery(api.forum.getForumThread, { threadId }) as
    | ThreadDetail
    | undefined;
  const answer = useMutation(api.forum.answerForumThread);
  const vote = useMutation(api.forum.voteForumThread);
  const resolve = useMutation(api.forum.resolveForumThread);
  const removePost = useMutation(api.forum.deleteForumPost);
  const removeThread = useMutation(api.forum.deleteForumThread);
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { user } = useAuth();

  if (!detail) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const handleAnswer = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await answer({ threadId, body });
      setDraft("");
      toast.success("Réponse publiée.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setSending(false);
    }
  };

  const handleToggleResolve = async () => {
    try {
      await resolve({ threadId, resolved: !detail.resolved });
      toast.success(detail.resolved ? "Marquée non résolue." : "Question marquée résolue ✓");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible");
    }
  };

  const handleDeleteThread = async () => {
    try {
      await removeThread({ threadId });
      toast.success("Question supprimée.");
      onBack();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Suppression impossible");
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
        <ArrowLeft className="size-4" /> Toutes les questions
      </Button>

      <Card className={cn("panel border-border/70", detail.resolved && "border-emerald-500/40")}>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-xl">
                {detail.resolved && <CheckCircle2 className="size-5 text-emerald-400" />}
                {detail.title}
              </CardTitle>
              <CardDescription className="mt-1">
                {detail.authorName} · {dateShort(detail.createdAt)}
                {detail.subject ? ` · ${detail.subject}` : ""}
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await vote({ threadId });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Action impossible");
                }
              }}
              className={cn(
                "flex flex-col items-center rounded-lg border px-3 py-2 transition-colors cursor-pointer shrink-0",
                detail.voted
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
              )}
            >
              <ThumbsUp className="size-4" />
              <span className="text-sm font-bold">{detail.votes}</span>
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{detail.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.canResolve && (
              <Button
                size="sm"
                variant={detail.resolved ? "outline" : "default"}
                className="gap-1.5"
                onClick={handleToggleResolve}
              >
                <CheckCircle2 className="size-4" />
                {detail.resolved ? "Marquer non résolue" : "Marquer résolue"}
              </Button>
            )}
            {detail.canDelete && (
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Supprimer la question
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <p className="text-sm font-medium">
          {detail.posts.length} réponse{detail.posts.length > 1 ? "s" : ""}
        </p>
        {detail.posts.map((p) => (
          <div
            key={p._id}
            className={cn(
              "rounded-xl border px-4 py-3",
              p.mine ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/30",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-primary">
                {p.authorName}
                {p.mine && " (vous)"}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{dateShort(p.createdAt)}</span>
                {(p.mine || user?.isAdmin) && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await removePost({ postId: p._id as Id<"forumPosts"> });
                        toast.success("Réponse supprimée.");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Suppression impossible");
                      }
                    }}
                    className="text-muted-foreground transition-colors hover:text-destructive cursor-pointer"
                    aria-label="Supprimer la réponse"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{p.body}</p>
          </div>
        ))}
      </div>

      <Card className="panel border-border/70">
        <CardContent className="pt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAnswer();
            }}
            className="space-y-3"
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Écrire une réponse…"
              rows={3}
              maxLength={3000}
              disabled={sending}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={!draft.trim() || sending} className="gap-1.5">
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Répondre
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette question ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les réponses et les votes seront supprimés avec. Cette action est
              irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDeleteThread}
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Dialog : nouvelle question ----------

function NewThreadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useMutation(api.forum.createForumThread);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await create({
        title,
        body,
        ...(subject ? { subject } : {}),
      });
      toast.success("Question publiée !");
      setTitle("");
      setBody("");
      setSubject("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publication impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Poser une question</DialogTitle>
          <DialogDescription>
            La classe entière pourra vous répondre et voter.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nt-title">Titre</Label>
            <Input
              id="nt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Comment factoriser x²-9 ?"
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nt-subject">Matière (facultatif)</Label>
            <select
              id="nt-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— Aucune —</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nt-body">Votre question</Label>
            <Textarea
              id="nt-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Détaillez ce que vous n'avez pas compris…"
              rows={5}
              maxLength={3000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || title.trim().length < 5 || body.trim().length < 10}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Publier la question
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
