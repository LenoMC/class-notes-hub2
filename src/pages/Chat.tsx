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
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { StudentAdminChatPanel } from "@/components/StudentAdminChat";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowDown,
  Download,
  ExternalLink,
  FileText,
  MessageSquareLock,
  ImageIcon,
  MessagesSquare,
  Paperclip,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
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
  imageId: string | null;
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
  const generateUploadUrl = useMutation(api.app.generateUploadUrl);
  const markSectionRead = useMutation(api.app.markSectionRead);
  const [pendingImage, setPendingImage] = useState<{
    file: File;
    preview: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attached, setAttached] = useState<FicheLite | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ficheSearch, setFicheSearch] = useState("");
  const [toDelete, setToDelete] = useState<ChatMessage | null>(null);
  // Scroll collé en bas (suit aussi les images qui chargent via contentTick)
  const [contentTick, setContentTick] = useState(0);
  const { ref: scrollRef, atBottom, scrollToBottom } = useChatScroll([
    messages?.length,
    contentTick,
  ]);

  const authorNames = new Map<string, { name: string | null; email: string | null }>();
  if (members) {
    for (const m of members) {
      authorNames.set(m._id, { name: m.name, email: m.email });
    }
  }

  // Page ouverte = section vue : efface le point rouge de la navbar
  useEffect(() => {
    void markSectionRead({ section: "chat" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if ((!text && !attached && !pendingImage) || sending) return;
    setSending(true);
    try {
      // Upload de l'image éventuelle vers le stockage Convex
      let imageId: Id<"_storage"> | undefined;
      if (pendingImage) {
        setUploading(true);
        const url = await generateUploadUrl();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": pendingImage.file.type },
          body: pendingImage.file,
        });
        const uploaded = (await res.json()) as { storageId: string };
        imageId = uploaded.storageId as Id<"_storage">;
        setUploading(false);
      }
      await sendMessage({
        text,
        ficheId: attached
          ? (attached._id as Id<"courseFiles">)
          : undefined,
        imageId,
      });
      setDraft("");
      setAttached(null);
      if (pendingImage) {
        URL.revokeObjectURL(pendingImage.preview);
        setPendingImage(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const pickImage = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez un fichier image (PNG, JPG, WebP…).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image trop lourde (5 Mo maximum).");
      return;
    }
    setPendingImage({ file, preview: URL.createObjectURL(file) });
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

  const removePendingImage = () => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.preview);
    setPendingImage(null);
  };

  const noClass = user && !user.classId && !user.adminOfClassId;

  // Onglets : Chat de classe / Chat privé avec les admins (🔒).
  // Onglet initial pilotable par URL (?tab=private) pour les notifications.
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<"class" | "private">(
    searchParams.get("tab") === "private" ? "private" : "class",
  );

  // Réagit aussi aux changements d'URL (clic sur une notification alors
  // que la page est déjà ouverte).
  useEffect(() => {
    if (searchParams.get("tab") === "private") setTab("private");
  }, [searchParams]);

  const switchTab = (t: "class" | "private") => {
    setTab(t);
    const next = new URLSearchParams(searchParams);
    if (t === "private") next.set("tab", "private");
    else next.delete("tab");
    setSearchParams(next, { replace: true });
  };
  const adminChatUnread = useQuery(api.app.getMyAdminChatUnread, {}) as
    | number
    | undefined;

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

      {/* Onglets Chat de classe / Chat privé admins */}
      <div className="mb-4 grid w-full max-w-md grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => switchTab("class")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
            tab === "class"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <MessagesSquare className="size-4" /> Classe
        </button>
        <button
          type="button"
          onClick={() => switchTab("private")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
            tab === "private"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <MessageSquareLock className="size-4" /> Chat 🔒
          {(adminChatUnread ?? 0) > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {adminChatUnread! > 9 ? "9+" : adminChatUnread}
            </span>
          )}
        </button>
      </div>

      {tab === "private" ? (
        <StudentAdminChatPanel />
      ) : noClass ? (
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

            <div className="relative flex-1">
              <div
                ref={scrollRef}
                className="h-[52vh] min-h-[320px] space-y-2.5 overflow-y-auto px-4 py-4 scrollbar-none"
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
                          {m.imageId && (
                            <ChatImage
                              imageId={m.imageId}
                              onZoom={setZoomImage}
                              mine={m.mine}
                              onLoaded={() => setContentTick((t) => t + 1)}
                            />
                          )}
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
                              "mx-1 rounded-full p-1 text-muted-foreground transition-opacity hover:bg-destructive/10 hover:text-destructive cursor-pointer",
                              m.imageId
                                ? "opacity-60"
                                : "opacity-0 focus:opacity-100 group-hover:opacity-100",
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

              {/* Bouton « revenir en bas » quand on a remonté le fil */}
              {!atBottom && (
                <button
                  type="button"
                  onClick={() => scrollToBottom(true)}
                  className="absolute bottom-3 right-4 z-10 flex size-9 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary cursor-pointer"
                  aria-label="Revenir aux derniers messages"
                >
                  <ArrowDown className="size-4" />
                </button>
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
            {pendingImage && (
              <div className="mx-3 mt-3 flex items-center gap-2 rounded-2xl border border-border bg-secondary p-2">
                <img
                  src={pendingImage.preview}
                  alt="Aperçu de l'image à envoyer"
                  className="size-12 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {pendingImage.file.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {(pendingImage.file.size / 1024).toFixed(0)} Ko · image jointe
                  </p>
                </div>
                <button
                  type="button"
                  onClick={removePendingImage}
                  className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                  aria-label="Retirer l'image"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            <form
              onSubmit={handleSend}
              className="flex items-center gap-2 border-t border-border/60 p-3"
            >
              <label
                htmlFor="chat-image-input"
                className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                title="Joindre une image"
              >
                <ImageIcon className="size-4" />
                <input
                  id="chat-image-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    pickImage(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
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
                disabled={(!draft.trim() && !attached && !pendingImage) || sending}
                className="size-10 shrink-0 rounded-full"
                aria-label="Envoyer"
              >
                {uploading ? "…" : <Send className="size-4" />}
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

      {/* Zoom plein écran d'une image du chat */}
      <AlertDialog open={!!zoomImage} onOpenChange={(open) => !open && setZoomImage(null)}>
        <AlertDialogContent className="max-w-4xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="sr-only">Image du chat</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              Vue agrandie de l'image partagée dans le chat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {zoomImage && (
            <img
              src={zoomImage}
              alt="Vue agrandie"
              className="max-h-[75vh] w-full rounded-xl object-contain"
            />
          )}
          <div className="flex justify-end">
            <AlertDialogAction asChild>
              <a href={zoomImage ?? "#"} target="_blank" rel="noreferrer">
                Ouvrir dans un onglet
              </a>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

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

/** Image jointe à un message : URL signée via Convex, zoom au clic. */
function ChatImage({
  imageId,
  onZoom,
  mine,
  onLoaded,
}: {
  imageId: string;
  onZoom: (url: string) => void;
  mine: boolean;
  onLoaded?: () => void;
}) {
  const url = useQuery(
    api.app.getFileUrl,
    { storageId: imageId as Id<"_storage"> },
  );
  if (!url) {
    return (
      <div className="h-40 w-52 animate-pulse rounded-2xl bg-background/40" />
    );
  }
  return (
    <button
      type="button"
      onClick={() => onZoom(url)}
      className="block cursor-zoom-in overflow-hidden rounded-2xl border transition-colors"
    >
      <img
        src={url}
        alt="Image partagée dans le chat"
        className="max-h-64 max-w-[16rem] w-auto object-cover"
        loading="lazy"
        onLoad={() => onLoaded?.()}
      />
    </button>
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
