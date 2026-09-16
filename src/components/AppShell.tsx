import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Shield,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { to: "/edt", label: "EDT", icon: CalendarDays },
];

export function AppShell({
  children,
  isAdmin,
}: {
  children: ReactNode;
  isAdmin?: boolean;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

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

  const nav = (
    <>
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/15 text-primary glow-ring-soft"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
      {isAdmin && (
        <>
          <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Administration
          </p>
          <NavLink
            to="/admin"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-primary glow-ring-soft"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
              )
            }
          >
            <Shield className="size-4" />
            Administration
          </NavLink>
        </>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden lg:flex w-60 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2.5 h-16 px-5 border-b border-sidebar-border/60">
          <img src="/logo.svg" alt="CoursFlow" className="size-9 rounded-lg" />
          <span className="text-lg font-bold tracking-wide">CoursFlow</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">{nav}</nav>
        <div className="border-t border-sidebar-border/60 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <Avatar className="size-9 border border-sidebar-border">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name || "Utilisateur"}</p>
              <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={handleSignOut}
              title="Se déconnecter"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar mobile */}
      {mobileOpen && (
        <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar lg:hidden animate-bolt-pop">
          <div className="flex items-center gap-2.5 h-16 px-5 border-b border-sidebar-border/60">
            <img src="/logo.svg" alt="CoursFlow" className="size-9 rounded-lg" />
            <span className="text-lg font-bold tracking-wide">CoursFlow</span>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-8"
              onClick={() => setMobileOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">{nav}</nav>
          <div className="border-t border-sidebar-border/60 p-3">
            <Button variant="outline" className="w-full gap-2" onClick={handleSignOut}>
              <LogOut className="size-4" /> Se déconnecter
            </Button>
          </div>
        </aside>
      )}

      {/* Contenu */}
      <div className="lg:pl-60 flex flex-col min-h-screen">
        {/* Topbar mobile */}
        <header className="lg:hidden sticky top-0 z-10 flex items-center gap-3 h-14 px-4 border-b border-border/60 bg-background/85 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => setMobileOpen(true)}
            aria-label="Menu"
          >
            <span className="flex flex-col gap-1">
              <span className="block w-5 h-0.5 bg-foreground rounded" />
              <span className="block w-5 h-0.5 bg-foreground rounded" />
              <span className="block w-5 h-0.5 bg-foreground rounded" />
            </span>
          </Button>
          <img src="/logo.svg" alt="CoursFlow" className="size-8 rounded-lg" />
          <span className="font-bold tracking-wide">CoursFlow</span>
          {user?.className && (
            <Badge variant="secondary" className="ml-auto">
              {user.className}
            </Badge>
          )}
        </header>

        <main className="relative flex-1 mx-auto w-full max-w-6xl px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
          CoursFlow — votre classe, documentée.
        </footer>
      </div>
    </div>
  );
}
