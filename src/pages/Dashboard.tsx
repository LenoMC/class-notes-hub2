import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  GraduationCap,
  Hourglass,
  Shield,
  Sparkles,
  UserCog,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const OPTIONS = ["LCE", "Latin", "Allemand", "Espagnol"] as const;

type Me = NonNullable<ReturnType<typeof useAuth>["user"]>;

export default function Dashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const admins = useQuery(api.app.listAdmins);
  const classFiles = useQuery(api.app.listClassFiles, user?.classId ? {} : "skip");
  const claimAdmin = useMutation(api.app.claimAdminIfFirst);
  const todayName = DAYS_FR[new Date().getDay()];

  // Bootstrap : le tout premier utilisateur inscrit devient admin global.
  useEffect(() => {
    if (authLoading || !user) return;
    if (user.isAdmin || user.questionnaireDone) return;
    claimAdmin().catch(() => {});
  }, [authLoading, user, claimAdmin]);

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Zap className="size-7 animate-pulse text-primary" />
      </main>
    );
  }

  return (
    <AppShell isAdmin={user?.isAdmin}>
      {user && !user.questionnaireDone ? (
        <Questionnaire user={user} />
      ) : (
        user && (
          <>
            <HomeHeader user={user} todayName={todayName} />
            <TodaySchedule user={user} todayName={todayName} />
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <RecentFiles files={classFiles} />
              <AdminsCard admins={admins} />
            </div>
          </>
        )
      )}
    </AppShell>
  );
}

// ---------- Questionnaire (première connexion) ----------

