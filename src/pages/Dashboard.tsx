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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { optionRuleError, subjectStyle } from "@/lib/subjects";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  GraduationCap,
  Hourglass,
  MessagesSquare,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCog,
  Users2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const OPTIONS = [
  "LCE",
  "Latin",
  "Allemand",
  "Espagnol",
  "Sécurité Civile",
] as const;

type Me = NonNullable<ReturnType<typeof useAuth>["user"]>;

type WeekState = {
  week: "A" | "B";
  isHoliday: boolean;
  holidayLabel: string | null;
  nextSchoolMonday: string | null;
};

export default function Dashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const admins = useQuery(api.app.listAdmins);
  const classFiles = useQuery(api.app.listClassFiles, user?.classId ? {} : "skip");
  const weekState = useQuery(api.app.weekState) as WeekState | undefined;
  const claimAdmin = useMutation(api.app.claimAdminIfFirst);
  const accessRequest = useQuery(api.app.myAccessRequest) as
    | AccessRequest
    | null
    | undefined;
  const todayName = DAYS_FR[new Date().getDay()];
  const isAdmin = !!user?.isAdmin;

  // Bootstrap : le tout premier utilisateur inscrit devient administrateur global.
  useEffect(() => {
    if (authLoading || !user || user.isAdmin || user.questionnaireDone) return;
    claimAdmin().catch(() => {});
  }, [authLoading, user, claimAdmin]);

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <img src="/logo.svg" alt="Classheure" className="size-10 animate-pulse rounded-lg" />
      </main>
    );
  }

  // Étape d'approbation : avant le questionnaire, sauf pour les admins globaux
  // et les comptes déjà approuvés.
  const needsApprovalGate =
    !!user &&
    !isAdmin &&
    !user.questionnaireDone &&
    accessRequest !== undefined &&
    accessRequest?.status !== "approved";

  return (
    <AppShell isAdmin={user?.isAdmin}>
      {needsApprovalGate ? (
        <ApprovalGate user={user!} request={accessRequest ?? null} />
      ) : user && !user.questionnaireDone ? (
        <Questionnaire user={user} />
      ) : (
        user && (
          <>
            {weekState?.isHoliday && <HolidayBanner weekState={weekState} />}
            <HomeHeader user={user} todayName={todayName} weekState={weekState} />
            <TodaySchedule user={user} todayName={todayName} weekState={weekState} />
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <ChatQuick user={user} />
              <div className="space-y-6">
                <RecentFiles files={classFiles} />
                <AdminsCard admins={admins} />
              </div>
            </div>
          </>
        )
      )}
    </AppShell>
  );
}

// ---------- Étape d'approbation d'accès (preuve Arsene76) ----------

type AccessRequest = {
  _id: string;
  status: "pending" | "approved" | "rejected";
  storageId: string;
  reviewNote: string | null;
  createdAt: number;
  reviewedAt: number | null;
};

