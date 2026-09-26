import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Download,
  ExternalLink,
  FileText,
  MessagesSquare,
  Paperclip,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

function initialsOf(name: string | null | undefined, email: string | null | undefined) {
  return (
    (name || email || "?")
      .split(/[\s.@]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?"
  );
}

function timeLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameDay) return time;
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · ${time}`;
}

type ChatMessage = {
  _id: string;
  text: string;
  createdAt: number;
  authorId: string;
  mine: boolean;
  fiche: null | {
    _id: string;
    title: string;
    kind: "cours" | "devoir";
    hasFile: boolean;
    storageId: string | null;
    externalUrl: string | null;
  };
};

type FicheLite = {
  _id: string;
  title: string;
  kind: "cours" | "devoir";
  subject: string;
  day: string;
  start: string;
  hasFile: boolean;
  storageId: string | null;
  externalUrl: string | null;
};

export default function Chat() {
  const { user } = useAuth();
  const messages = useQuery(api.app.listChatMessages, { limit: 200 }) as
    | ChatMessage[]
    | undefined;
  const members = useQuery(api.app.listChatMembers) as
    | Array<{
        _id: string;
        name: string | null;
        email: string | null;
        isMe: boolean;
      }>
    | undefined;
  const fiches = useQuery(
    api.app.listClassFiles,
    user?.classId ? {} : "skip",
  ) as FicheLite[] | undefined;
  const sendMessage = useMutation(api.app.sendChatMessage);
  const deleteMessage = useMutation(api.app.deleteChatMessage);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attached, setAttached] = useState<FicheLite | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ficheSearch, setFicheSearch] = useState("");
  const [toDelete, setToDelete] = useState<ChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const authorNames = new Map<string, { name: string | null; email: string | null }>();
  if (members) {
    for (const m of members) {
      authorNames.set(m._id, { name: m.name, email: m.email });
    }
  }

  // Défilement automatique vers le dernier message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if ((!text && !attached) || sending) return;
    setSending(true);
    try {
      await sendMessage({
        text,
        ficheId: attached
          ? (attached._id as Id<"courseFiles">)
          : undefined,
      });
      setDraft("");
      setAttached(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setSending(false);
    }
  };

  const ficheResults = (fiches ?? []).filter((f) =>
    ficheSearch.trim()
      ? `${f.title} ${f.subject}`
          .toLowerCase()
          .includes(ficheSearch.trim().toLowerCase())
      : true,
  );

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteMessage({ messageId: toDelete._id as Id<"chatMessages"> });
      setToDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Suppression impossible");
    }
  };

  const noClass = user && !user.classId && !user.adminOfClassId;

  return (
    <AppShell isAdmin={user?.isAdmin}>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary glow-ring-soft">
          <MessagesSquare className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chat</h1>
          <p className="text-sm text-muted-foreground">
            Discussion directe avec votre classe — messages en temps réel.
          </p>
        </div>
      </div>

      {noClass ? (
        <Card className="panel border-border/70">
          <CardContent className="py-12 text-center">
            <MessagesSquare className="mx-auto size-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              Rejoignez d'abord une classe depuis le questionnaire d'accueil pour
              accéder au chat.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          {/* Fil de discussion */}
          <Card className="panel flex flex-col border-border/70 overflow-hidden">
            <CardHeader className="border-b border-border/60 py-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessagesSquare className="size-4 text-primary" />
                Classe {user?.className ?? ""}
              </CardTitle>
              <CardDescription className="text-xs">
                {members ? `${members.length} membre(s)` : "…"}
              </CardDescription>
            </CardHeader>

            <div
              ref={scrollRef}
              className="h-[52vh] min-h-[320px] flex-1 space-y-2.5 overflow-y-auto px-4 py-4"
            >
              {!messages ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-2/3" />
                  <Skeleton className="ml-auto h-10 w-1/2" />
                  <Skeleton className="h-10 w-3/5" />
                </div>
              ) : messages.length === 0 ? (
                <p className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                  Aucun message. Lancez la discussion !
                </p>
              ) : (
                messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const showAuthor =
                    !prev || prev.authorId !== m.authorId;
                  const author = authorNames.get(m.authorId);
                  return (
                    <div
                      key={m._id}
                      className={cn(
                        "group flex items-end gap-2",
                        m.mine && "flex-row-reverse",
                      )}
                    >
                      <Avatar className="size-7 shrink-0 border border-border">
                        <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                          {initialsOf(author?.name, author?.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={cn(
                          "max-w-[78%] space-y-0.5",
                          m.mine && "items-end text-right",
                        )}
                      >
                        {showAuthor && (
                          <p className="px-1 text-[10px] text-muted-foreground">
                            {m.mine
                              ? "Vous"
                              : (author?.name || author?.email || "Membre")}
                            {" · "}
                            {timeLabel(m.createdAt)}
                          </p>
                        )}
                        <div
                          className={cn(
                            "animate-bolt-pop max-w-full space-y-2 rounded-3xl px-4 py-2.5 text-sm leading-snug",
                            m.mine
                              ? "rounded-br-sm bg-primary text-primary-foreground font-medium shadow-md shadow-primary/20"
                              : "rounded-bl-sm border border-border bg-secondary",
                          )}
                        >
                          {m.text &&
                            m.text.split("\n").map((line, j) => (
                              <p key={j}>{line}</p>
                            ))}
                          {m.fiche && (
                            <a
                              href={
                                m.fiche.hasFile && m.fiche.storageId
                                  ? undefined
                                  : (m.fiche.externalUrl ?? undefined)
                              }
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                "flex items-center gap-2 rounded-2xl border px-3 py-2 transition-colors",
                                m.mine
                                  ? "border-primary-foreground/25 bg-background text-foreground hover:border-primary"
                                  : "border-border bg-background hover:border-primary",
                              )}
                            >
                              <FileText className="size-4 shrink-0" />
                              <span className="min-w-0 flex-1 text-left">
                                <span className="block truncate text-xs font-semibold">
                                  {m.fiche.title}
                                </span>
                                <span className="block text-[10px] opacity-70 uppercase">
                                  Fiche · {m.fiche.kind}
                                </span>
                              </span>
                              {m.fiche.hasFile ? (
                                <FicheDownload storageId={m.fiche.storageId} mine={m.mine} />
                              ) : m.fiche.externalUrl ? (
                                <ExternalLink className="size-4 shrink-0" />
                              ) : null}
                            </a>
                          )}
                        </div>
                        {(m.mine || user?.isAdmin) && (
                          <button
                            type="button"
                            onClick={() => setToDelete(m)}
                            className={cn(
                              "mx-1 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100 cursor-pointer",
                              m.mine && "justify-self-end",
                            )}
                            aria-label="Supprimer le message"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {attached && (
              <div className="mx-3 mt-3 flex items-center gap-2 rounded-2xl border border-border bg-secondary px-3 py-2">
                <FileText className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{attached.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Fiche jointe · {attached.subject} · {attached.day} {attached.start}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAttached(null)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                  aria-label="Retirer la pièce jointe"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            <form
              onSubmit={handleSend}
              className="flex items-center gap-2 border-t border-border/60 p-3"
            >
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-10 shrink-0 rounded-full text-muted-foreground hover:text-primary"
                onClick={() => setPickerOpen(true)}
                aria-label="Joindre une fiche"
              >
                <Paperclip className="size-4" />
              </Button>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Écrire un message…"
                maxLength={1000}
                className="h-10 flex-1 rounded-full bg-secondary"
              />
              <Button
                type="submit"
                size="icon"
                disabled={(!draft.trim() && !attached) || sending}
                className="size-10 shrink-0 rounded-full"
                aria-label="Envoyer"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </Card>

          {/* Membres */}
          <Card className="panel h-fit border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="size-4 text-primary" /> Membres
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {!members ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                members.map((m) => (
                  <div
                    key={m._id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/50"
                  >
                    <Avatar className="size-6 border border-border">
                      <AvatarFallback className="bg-secondary text-[9px] font-semibold">
                        {initialsOf(m.name, m.email)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {m.name || m.email || "Membre"}
                    </span>
                    {m.isMe && (
                      <Badge variant="outline" className="text-[9px]">
                        vous
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirmation de suppression d'un message */}
      <Dialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer ce message ?</DialogTitle>
            <DialogDescription>
              Il sera définitivement retiré du chat de la classe.
            </DialogDescription>
          </DialogHeader>
          {toDelete && (
            <p className="rounded-2xl border border-border bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground line-clamp-3">
              {toDelete.text || "(fiche jointe)"}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-1.5 size-4" /> Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sélecteur de fiche à joindre */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="size-4 text-primary" /> Joindre une fiche
            </DialogTitle>
            <DialogDescription>
              Choisissez une fiche publiée sur l'emploi du temps de votre classe.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={ficheSearch}
            onChange={(e) => setFicheSearch(e.target.value)}
            placeholder="Rechercher par titre ou matière…"
            className="h-9 bg-secondary"
          />
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {!fiches ? (
              <Skeleton className="h-10 w-full" />
            ) : ficheResults.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aucune fiche trouvée.
              </p>
            ) : (
              ficheResults.map((f) => (
                <button
                  key={f._id}
                  type="button"
                  onClick={() => {
                    setAttached(f);
                    setPickerOpen(false);
                    setFicheSearch("");
                  }}
                  className="flex w-full items-center gap-2 rounded-2xl border border-border bg-secondary px-3 py-2 text-left transition-colors hover:border-primary cursor-pointer"
                >
                  <FileText className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {f.title}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {f.subject} · {f.day} {f.start}
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[9px] uppercase"
                  >
                    {f.kind}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

/** Bouton de téléchargement d'une fiche jointe à un message. */
function FicheDownload({
  storageId,
  mine,
}: {
  storageId: string | null;
  mine: boolean;
}) {
  const url = useQuery(
    api.app.getFileUrl,
    storageId ? { storageId: storageId as Id<"_storage"> } : "skip",
  );
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label="Télécharger la fiche"
      className="shrink-0 rounded-full p-1 transition-colors"
    >
      <Download
        className={cn(
          "size-4",
          mine ? "text-primary-foreground" : "text-primary",
        )}
      />
    </a>
  );
}