function Questionnaire({ user }: { user: Me }) {
  const classes = useQuery(api.app.listClasses) ?? [];
  const submit = useMutation(api.app.submitQuestionnaire);
  const [classId, setClassId] = useState<Id<"classes"> | null>(null);
  const [option, setOption] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!classId) return;
    setSaving(true);
    try {
      await submit({
        classId,
        option: (option as (typeof OPTIONS)[number] | null) ?? null,
      });
      toast.success("C'est enregistré ⚡ Bienvenue dans ta classe !");
    } catch {
      toast.error("Impossible d'enregistrer. Réessaie.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="panel border-border/70 max-w-2xl mx-auto animate-bolt-pop">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary glow-ring-soft">
          <Sparkles className="size-6" />
        </div>
        <CardTitle className="text-2xl">
          Bienvenue{user.name ? `, ${user.name.split(" ")[0]}` : ""} !
        </CardTitle>
        <CardDescription>
          Avant d'entrer, dis-nous où tu es : ta réponse débloque ton emploi du temps
          personnalisé.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="mb-3 flex items-center gap-2 font-medium">
            <GraduationCap className="size-4 text-primary" /> Ta classe
          </p>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune classe n'est encore configurée par les administrateurs. Reviens
              plus tard !
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {classes.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => setClassId(c._id)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm font-medium transition-all cursor-pointer",
                    classId === c._id
                      ? "border-primary bg-primary/10 text-primary glow-ring-soft"
                      : "border-border bg-secondary/40 hover:border-primary/50",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-3 flex items-center gap-2 font-medium">
            <BookOpen className="size-4 text-primary" /> Ton option
            <span className="text-xs font-normal text-muted-foreground">(facultatif)</span>
          </p>
          <RadioGroup
            value={option ?? ""}
            onValueChange={setOption}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          >
            {OPTIONS.map((opt) => (
              <Label
                key={opt}
                htmlFor={`opt-${opt}`}
                className={cn(
                  "flex cursor-pointer items-center justify-center rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-sm font-medium transition-all hover:border-primary/50",
                  option === opt &&
                    "border-primary bg-primary/10 text-primary glow-ring-soft",
                )}
              >
                <RadioGroupItem value={opt} id={`opt-${opt}`} className="sr-only" />
                {opt}
              </Label>
            ))}
          </RadioGroup>
          {option && (
            <button
              type="button"
              onClick={() => setOption(null)}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Je n'ai pas d'option
            </button>
          )}
        </div>

        <Button
          className="w-full gap-2 glow-ring"
          size="lg"
          onClick={handleSubmit}
          disabled={saving || !classId}
        >
          <Zap className="size-4" />
          {saving ? "Enregistrement…" : "Valider et entrer"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------- En-tête accueil ----------

function HomeHeader({ user, todayName }: { user: Me; todayName: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {todayName} · {user.className ?? "Classe non définie"}
          {user.option ? ` · Option ${user.option}` : ""}
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          Salut{user.name ? `, ${user.name.split(" ")[0]}` : ""} ⚡
        </h1>
      </div>
      <div className="flex gap-2 items-center">
        {user.isClassAdmin && (
          <Badge variant="secondary" className="gap-1.5">
            <UserCog className="size-3.5 text-primary" /> Admin de classe
          </Badge>
        )}
        {user.isAdmin && (
          <Badge variant="secondary" className="gap-1.5">
            <Shield className="size-3.5 text-primary" /> Admin global
          </Badge>
        )}
        <Button asChild variant="outline">
          <Link to="/edt">
            <CalendarDays className="size-4 mr-1.5" /> EDT complet
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ---------- EDT du jour ----------

function TodaySchedule({ user, todayName }: { user: Me; todayName: string }) {
  const slots = useQuery(api.app.listMySlots) ?? [];
  const todaySlots = useMemo(
    () => slots.filter((s) => s.day === todayName),
    [slots, todayName],
  );
  const isWeekend = todayName === "Samedi" || todayName === "Dimanche";

  return (
    <Card className="panel border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="size-5 text-primary" /> Emploi du temps du jour
        </CardTitle>
        <CardDescription>
          Clique sur un cours pour retrouver ses fichiers dans l'onglet EDT.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {user.classId ? (
          todaySlots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Hourglass className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {isWeekend
                  ? "C'est le week-end, profite ! Aucun cours aujourd'hui."
                  : "Aucun cours programmé aujourd'hui."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {todaySlots.map((slot) => (
                <Link
                  key={slot._id}
                  to={`/edt?slot=${slot._id}`}
                  className="flex items-center gap-3 rounded-lg border border-border/70 bg-secondary/40 px-4 py-3 transition-colors hover:border-primary/50 cursor-pointer"
                >
                  <span className="font-mono text-xs text-primary w-12">
                    {slot.start}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{slot.subject}</p>
                    {slot.teacher && (
                      <p className="truncate text-xs text-muted-foreground">
                        {slot.teacher}
                      </p>
                    )}
                  </div>
                  {slot.room && (
                    <Badge variant="outline" className="text-xs">
                      {slot.room}
                    </Badge>
                  )}
                </Link>
              ))}
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucune classe sélectionnée. Complète le questionnaire.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Fichiers récents ----------

type ClassFiles = Exclude<
  ReturnType<typeof useQuery<typeof api.app.listClassFiles>>,
  undefined
>;

function RecentFiles({ files }: { files: ClassFiles | undefined }) {
  return (
    <Card className="panel border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardList className="size-5 text-primary" /> Devoirs & fichiers récents
        </CardTitle>
        <CardDescription>Les dernières publications de ta classe.</CardDescription>
      </CardHeader>
      <CardContent>
        {!files ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : files.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun fichier pour l'instant. Les admins de ta classe publieront ici.
          </p>
        ) : (
          <div className="space-y-2">
            {files.slice(0, 6).map((f) => (
              <div
                key={f._id}
                className="flex items-center gap-3 rounded-lg border border-border/70 bg-secondary/40 px-3 py-2.5 transition-colors hover:border-primary/50"
              >
                <span
                  className={cn(
                    "size-2 rounded-full shrink-0",
                    f.kind === "devoir" ? "bg-primary" : "bg-muted-foreground/60",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {f.subject} · {f.day} {f.start}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {f.kind}
                </Badge>
                {f.hasFile && <Download className="size-4 text-muted-foreground" />}
                {f.externalUrl && (
                  <ExternalLink className="size-4 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Admins ----------

type Admins = NonNullable<
  Awaited<ReturnType<typeof useQuery<typeof api.app.listAdmins>>>
>;

function AdminsCard({ admins }: { admins: Admins | undefined }) {
  return (
    <Card className="panel border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="size-5 text-primary" /> Les admins du site
        </CardTitle>
        <CardDescription>Ils gèrent les classes et les utilisateurs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Admins globaux
          </p>
          {!admins ? (
            <Skeleton className="h-10 w-40" />
          ) : admins.globals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun admin global.</p>
          ) : (
            <ul className="space-y-1.5">
              {admins.globals.map((a) => (
                <li key={a._id} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-primary" />
                  {a.name || a.email || "Admin"}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Admins de ta classe
          </p>
          {!admins ? (
            <Skeleton className="h-10 w-40" />
          ) : admins.classAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun admin de classe pour le moment.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {admins.classAdmins.map((a) => (
                <li key={a._id} className="flex items-center gap-2 text-sm">
                  <UserCog className="size-4 text-primary" />
                  {a.name || a.email || "Admin de classe"}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