function ApprovalGate({
  user,
  request,
}: {
  user: Me;
  request: AccessRequest | null;
}) {
  const generateUploadUrl = useMutation(api.app.generateUploadUrl);
  const submitRequest = useMutation(api.app.submitAccessRequest);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const pickFile = (f: File | null) => {
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file || sending) return;
    setSending(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();
      await submitRequest({ storageId });
      toast.success(
        "Demande envoyée ! Les administrateurs ont été notifiés par email.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Envoi impossible. Réessayez.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <Card className="panel border-border/70">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary glow-ring-soft">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle className="text-xl">Vérification d'identité</CardTitle>
          <CardDescription>
            Pour accéder à Classheure, envoyez une capture d'écran de votre profil
            sur <strong>Arsene76</strong> (le site du collège) pour prouver que
            c'est bien vous.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {request?.status === "pending" ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-400/15">
                <Hourglass className="size-6 text-amber-300" />
              </div>
              <div>
                <p className="font-semibold">Demande en cours d'examen</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Les administrateurs globaux ont été notifiés par email. Vous
                  recevrez l'accès dès validation — rechargez la page pour
                  vérifier.
                </p>
              </div>
            </div>
          ) : request?.status === "rejected" ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/15">
                <XCircle className="size-6 text-destructive" />
              </div>
              <div>
                <p className="font-semibold">Demande refusée</p>
                {request.reviewNote && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Motif : {request.reviewNote}
                  </p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                  Vous pouvez soumettre une nouvelle capture d'écran.
                </p>
              </div>
              <ProofForm
                onPick={pickFile}
                onSubmit={handleSubmit}
                sending={sending}
                hasFile={!!file}
              />
            </div>
          ) : (
            <ProofForm
              onPick={pickFile}
              onSubmit={handleSubmit}
              sending={sending}
              hasFile={!!file}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProofForm({
  onPick,
  onSubmit,
  sending,
  hasFile,
}: {
  onPick: (f: File | null) => void;
  onSubmit: () => void;
  sending: boolean;
  hasFile: boolean;
}) {
  return (
    <div className="space-y-4">
      <label
        htmlFor="proof-upload"
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/40 px-6 py-8 text-center transition-colors hover:border-primary/60"
      >
        <Upload className="size-7 text-primary" />
        <span className="text-sm font-medium">
          Cliquez pour choisir votre capture d'écran
        </span>
        <span className="text-xs text-muted-foreground">
          PNG, JPG ou WebP — montrant votre profil Arsene76
        </span>
        <input
          id="proof-upload"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
      <Button
        className="w-full"
        disabled={!hasFile || sending}
        onClick={onSubmit}
      >
        {sending ? "Envoi en cours…" : "Envoyer ma demande"}
      </Button>
    </div>
  );
}

// ---------- Questionnaire (première connexion uniquement) ----------

function Questionnaire({ user }: { user: Me }) {
  const classes = useQuery(api.app.listClasses) ?? [];
  const submit = useMutation(api.app.submitQuestionnaire);
  const [classId, setClassId] = useState<Id<"classes"> | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [group, setGroup] = useState<"G1" | "G2" | null>(null);
  const [saving, setSaving] = useState(false);

  const ruleError = optionRuleError(options);

  const toggleOption = (opt: string) => {
    setOptions((prev) => {
      const next = prev.includes(opt)
        ? prev.filter((o) => o !== opt)
        : [...prev, opt];
      // Interdiction immédiate : Allemand + Espagnol ensemble
      if (next.includes("Allemand") && next.includes("Espagnol")) {
        return next.includes(opt)
          ? next.filter((o) => o !== (opt === "Allemand" ? "Espagnol" : "Allemand"))
          : next.filter((o) => o !== opt || opt === "Allemand" || opt === "Espagnol");
      }
      return next.slice(0, 4);
    });
  };

  const handleSubmit = async () => {
    if (!classId) return;
    const err = optionRuleError(options);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      await submit({
        classId,
        options: options as (typeof OPTIONS)[number][],
        ...(group ? { group } : {}),
      });
      toast.success("Préférences enregistrées. Bienvenue dans votre espace.");
    } catch (e2) {
      toast.error(
        e2 instanceof Error && !e2.message.startsWith("{")
          ? e2.message
          : "Impossible d'enregistrer. Réessayez.",
      );
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
          Bienvenue{user.name ? `, ${user.name.split(" ")[0]}` : ""}
        </CardTitle>
        <CardDescription>
          Avant de continuer, indiquez votre classe et vos options. Ces informations
          déterminent votre emploi du temps et vos ressources.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="mb-3 flex items-center gap-2 font-medium">
            <GraduationCap className="size-4 text-primary" /> Votre classe
          </p>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune classe n'est encore configurée par les administrateurs.
              Revenez plus tard.
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
          <p className="mb-1 flex items-center gap-2 font-medium">
            <BookOpen className="size-4 text-primary" /> Vos options
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Au moins une langue : <strong>Allemand</strong> ou <strong>Espagnol</strong>{" "}
            (pas les deux). Vous pouvez y ajouter <strong>LCE</strong>,{" "}
            <strong>Latin</strong> et/ou <strong>Sécurité Civile</strong> — 4
            options maximum.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => toggleOption(opt)}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                  options.includes(opt)
                    ? "border-primary bg-primary/10 text-primary glow-ring-soft"
                    : "border-border bg-secondary/40 hover:border-primary/50",
                )}
              >
                {options.includes(opt) && <CheckCircle2 className="size-3.5" />}
                {opt}
              </button>
            ))}
          </div>
          {ruleError && (
            <p className="mt-2 text-xs text-destructive">{ruleError}</p>
          )}
        </div>

        <div>
          <p className="mb-1 flex items-center gap-2 font-medium">
            <Users2 className="size-4 text-primary" /> Groupe
            <span className="text-xs font-normal text-muted-foreground">
              (si votre classe fonctionne par groupes)
            </span>
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Votre classe est peut-être répartie en deux groupes. Le responsable
            de votre classe peut modifier cette attribution à tout moment.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["G1", "Groupe 1"],
                ["G2", "Groupe 2"],
              ] as const
            ).map(([g, label]) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup((cur) => (cur === g ? null : g))}
                className={cn(
                  "cursor-pointer rounded-lg border px-3 py-2.5 text-sm font-medium transition-all text-left",
                  group === g
                    ? "border-primary bg-primary/10 text-primary glow-ring-soft"
                    : "border-border bg-secondary/40 hover:border-primary/50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Button
          className="w-full glow-ring"
          size="lg"
          onClick={handleSubmit}
          disabled={saving || !classId || !!ruleError}
        >
          {saving ? "Enregistrement…" : "Valider et continuer"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------- Bandeau vacances ----------

function HolidayBanner({ weekState }: { weekState: WeekState }) {
  const label = weekState.holidayLabel ?? "Vacances scolaires";
  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3">
      <CalendarOff className="size-5 text-amber-300 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-amber-100">
          {label} — pas de cours en ce moment.
        </p>
        <p className="text-xs text-amber-200/80">
          L'alternance semaine A / semaine B reprendra le lundi de la rentrée.
        </p>
      </div>
    </div>
  );
}

// ---------- En-tête accueil ----------

function HomeHeader({
  user,
  todayName,
  weekState,
}: {
  user: Me;
  todayName: string;
  weekState: WeekState | undefined;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {todayName} · {user.className ?? "Classe non définie"}
          {user.options.length > 0 ? ` · ${user.options.join(", ")}` : ""}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Bonjour{user.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {user.isClassAdmin && (
          <Badge variant="secondary" className="gap-1.5">
            <UserCog className="size-3.5 text-primary" />
            Responsable{user.adminOfClassName ? ` — ${user.adminOfClassName}` : " de classe"}
          </Badge>
        )}
        {user.isAdmin && (
          <Badge variant="secondary" className="gap-1.5">
            <Shield className="size-3.5 text-primary" /> Administrateur
          </Badge>
        )}
        <Badge
          variant="outline"
          className={cn(
            "gap-1.5 font-mono",
            !weekState?.isHoliday && "border-primary/50 text-primary",
          )}
        >
          <CalendarDays className="size-3.5" />
          {weekState?.isHoliday
            ? "Vacances"
            : weekState
              ? `Semaine ${weekState.week} (actuelle)`
              : "Semaine…"}
        </Badge>
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

function TodaySchedule({
  user,
  todayName,
  weekState,
}: {
  user: Me;
  todayName: string;
  weekState: WeekState | undefined;
}) {
  const week: "A" | "B" = weekState?.week ?? "A";
  const isHoliday = !!weekState?.isHoliday;
  const slots =
    useQuery(
      api.app.listMySlots,
      isHoliday ? "skip" : { week },
    ) ?? [];
  const todaySlots = useMemo(
    () =>
      [...slots]
        .filter((s) => s.day === todayName)
        .sort((a, b) => a.start.localeCompare(b.start)),
    [slots, todayName],
  );
  const isWeekend = todayName === "Samedi" || todayName === "Dimanche";

  return (
    <Card className="panel border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="size-5 text-primary" /> Emploi du temps du jour
          <Badge variant="outline" className="text-[10px] font-mono">
            semaine {week}
          </Badge>
        </CardTitle>
        <CardDescription>
          Sélectionnez un cours pour retrouver ses fichiers dans l'onglet EDT.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {user.classId ? (
          isWeekend || isHoliday || todaySlots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Hourglass className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {isWeekend
                  ? "C'est le week-end. Aucun cours programmé."
                  : isHoliday
                    ? "Vacances scolaires : aucun cours pendant cette période."
                    : `Aucun cours programmé aujourd'hui pour la semaine ${week}.`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {todaySlots.map((slot) => (
                <div
                  key={slot._id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-border/70 bg-secondary/40 px-4 py-3 transition-colors hover:border-primary/50",
                    slot.cancelled && "opacity-70",
                  )}
                >
                  <span className="font-mono text-xs text-primary w-12">
                    {slot.start}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <span
                        className="mr-2 inline-block rounded-full px-2.5 py-0.5 font-semibold"
                        style={subjectStyle(slot.subject, (slot as { color?: string }).color)}
                      >
                        {slot.subject}
                      </span>
                      {slot.cancelled && (
                        <span className="text-xs text-destructive">(annulé)</span>
                      )}
                      {slot.weekType !== "AB" && (
                        <Badge variant="outline" className="ml-2 text-[10px] font-mono">
                          {slot.weekType}
                        </Badge>
                      )}
                    </p>
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
                  {!slot.cancelled && (
                    <Button asChild variant="ghost" size="sm" className="text-xs">
                      <Link to={`/edt?slot=${slot._id}`}>Voir les devoirs</Link>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucune classe sélectionnée. Complétez le questionnaire ci-dessus.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Accès rapide au chat ----------

type QuickMessage = {
  _id: string;
  text: string;
  createdAt: number;
  authorId: string;
  mine: boolean;
};

function timeShort(ts: number) {
  return new Date(ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ChatQuick({ user }: { user: Me }) {
  const messages = useQuery(api.app.listChatMessages, { limit: 4 }) as
    | QuickMessage[]
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

  const names = new Map<string, string>();
  if (members) {
    for (const m of members) {
      names.set(m._id, m.name || m.email || "Membre");
    }
  }

  const noClass = !user.classId && !user.adminOfClassId;

  const handleSend = async () => {
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

  return (
    <Card className="panel flex flex-col border-border/70 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessagesSquare className="size-5 text-primary" /> Chat de classe
          </CardTitle>
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
            <Link to="/chat">
              Ouvrir <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </div>
        <CardDescription>
          Les derniers messages en direct — répondez sans quitter l'accueil.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {noClass ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Rejoignez une classe pour accéder au chat.
          </p>
        ) : !messages ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun message pour l'instant. Lancez la discussion !
          </p>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => (
              <div key={m._id} className={cn("flex", m.mine && "justify-end")}>
                <div
                  className={cn(
                    "max-w-[80%] space-y-0.5 rounded-3xl px-3.5 py-2 text-sm leading-snug",
                    m.mine
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm border border-border bg-secondary",
                  )}
                >
                  {!m.mine && (
                    <p className="text-[10px] font-semibold text-primary">
                      {names.get(m.authorId) ?? "Membre"}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap line-clamp-2">
                    {m.text || "(fiche jointe)"}
                  </p>
                  <p
                    className={cn(
                      "text-[10px]",
                      m.mine
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground",
                    )}
                  >
                    {timeShort(m.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        {!noClass && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="mt-auto flex items-center gap-2"
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Répondre au chat…"
              maxLength={1000}
              className="h-9 flex-1 rounded-full bg-secondary"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim() || sending}
              className="size-9 shrink-0 rounded-full"
              aria-label="Envoyer"
            >
              <Send className="size-4" />
            </Button>
          </form>
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
        <CardDescription>Les dernières publications de votre classe.</CardDescription>
      </CardHeader>
      <CardContent>
        {!files ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : files.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun fichier pour l'instant. Les responsables de votre classe publieront
            leurs documents ici.
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
          <Shield className="size-5 text-primary" /> Administration du site
        </CardTitle>
        <CardDescription>
          Ils structurent le site, les classes et les comptes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Administrateurs globaux
          </p>
          {!admins ? (
            <Skeleton className="h-10 w-40" />
          ) : admins.globals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun administrateur global pour le moment.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {admins.globals.map((a) => (
                <li key={a._id} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-primary" />
                  {a.name || a.email || "Administrateur"}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Responsables de votre classe
          </p>
          {!admins ? (
            <Skeleton className="h-10 w-40" />
          ) : admins.classAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun responsable nommé pour votre classe pour le moment.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {admins.classAdmins.map((a) => (
                <li key={a._id} className="flex items-center gap-2 text-sm">
                  <UserCog className="size-4 text-primary" />
                  {a.name || a.email || "Responsable"}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
