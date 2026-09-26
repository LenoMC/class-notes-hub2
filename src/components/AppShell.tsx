import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Settings,
  Shield,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { to: "/edt", label: "EDT", icon: CalendarDays },
  { to: "/fiches", label: "Fiches", icon: FolderOpen },
  { to: "/chat", label: "Chat", icon: MessagesSquare },
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

  const links = (
    <>
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
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
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
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
          <Shield className="size-4" />
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
              className="size-9 lg:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menu"
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>

            {/* Logo */}
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 cursor-pointer shrink-0"
              aria-label="Accueil Recoursy"
            >
              <img src="/logo.svg" alt="Recoursy" className="size-8 rounded-lg" />
              <span className="font-bold tracking-wide hidden sm:inline">
                Recoursy
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

            {/* Profil */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-secondary/60 transition-colors cursor-pointer"
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
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">
                    {user?.name || "Utilisateur"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-primary">
                    {roleLabel}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => navigate("/settings")}
                >
                  <Settings className="mr-2 size-4" /> Mon compte
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-2 size-4" /> Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        Recoursy — votre classe, documentée.
      </footer>
    </div>
  );
}
