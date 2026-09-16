import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { LayoutDashboard, LogOut, Shield, Zap } from "lucide-react";
import { NavLink, useNavigate } from "react-router";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { to: "/edt", label: "EDT", icon: Zap },
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

  return (
    <div className="min-h-screen bg-background bg-grid">
      <div className="absolute inset-0 bg-glow pointer-events-none h-[420px]" />
      <header className="relative z-10 border-b border-border/60 backdrop-blur-sm sticky top-0 bg-background/80">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-4">
          <NavLink to="/dashboard" className="shrink-0 cursor-pointer">
            <img src="/logo.svg" alt="Foudre" className="size-9 rounded-lg" />
          </NavLink>
          <div className="flex items-baseline gap-2 select-none">
            <span className="text-lg font-bold tracking-tight">Foudre</span>
            <span className="hidden sm:inline text-xs text-muted-foreground">
              cours & devoirs
            </span>
          </div>

          <nav className="ml-6 hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-foreground glow-ring-soft"
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
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-foreground glow-ring-soft"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                  )
                }
              >
                <Shield className="size-4" />
                Administration
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {user?.className && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {user.className}
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 w-10 rounded-full p-0">
                  <Avatar className="size-9 border border-border">
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                      {initials || "?"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm font-medium">{user?.name || "Élève"}</div>
                  <div className="text-xs text-muted-foreground font-normal truncate">
                    {user?.email}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                  <LayoutDashboard className="mr-2 size-4" /> Accueil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/edt")} className="sm:hidden">
                  <Zap className="mr-2 size-4" /> EDT
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={() => navigate("/admin")}
                    className="sm:hidden"
                  >
                    <Shield className="mr-2 size-4" /> Administration
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 size-4" /> Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="relative z-10 border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        ⚡ Foudre — propulsé par les délégués de ta classe
      </footer>
    </div>
  );
}
