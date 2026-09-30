import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { ArrowDown } from "lucide-react";
import { Lock, MessageSquareLock, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TypingBubble } from "@/components/TypingDots";
import { useAuth } from "@/hooks/use-auth";

/** Panneau « Chat 🔒 » côté élève : conversation privée avec les admins
 *  globaux. Les admins voient automatiquement la conversation apparaître
 *  dans leur onglet Chat ( Administration → Chat ). */
export function StudentAdminChatPanel() {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const messages = useQuery(api.app.listAdminMessages, {}) as
    | Array<{ _id: string; text: string; createdAt: number; mine: boolean; side: string }>
    | undefined;
  // Scroll collé en bas (doit être appelé après la déclaration de `messages`)
  const { ref: scrollRef, atBottom, scrollToBottom } = useChatScroll([
    messages?.length,
  ]);

  const send = useMutation(api.app.sendAdminMessage);
  const markRead = useMutation(api.app.markAdminChatReadAsStudent);
  const setTyping = useMutation(api.app.setTyping);
  // J'écris dans MON scope (l'admin y est abonné) et j'écoute le scope où
  // les admins écrivent pour cette conversation (admin:<mon id>).
  const myId = (user?._id ?? "?") as string;
  const myWriteScope = `student:${myId}`;
  const typingNames = useQuery(api.app.listTyping, {
    scope: `admin:${myId}`,
  }) as string[] | undefined;

  // Ouverture = tout est lu (le point rouge disparaît)
  useEffect(() => {
    void markRead({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await send({ text });
      setDraft("");
      await setTyping({ scope: myWriteScope, typing: false });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Envoi impossible. Réessayez.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="panel flex flex-col border-border/70 overflow-hidden">
      <CardHeader className="border-b border-border/60 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareLock className="size-4 text-primary" />
          Chat privé avec les administrateurs
          <Lock className="ml-auto size-3.5 text-muted-foreground" />
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <ShieldCheck className="size-3.5 text-primary" />
          Visible uniquement par vous et les administrateurs globaux du site.
        </CardDescription>
      </CardHeader>

      <div className="relative flex-1">
      <div
        ref={scrollRef}
        className="h-[52vh] min-h-[320px] space-y-2.5 overflow-y-auto px-4 py-4"
      >
        {!messages ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </div>
        ) : messages.length === 0 ? (
          <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Une question, un souci ou une suggestion ? Écrivez aux administrateurs
            ici — c'est confidentiel.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m._id}
              className={cn("flex", m.mine ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                  m.mine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary/80 rounded-bl-sm",
                )}
              >
                {!m.mine && (
                  <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-primary">
                    <ShieldCheck className="size-3" /> Administrateur
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p
                  className={cn(
                    "mt-0.5 text-[10px]",
                    m.mine ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {new Date(m.createdAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))
        )}
        {(typingNames ?? []).length > 0 && (
          <div className="flex justify-start">
            <TypingBubble name={(typingNames ?? []).join(", ")} />
          </div>
        )}
      </div>

      {/* Bouton « revenir en bas » quand on a remonté le fil */}
      {!atBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-20 right-6 z-10 flex size-9 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary cursor-pointer"
          aria-label="Revenir aux derniers messages"
        >
          <ArrowDown className="size-4" />
        </button>
      )}
      </div>

      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-border/60 p-3"
      >
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            void setTyping({ scope: myWriteScope, typing: e.target.value.length > 0 });
          }}
          onBlur={() => void setTyping({ scope: myWriteScope, typing: false })}
          placeholder="Écrire aux administrateurs…"
          className="flex-1"
          maxLength={2000}
          disabled={sending}
        />
        <Button
          type="submit"
          size="icon"
          className="size-10 shrink-0"
          disabled={sending || !draft.trim()}
          aria-label="Envoyer"
        >
          {sending ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
    </Card>
  );
}
