import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  BookOpen,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

type Fiche = {
  _id: Id<"courseFiles">;
  title: string;
  kind: "cours" | "devoir";
  description: string | null;
  fileName: string;
  fileType: string;
  createdAt: number;
  hasFile: boolean;
  storageId: Id<"_storage"> | null;
  externalUrl: string | null;
  slotId: Id<"timetableSlots">;
  day: string;
  start: string;
  subject: string;
};

function dateLabel(ts: number) {
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DownloadBtn({ fiche }: { fiche: Fiche }) {
  const getUrl = useQuery(
    api.app.getFileUrl,
    fiche.hasFile && fiche.storageId
      ? { storageId: fiche.storageId }
      : "skip",
  );
  if (!fiche.hasFile) return null;
  if (getUrl === undefined) {
    return <Download className="size-4 animate-pulse text-muted-foreground" />;
  }
  if (!getUrl) {
    return <Download className="size-4 text-muted-foreground/40" />;
  }
  return (
    <Button asChild variant="ghost" size="icon" className="size-8">
      <a href={getUrl} target="_blank" rel="noreferrer" aria-label="Télécharger">
        <Download className="size-4 text-primary" />
      </a>
    </Button>
  );
}

const FILTERS = [
  { value: "all", label: "Tout", icon: FolderOpen },
  { value: "cours", label: "Cours", icon: BookOpen },
  { value: "devoir", label: "Devoirs", icon: ClipboardList },
] as const;

export default function Fiches() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const fiches = useQuery(
    api.app.listClassFiles,
    user?.classId
      ? filter === "all"
        ? {}
        : { kind: filter }
      : "skip",
  ) as Fiche[] | undefined;

  // Regroupement par matière (ordre alphabétique)
  const bySubject = new Map<string, Fiche[]>();
  if (fiches) {
    for (const f of fiches) {
      const key = f.subject || "Autre";
      const list = bySubject.get(key) ?? [];
      list.push(f);
      bySubject.set(key, list);
    }
  }
  const subjects = [...bySubject.keys()].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary glow-ring-soft">
            <FolderOpen className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fiches</h1>
            <p className="text-sm text-muted-foreground">
              Toutes les fiches de cours et devoirs publiés sur l'emploi du temps
              {user?.className ? ` de ${user.className}` : ""}.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-secondary/40 p-1">
          {FILTERS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                filter === value
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {!user?.classId ? (
        <Card className="panel border-border/70">
          <CardContent className="py-12 text-center">
            <FolderOpen className="mx-auto size-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              Rejoignez d'abord une classe depuis le questionnaire d'accueil pour
              consulter les fiches.
            </p>
          </CardContent>
        </Card>
      ) : !fiches ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : fiches.length === 0 ? (
        <Card className="panel border-border/70">
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto size-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              Aucune fiche pour l'instant. Les fiches ajoutées sur l'EDT
              apparaîtront ici automatiquement.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {subjects.map((subject) => {
            const list = bySubject.get(subject)!;
            return (
              <Card key={subject} className="panel border-border/70">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="size-4 text-primary" />
                    {subject}
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {list.length}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {list.length === 1
                      ? "1 fiche publiée"
                      : `${list.length} fiches publiées`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {list
                    .slice()
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((f) => (
                      <div
                        key={f._id}
                        className="flex items-center gap-3 rounded-lg border border-border/70 bg-secondary/40 px-3 py-2.5 transition-colors hover:border-primary/50"
                      >
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            f.kind === "devoir"
                              ? "bg-primary"
                              : "bg-muted-foreground/60",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {f.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {f.description
                              ? `${f.description} · `
                              : ""}
                            Publiée le {dateLabel(f.createdAt)}
                          </p>
                        </div>
                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                          {f.day} {f.start}
                        </span>
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px] uppercase"
                        >
                          {f.kind}
                        </Badge>
                        {f.externalUrl && (
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                          >
                            <a
                              href={f.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Ouvrir le lien"
                            >
                              <ExternalLink className="size-4 text-primary" />
                            </a>
                          </Button>
                        )}
                        <div className="shrink-0">
                          <DownloadBtn fiche={f} />
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
