import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { Bell, BellOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router";

/**
 * Notifications navigateur temps réel (Web Notifications API + Convex).
 *
 * - Demande la permission au 2e clic (refus par défaut de Chrome/Firefox) ;
 *   si elle est refusée, retombe sur des toasts sonner.
 * - Surveille « dernier événement » de 5 flux : chat de classe, chat privé
 *   élève (message d'un admin), chat privé admin (message d'un élève ou
 *   salon), forum (nouvelle question), sondages.
 * - Ne notifie que les événements postérieurs au montage (pas d'historique).
 * - Chaque notification est cliquable et mène à la bonne page : /chat?tab=private,
 *   /admin?tab=adminchat&student=…, /forum, /sondages.
 * - Pendant la partie chat de classe, on ne notifie pas (on lit déjà).
 * - Le point rouge navbar reste géré par getUnreadCounts (depuis > dernière
 *   visite) — cette composante couvre le temps réel.
 */

type LatestItem = { _id: string; createdAt: number } & Record<string, any>;
type Latest = LatestItem | null | undefined;

function useSeen() {
  const seen = useRef<Map<string, string>>(new Map());
  const first = useRef<Map<string, boolean>>(new Map());
  return useCallback(
    (key: string, item: Latest, show: (item: NonNullable<Latest>) => void) => {
      if (!item) return;
      // Premier rendu : on enregistre sans notifier (évite le spam d'historique).
      if (!first.current.get(key)) {
        first.current.set(key, true);
        seen.current.set(key, item._id);
        return;
      }
      if (seen.current.get(key) === item._id) return;
      seen.current.set(key, item._id);
      show(item);
    },
    [],
  );
}

function notifIcon(): string {
  return "/logo-192.png";
}

export function BrowserNotifier() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [showHint, setShowHint] = useState(false);

  const markSectionRead = useMutation(api.app.markSectionRead);

  // ----- Demande de permission (au 2e clic n'importe où) -----
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (permission !== "default") return;
    const onClick = () => {
      setShowHint(false);
      Notification.requestPermission()
        .then((p) => {
          setPermission(p);
          if (p === "granted") {
            toast.success("Notifications activées !");
            try {
              new Notification("Classheure", {
                body: "Vous serez prévenu des nouveaux messages, questions et sondages.",
                icon: notifIcon(),
              });
            } catch {
              /* ignore */
            }
          } else if (p === "denied") {
            toast.info(
              "Notifications refusées : elles apparaîtront dans l'application (toast) à la place.",
            );
          }
        })
        .catch(() => {});
    };
    window.addEventListener("click", onClick, { once: true });
    return () => window.removeEventListener("click", onClick);
  }, [isLoading, isAuthenticated, permission]);

  // Indication douce si la permission est encore « default » après 10 s.
  useEffect(() => {
    if (isLoading || !isAuthenticated || permission !== "default") return;
    const t = setTimeout(() => setShowHint(true), 10000);
    return () => clearTimeout(t);
  }, [isLoading, isAuthenticated, permission]);

  const notify = useCallback(
    (title: string, body: string, path: string, tag: string) => {
      const label = `${title} — ${body}`;
      if (permission === "granted") {
        try {
          const n = new Notification(title, {
            body,
            icon: notifIcon(),
            tag,
          });
          n.onclick = () => {
            window.focus();
            navigate(path);
            n.close();
          };
        } catch {
          toast(label, {
            action: { label: "Ouvrir", onClick: () => navigate(path) },
            duration: 8000,
          });
        }
      } else {
        // Fallback toast (permission non accordée / non supportée).
        toast(label, {
          action: { label: "Ouvrir", onClick: () => navigate(path) },
          duration: 8000,
        });
      }
    },
    [navigate, permission],
  );

  const showHintBar = showHint && permission === "default";

  // ----- Flux : chat de classe -----
  const latestChat = useQuery(api.app.getLatestChatMessage, {}) as Latest;
  const seenChat = useSeen();
  seenChat("chat", latestChat, (m) => {
    // On regarde déjà le chat de classe : pas de notif redondante.
    if (window.location.pathname === "/chat") return;
    const text =
      m.text.length > 90 ? `${m.text.slice(0, 90)}…` : m.text || "a partagé du contenu";
    notify(
      `💬 ${m.authorName}`,
      `Chat de classe : ${text}`,
      "/chat",
      "classheure-chat",
    );
  });

  // ----- Flux : chat privé élève (message d'un admin) -----
  const latestAdminForMe = useQuery(api.app.getLatestAdminMessageForMe, {}) as Latest;
  const seenAdmin = useSeen();
  seenAdmin("adminForMe", latestAdminForMe, (m) => {
    const text = m.text.length > 90 ? `${m.text.slice(0, 90)}…` : m.text;
    notify(
      `🔒 ${m.authorName}`,
      `Chat privé : ${text}`,
      "/chat?tab=private",
      "classheure-chat-prive",
    );
  });

  // ----- Flux : chat privé admin (message d'un élève) -----
  const latestStudentForAdmin = useQuery(
    api.app.getLatestStudentMessageForAdmin,
    {},
  ) as Latest & { studentId?: string };
  const seenStudent = useSeen();
  seenStudent("studentForAdmin", latestStudentForAdmin, (m) => {
    const text = m.text.length > 90 ? `${m.text.slice(0, 90)}…` : m.text;
    notify(
      `💬 ${m.authorName}`,
      `Chat privé : ${text}`,
      `/admin?tab=adminchat&student=${m.studentId}`,
      "classheure-chat-prive",
    );
  });

  // ----- Flux : salon des admins (message d'un autre admin) -----
  const latestSalon = useQuery(api.app.getLatestSalonMessage, {}) as Latest;
  const seenSalon = useSeen();
  seenSalon("salon", latestSalon, (m) => {
    if (window.location.pathname === "/admin") return;
    const text = m.text.length > 90 ? `${m.text.slice(0, 90)}…` : m.text;
    notify(
      `🛡️ ${m.authorName}`,
      `Salon admin : ${text}`,
      "/admin?tab=adminchat&student=salon",
      "classheure-chat-prive",
    );
  });

  // ----- Flux : forum (nouvelle question) -----
  const latestForum = useQuery(api.forum.getLatestForumThread, {}) as Latest;
  const seenForum = useSeen();
  seenForum("forum", latestForum, (t) => {
    notify(
      `❓ ${t.authorName}`,
      `Nouvelle question : ${t.title}`,
      "/forum",
      "classheure-forum",
    );
  });

  // ----- Flux : sondages (nouveau sondage) -----
  const latestPoll = useQuery(api.forum.getLatestPoll, {}) as Latest;
  const seenPoll = useSeen();
  seenPoll("poll", latestPoll, (p) => {
    const q = p.question.length > 90 ? `${p.question.slice(0, 90)}…` : p.question;
    notify(`📊 ${p.authorName}`, `Nouveau sondage : ${q}`, "/sondages", "classheure-sondage");
  });

  // Pendant qu'on est sur la page du chat de classe, on marque la section
  // « chat » lue toutes les 15 s pour éviter un décalage du point rouge.
  useEffect(() => {
    if (!isAuthenticated) return;
    const onRoute = () => {
      if (window.location.pathname === "/chat") {
        markSectionRead({ section: "chat" }).catch(() => {});
      }
    };
    onRoute();
    const iv = setInterval(onRoute, 15000);
    return () => clearInterval(iv);
  }, [isAuthenticated, markSectionRead]);

  if (isLoading || !isAuthenticated) return null;

  return (
    <>
      {showHintBar && (
        <button
          type="button"
          onClick={() => {
            setShowHint(false);
            if (typeof Notification !== "undefined") {
              Notification.requestPermission()
                .then((p) => setPermission(p))
                .catch(() => {});
            }
          }}
          className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-full border border-primary/40 bg-background/95 px-4 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:border-primary cursor-pointer"
        >
          <Bell className="size-3.5 text-primary" />
          Activer les notifications
          <BellOff className="size-3.5 text-muted-foreground" />
        </button>
      )}
    </>
  );
}
