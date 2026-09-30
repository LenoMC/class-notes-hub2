import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  CalendarDays,
  CircleDot,
  FolderOpen,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Shield,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { to: "/edt", label: "EDT", icon: CalendarDays },
  { to: "/fiches", label: "Fiches", icon: FolderOpen },
  { to: "/chat", label: "Chat", icon: MessagesSquare },
  { to: "/forum", label: "Forum", icon: CircleDot },
  { to: "/sondages", label: "Sondages", icon: BarChart3 },
];

/** Associe chaque route au compteur de nouveautés correspondant. */
const UNREAD_BY_ROUTE: Record<string, keyof typeof COUNT_ZERO> = {
  "/chat": "chat",
  "/forum": "forum",
  "/sondages": "sondages",
};
const COUNT_ZERO = { chat: 0, forum: 0, sondages: 0 } as const;

/** Point rouge de l'onglet Administration (admins) : demandes d'accès en
 *  attente + messages privés des élèves non lus. */
function useAdminBadge(): number {
  const badges = useQuery(api.app.getAdminBadgeCounts, {}) as
    | { approvals: number; messages: number }
    | undefined;
  if (!badges) return 0;
  return badges.approvals + badges.messages;
}

export function AppShell({
  children,
  isAdmin,
}: {
  children: ReactNode;
  isAdmin?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Compteurs de nouveautés (point rouge) : chat / forum / sondages.
  // undefined tant que la requête charge, pour éviter le flash de points.
  const unread = useQuery(api.app.getUnreadCounts) as
    | { chat: number; forum: number; sondages: number }
    | undefined;
  // Point rouge Administration : approbations + chat privé (admins uniquement).
  const adminBadge = useAdminBadge();

  // Total des nouveautés affiché sur le bouton menu (mobile) : chat, forum,
  // sondages +, pour les admins, approbations et chat privé.
  const unreadTotal = unread ? unread.chat + unread.forum + unread.sondages : 0;
  const burgerBadge = unreadTotal + (isAdmin ? adminBadge : 0);

  const initials = (user?.name || user?.email || "?")
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase())
    .join("");

  const roleLabel = user?.isAdmin
    ? "Administrateur global"
    : user?.isClassAdmin
      ? "Responsable de classe"
      : "Élève";

  const links = (
    <>
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
        const section = UNREAD_BY_ROUTE[to];
        const count = unread ? unread[section] : 0;
        const showDot = unread !== undefined && count > 0;
        return (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-primary glow-ring-soft"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
              )
            }
          >
            <span className="relative inline-flex">
              <Icon className="size-4" />
              {showDot && (
                <span
                  className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground shadow"
                  aria-label={`${count} nouveautés`}
                >
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </span>
            {label}
          </NavLink>
        );
      })}
      {isAdmin && (
        <NavLink
          to="/admin"
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/15 text-primary glow-ring-soft"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            )
          }
        >
          <span className="relative inline-flex">
            <Shield className="size-4" />
            {adminBadge > 0 && (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground shadow"
                aria-label={`${adminBadge} action(s) en attente`}
              >
                {adminBadge > 9 ? "9+" : adminBadge}
              </span>
            )}
          </span>
          Administration
        </NavLink>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-14 items-center gap-3">
            {/* Burger mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="relative size-9 lg:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={
                burgerBadge > 0 ? `Menu — ${burgerBadge} nouveauté(s)` : "Menu"
              }
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              {!mobileOpen && burgerBadge > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground shadow"
                  aria-label={`${burgerBadge} nouveautés`}
                >
                  {burgerBadge > 9 ? "9+" : burgerBadge}
                </span>
              )}
            </Button>

            {/* Logo */}
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 cursor-pointer shrink-0"
              aria-label="Accueil Classheure"
            >
              <img src="/logo.svg" alt="Classheure" className="size-8 rounded-lg" />
              <span className="font-bold tracking-wide hidden sm:inline">
                Classheure
              </span>
            </button>

            {/* Navigation desktop */}
            <nav className="hidden lg:flex items-center gap-1 ml-4">{links}</nav>

            <div className="flex-1" />

            {/* Classe (mobile) */}
            {user?.className && (
              <Badge variant="secondary" className="lg:hidden shrink-0">
                {user.className}
              </Badge>
            )}

            {/* Profil — clic direct sur le nom/avatar : Mon compte */}
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-secondary/60 transition-colors cursor-pointer"
              aria-label="Mon compte"
              title={`${roleLabel} — ouvrir Mon compte`}
            >
              <Avatar className="size-8 border border-border">
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                  {initials || "?"}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:inline text-sm font-medium max-w-32 truncate">
                {user?.name || "Utilisateur"}
              </span>
            </button>
          </div>

          {/* Navigation mobile dépliée */}
          {mobileOpen && (
            <nav className="lg:hidden pb-3 flex flex-col gap-1 animate-bolt-pop">
              {links}
              {user?.className && (
                <p className="px-3 pt-1 text-xs text-muted-foreground">
                  Classe : {user.className}
                </p>
              )}
            </nav>
          )}
        </div>
      </header>

      {/* Contenu */}
      <main className="relative mx-auto w-full max-w-6xl px-3 sm:px-4 py-5 sm:py-8">
        {children}
      </main>
      <footer className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        Classheure — votre classe, documentée.
      </footer>
    </div>
  );
}
