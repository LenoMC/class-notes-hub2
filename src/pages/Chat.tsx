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
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { MessagesSquare, Send, Users } from "lucide-react";
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
  const sendMessage = useMutation(api.app.sendChatMessage);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
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
    if (!text || sending) return;
    setSending(true);
    try {
      await sendMessage({ text });
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setSending(false);
    }
  };

  const noClass = user && !user.classId && !user.adminOfClassId;

  return (
    <AppShell>
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
                        "flex items-end gap-2",
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
                            "animate-bolt-pop rounded-2xl px-3.5 py-2 text-sm leading-snug",
                            m.mine
                              ? "rounded-br-sm bg-primary text-primary-foreground font-medium shadow-md shadow-primary/20"
                              : "rounded-bl-sm border border-border/70 bg-secondary/60",
                          )}
                        >
                          {m.text.split("\n").map((line, j) => (
                            <p key={j}>{line}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form
              onSubmit={handleSend}
              className="flex items-center gap-2 border-t border-border/60 p-3"
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Écrire un message…"
                maxLength={1000}
                className="h-10 flex-1 rounded-full bg-secondary/50"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!draft.trim() || sending}
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
    </AppShell>
  );
}
