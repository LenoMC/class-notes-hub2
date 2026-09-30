import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { isEpsSubject, optionRuleError } from "@/lib/subjects";
import { periodLabel, periodsForDay } from "@/lib/periods";
import { TypingBubble } from "@/components/TypingDots";
import {
  dayToUTC,
  monthWeeks,
  schoolYearStart,
  utcToDay,
  weekLabelFor,
  DAY_MS,
} from "@/lib/weeks";
import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "react-router";
import {
  ArrowLeft,
  CalendarOff,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  MessageSquareLock,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"] as const;
const OPTIONS = [
  "LCE",
  "Latin",
  "Allemand",
  "Espagnol",
  "Sécurité Civile",
] as const;

type AccessRequestRow = {
  _id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  storageId: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: number;
  reviewedAt: number | null;
};

type WeekState = {
  week: "A" | "B";
  isHoliday: boolean;
  holidayLabel: string | null;
  nextSchoolMonday: string | null;
};

export default function Admin() {
  const { user } = useAuth();
  const allRequests = useQuery(api.app.listAccessRequests, {}) as
    | AccessRequestRow[]
    | undefined;
  const pendingCount =
    allRequests?.filter((r) => r.status === "pending").length ?? 0;
  const adminBadges = useQuery(api.app.getAdminBadgeCounts, {}) as
    | { approvals: number; messages: number }
    | undefined;
  const msgBadge = adminBadges?.messages ?? 0;

  if (!user) return null;
  if (!user.isAdmin) {
    return (
      <AppShell isAdmin={false}>
        <Card className="panel border-border/70 max-w-md mx-auto text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
              <Shield className="size-6" />
            </div>
            <CardTitle>Accès réservé</CardTitle>
            <CardDescription>
              Cette page est réservée aux administrateurs globaux du site.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  // Onglet actif pilotable par URL (notifications : /admin?tab=adminchat…)
  const [tabParam] = useSearchParams();
  const tab = tabParam.get("tab");

  return (
    <AppShell isAdmin>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Administration</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Classes prédéfinies, emplois du temps, comptes utilisateurs et calendrier
        scolaire.
      </p>
      <Tabs defaultValue="approvals" value={tab ?? undefined} className="space-y-4">
        <div className="w-full overflow-x-auto pb-1">
          <TabsList className="inline-flex h-9 w-max min-w-full max-w-none bg-secondary/60">
            <TabsTrigger value="approvals" className="shrink-0 gap-1.5 px-3">
              <ShieldCheck className="size-4" /> Approbations
              {pendingCount > 0 && (
                <Badge className="ml-1 h-5 px-1.5 text-[10px]">{pendingCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="classes" className="shrink-0 gap-1.5 px-3">
              <Plus className="size-4" /> Classes
            </TabsTrigger>
            <TabsTrigger value="edt" className="shrink-0 gap-1.5 px-3">
              <CalendarPlus className="size-4" /> Emplois du temps
            </TabsTrigger>
            <TabsTrigger value="users" className="shrink-0 gap-1.5 px-3">
              <Users className="size-4" /> Utilisateurs
            </TabsTrigger>
            <TabsTrigger value="adminchat" className="shrink-0 gap-1.5 px-3">
              <MessageSquareLock className="size-4" /> Chat
              {msgBadge > 0 && (
                <Badge className="ml-1 h-5 px-1.5 text-[10px]">{msgBadge}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="holidays" className="shrink-0 gap-1.5 px-3">
              <CalendarOff className="size-4" /> Vacances & semaines
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="approvals">
          <ApprovalsTab />
        </TabsContent>
        <TabsContent value="classes">
          <ClassesTab />
        </TabsContent>
        <TabsContent value="edt">
          <TimetableAdminTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="adminchat">
          <AdminChatTab />
        </TabsContent>
        <TabsContent value="holidays">
          <HolidaysTab />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

// ---------- Onglet Approbations (preuves Arsene76) ----------

function ApprovalsTab() {
  const requests = useQuery(api.app.listAccessRequests, {}) as
    | AccessRequestRow[]
    | undefined;
  const review = useMutation(api.app.reviewAccessRequest);
  const [filter, setFilter] = useState<
    "pending" | "approved" | "rejected"
  >("pending");

  const rows = (requests ?? []).filter((r) => r.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-secondary/40 p-1 w-fit">
        {(
          [
            { value: "pending", label: "En attente", icon: Clock },
            { value: "approved", label: "Approuvées", icon: CheckCircle2 },
            { value: "rejected", label: "Refusées", icon: XCircle },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
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

      {!requests ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="panel border-border/70">
          <CardContent className="py-10 text-center">
            <ShieldCheck className="mx-auto size-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              Aucune demande {filter === "pending" ? "en attente" : filter === "approved" ? "approuvée" : "refusée"}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <ApprovalCard key={r._id} request={r} onReview={review} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({
  request,
  onReview,
}: {
  request: AccessRequestRow;
  onReview: (opts: {
    requestId: Id<"accessRequests">;
    approve: boolean;
    note?: string;
  }) => Promise<unknown>;
}) {
  const imageUrl = useQuery(api.app.getAccessImageUrl, {
    storageId: request.storageId as Id<"_storage">,
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [zoom, setZoom] = useState(false);

  const act = async (approve: boolean) => {
    setBusy(true);
    try {
      await onReview({
        requestId: request._id as Id<"accessRequests">,
        approve,
        note: approve ? undefined : note || undefined,
      });
      toast.success(approve ? "Accès approuvé." : "Demande refusée.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="panel border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-primary" />
          {request.userName || request.userEmail}
        </CardTitle>
        <CardDescription className="text-xs">
          {request.userEmail} · demande du{" "}
          {new Date(request.createdAt).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {imageUrl ? (
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="block w-full cursor-zoom-in"
          >
            <img
              src={imageUrl}
              alt={`Preuve de ${request.userName || request.userEmail}`}
              className="mx-auto max-h-56 rounded-xl border border-border object-contain"
            />
          </button>
        ) : (
          <Skeleton className="h-56 w-full" />
        )}

        {request.status === "pending" ? (
          <>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Motif du refus (optionnel)"
              className="h-9 bg-secondary"
            />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={busy}
                onClick={() => act(true)}
              >
                <Check className="mr-1.5 size-4" /> Approuver
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={busy}
                onClick={() => act(false)}
              >
                <X className="mr-1.5 size-4" /> Refuser
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {request.status === "approved" ? "Approuvée" : "Refusée"}
            {request.reviewNote ? ` — ${request.reviewNote}` : ""}
            {request.reviewedAt
              ? ` le ${new Date(request.reviewedAt).toLocaleDateString("fr-FR")}`
              : ""}
          </p>
        )}
      </CardContent>

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Preuve — {request.userName || request.userEmail}
            </DialogTitle>
            <DialogDescription>
              Capture d'écran Arsene76 soumise par {request.userEmail}.
            </DialogDescription>
          </DialogHeader>
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Preuve en grand"
              className="mx-auto max-h-[60vh] rounded-xl border border-border object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- Onglet Classes ----------

function ClassesTab() {
  const classes = useQuery(api.app.listClasses);
  const create = useMutation(api.app.createClass);
  const rename = useMutation(api.app.renameClass);
  const remove = useMutation(api.app.deleteClass);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<Id<"classes"> | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deletingId, setDeletingId] = useState<Id<"classes"> | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await create({ name: name.trim() });
      toast.success(`Classe « ${name.trim()} » créée.`);
      setName("");
    } catch {
      toast.error("Création impossible.");
    }
  };

  const handleRename = async () => {
    if (!editingId || !editingName.trim()) return;
    try {
      await rename({ classId: editingId, name: editingName.trim() });
      toast.success("Classe renommée.");
      setEditingId(null);
    } catch {
      toast.error("Renommage impossible.");
    }
  };

  const handleDelete = async (classId: Id<"classes">) => {
    setDeletingId(classId);
    try {
      await remove({ classId });
      toast.success("Classe supprimée (cours, fichiers et affectations nettoyés).");
    } catch {
      toast.error("Suppression impossible.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="panel border-border/70">
        <CardHeader>
          <CardTitle className="text-lg">Nouvelle classe</CardTitle>
          <CardDescription>
            Ex. « 3ème A », « 4ème B ». Les élèves la choisiront au questionnaire.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="3ème A" />
            <Button type="submit" className="gap-1.5 shrink-0">
              <Plus className="size-4" /> Créer
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="panel border-border/70 lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Classes prédéfinies</CardTitle>
          <CardDescription>
            Renommez ou supprimez. Supprimer une classe efface aussi son emploi du
            temps et ses fichiers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!classes ? (
            <Skeleton className="h-24 w-full" />
          ) : classes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucune classe pour l'instant.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => (
                <div
                  key={c._id}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 pl-3 pr-1.5 py-1.5"
                >
                  {editingId === c._id ? (
                    <>
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="bg-transparent text-sm outline-none w-24"
                        autoFocus
                      />
                      <Button variant="ghost" size="icon" className="size-7" onClick={handleRename}>
                        <Check className="size-3.5 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditingId(null)}>
                        <X className="size-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium">{c.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => {
                          setEditingId(c._id);
                          setEditingName(c.name);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => handleDelete(c._id)}
                        disabled={deletingId === c._id}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Onglet EDT par classe ----------

function TimetableAdminTab() {
  const classes = useQuery(api.app.listClasses);
  const [classId, setClassId] = useState<Id<"classes"> | null>(null);
  const selected = classId ?? classes?.[0]?._id ?? null;

  return (
    <Card className="panel border-border/70">
      <CardHeader>
        <CardTitle className="text-lg">Emploi du temps par classe</CardTitle>
        <CardDescription>
          Choisissez une classe puis gérez ses créneaux, semaine A et semaine B.
          Pas de cours le week-end ; le mercredi, les cours s'arrêtent au plus tard
          à 12:10.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!classes ? (
          <Skeleton className="h-24 w-full" />
        ) : classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Créez d'abord une classe.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {classes.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => setClassId(c._id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all cursor-pointer",
                    selected === c._id
                      ? "border-primary bg-primary/10 text-primary glow-ring-soft"
                      : "border-border bg-secondary/40 hover:border-primary/50",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {selected && <ClassSlotManager classId={selected} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const COMMON_SUBJECTS = [
  "Français",
  "Mathématiques",
  "Histoire-Géographie",
  "Anglais",
  "Espagnol",
  "Allemand",
  "Physique-Chimie",
  "SVT",
  "Technologie",
  "EPS",
  "Arts Plastiques",
  "Musique",
  "Latin",
  "LCE",
  "Vie de classe",
];

function ClassSlotManager({ classId }: { classId: Id<"classes"> }) {
  const [week, setWeek] = useState<"A" | "B" | "AB">("AB");
  const slots = useQuery(api.app.listSlots, { classId, week: week === "AB" ? undefined : week });
  const upsert = useMutation(api.app.upsertSlot);
  const remove = useMutation(api.app.deleteSlot);
  const [day, setDay] = useState<string>("Lundi");
  const [start, setStart] = useState("08:15");
  const [end, setEnd] = useState("09:10");
  const [subject, setSubject] = useState("");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [weekType, setWeekType] = useState<"A" | "B" | "AB">("AB");
  const [saving, setSaving] = useState(false);
  // Seule l'EPS peut chevaucher plusieurs créneaux : le champ Fin est
  // débloqué uniquement quand la matière saisie est l'EPS.
  const epsSelected = isEpsSubject(subject);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await upsert({
        classId,
        day: day as (typeof DAYS)[number],
        start,
        end,
        subject: subject.trim(),
        teacher: teacher.trim() || undefined,
        room: room.trim() || undefined,
        weekType,
      });
      toast.success("Créneau ajouté.");
      setSubject("");
      setTeacher("");
      setRoom("");
    } catch (err) {
      toast.error(
        err instanceof Error && !err.message.startsWith("{")
          ? err.message
          : "Ajout impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (slotId: Id<"timetableSlots">) => {
    try {
      await remove({ slotId });
      toast.success("Créneau supprimé.");
    } catch {
      toast.error("Suppression impossible.");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={handleAdd} className="space-y-3 rounded-lg border border-border/70 bg-secondary/30 p-4">
        <p className="font-medium text-sm">Ajouter un créneau</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="adm-day">Jour</Label>
            <select
              id="adm-day"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adm-room">Salle</Label>
            <Input id="adm-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="B204" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adm-start">Début</Label>
            <select
              id="adm-start"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                const sp = periodsForDay(day).find(
                  (p) => p.start === e.target.value,
                );
                // Hors EPS, la fin suit toujours le créneau de début
                if (sp && (end <= e.target.value || !epsSelected))
                  setEnd(sp.end);
              }}
              className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm font-mono"
              required
            >
              {periodsForDay(day).map((p) => (
                <option key={p.id} value={p.start}>
                  {periodLabel(p.start, p.end)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adm-end">Fin</Label>
            <select
              id="adm-end"
              value={end}
              disabled={!epsSelected}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm font-mono disabled:cursor-not-allowed disabled:opacity-60"
              required
            >
              {(epsSelected
                ? periodsForDay(day).filter((p) => p.end > start)
                : periodsForDay(day).filter(
                    (p) => p.start === start && p.end === end,
                  )
              ).map((p) => (
                <option key={p.id} value={p.end}>
                  {p.end}
                </option>
              ))}
            </select>
            {!epsSelected && (
              <p className="text-xs text-muted-foreground">
                Seule l'EPS peut occuper plusieurs créneaux d'affilée.
              </p>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Semaine (cochez A ou B)</Label>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(
              [
                ["AB", "Toutes"],
                ["A", "Semaine A"],
                ["B", "Semaine B"],
              ] as const
            ).map(([w, label]) => (
              <Button
                key={w}
                type="button"
                variant={weekType === w ? "default" : "ghost"}
                size="sm"
                className="flex-1 rounded-none"
                onClick={() => setWeekType(w)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adm-subject">Matière</Label>
          <Input
            id="adm-subject"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              // Si l'on quitte l'EPS, la fin revient au créneau simple
              if (!isEpsSubject(e.target.value)) {
                const sp = periodsForDay(day).find((p) => p.start === start);
                if (sp) setEnd(sp.end);
              }
            }}
            placeholder="Mathématiques"
            list="adm-subjects"
            required
          />
          <datalist id="adm-subjects">
            {COMMON_SUBJECTS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adm-teacher">Professeur</Label>
          <Input id="adm-teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="Mme Bernard" />
        </div>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Ajout…" : "Ajouter"}
        </Button>
      </form>

      <div>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <p className="text-sm font-medium">Créneaux ({slots?.length ?? 0})</p>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["A", "B", "AB"] as const).map((w) => (
              <Button
                key={w}
                variant={week === w ? "default" : "ghost"}
                size="sm"
                className="rounded-none font-mono h-7 text-xs"
                onClick={() => setWeek(w)}
              >
                {w === "AB" ? "A + B" : w}
              </Button>
            ))}
          </div>
        </div>
        {!slots ? (
          <Skeleton className="h-40 w-full" />
        ) : slots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun créneau pour cette classe.
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {DAYS.map((d) => {
              const daySlots = slots.filter((s) => s.day === d);
              if (daySlots.length === 0) return null;
              return (
                <div key={d}>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{d}</p>
                  {daySlots.map((slot) => (
                    <div
                      key={slot._id}
                      className="flex items-center gap-2 rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 mb-1"
                    >
                      <span className="font-mono text-xs text-primary">
                        {slot.start}–{slot.end}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {slot.subject}
                          {slot.cancelled && (
                            <span className="ml-2 text-xs text-destructive">(annulé)</span>
                          )}
                        </p>
                        {slot.teacher && (
                          <p className="truncate text-xs text-muted-foreground">{slot.teacher}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {slot.weekType === "AB" ? "A+B" : slot.weekType}
                      </Badge>
                      {slot.room && (
                        <Badge variant="outline" className="text-[10px]">{slot.room}</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => handleDelete(slot._id)}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Onglet Utilisateurs ----------

function UsersTab() {
  const users = useQuery(api.app.listUsers);
  const update = useMutation(api.app.updateUser);

  const handleUpdate = async (
    userId: Id<"users">,
    patch: {
      isAdmin?: boolean;
      isClassAdmin?: boolean;
      adminOfClassId?: Id<"classes"> | null;
      classId?: Id<"classes"> | null;
      options?: string[];
      group?: "G1" | "G2" | null;
    },
  ) => {
    try {
      await update({ userId, ...patch });
      toast.success("Utilisateur mis à jour.");
    } catch (err) {
      toast.error(
        err instanceof Error && !err.message.startsWith("{")
          ? err.message
          : "Mise à jour impossible.",
      );
    }
  };

  return (
    <Card className="panel border-border/70">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <UserCog className="size-5 text-primary" /> Utilisateurs
        </CardTitle>
        <CardDescription>
          Attribuez la classe, les options et les responsabilités. Cocher
          « Responsable de classe » demande la classe concernée. La suppression
          retire définitivement le compte et ses données.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!users ? (
          <Skeleton className="h-40 w-full" />
        ) : users.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun utilisateur inscrit.
          </p>
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <UserRow key={u._id} u={u} onUpdate={handleUpdate} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type AdminUserRow = NonNullable<
  Awaited<ReturnType<typeof useQuery<typeof api.app.listUsers>>>
>[number];

function UserRow({
  u,
  onUpdate,
}: {
  u: AdminUserRow;
  onUpdate: (
    userId: Id<"users">,
    patch: {
      isAdmin?: boolean;
      isClassAdmin?: boolean;
      adminOfClassId?: Id<"classes"> | null;
      classId?: Id<"classes"> | null;
      options?: string[];
      group?: "G1" | "G2" | null;
    },
  ) => void;
}) {
  const classes = useQuery(api.app.listClasses) ?? [];
  const remove = useMutation(api.app.deleteUser);
  const updateEmail = useMutation(api.app.adminUpdateUserEmail);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [emailEditing, setEmailEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await remove({ userId: u._id });
      toast.success(`Compte de ${u.name || u.email || "l'utilisateur"} supprimé définitivement.`);
    } catch {
      toast.error("Suppression impossible.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/70 bg-secondary/40 p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{u.name || u.email || "Utilisateur"}</p>
            {u.isAdmin && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Shield className="size-3 text-primary" /> administrateur
              </Badge>
            )}
            {u.isClassAdmin && !u.isAdmin && (
              <Badge variant="outline" className="text-[10px]">
                responsable{u.adminOfClassName ? ` — ${u.adminOfClassName}` : ""}
              </Badge>
            )}
          </div>
          {emailEditing ? (
            <div className="mt-1 flex gap-1.5 items-center">
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="nouvel.email@exemple.fr"
                className="h-7 text-xs flex-1 min-w-40"
              />
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={async () => {
                  try {
                    await updateEmail({ userId: u._id, email: newEmail });
                    toast.success("Email mis à jour.");
                    setEmailEditing(false);
                  } catch (err) {
                    toast.error(
                      err instanceof Error && !err.message.startsWith("{")
                        ? err.message
                        : "Modification impossible.",
                    );
                  }
                }}
              >
                OK
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setEmailEditing(false)}
              >
                <X className="size-3" />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              {u.email}
              <button
                type="button"
                title="Modifier l'email"
                className="opacity-50 hover:opacity-100 cursor-pointer"
                onClick={() => {
                  setNewEmail(u.email ?? "");
                  setEmailEditing(true);
                }}
              >
                <Pencil className="size-3" />
              </button>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          {u.className && <Badge variant="outline">{u.className}</Badge>}
          {(u as { group?: string | null }).group && (
            <Badge variant="outline" className="font-mono">
              {(u as { group?: string | null }).group === "G1" ? "Groupe 1" : "Groupe 2"}
            </Badge>
          )}
          {u.options.length > 0 ? (
            u.options.map((o) => (
              <Badge key={o} variant="outline">{o}</Badge>
            ))
          ) : (
            <Badge variant="outline" className="text-amber-300 border-amber-400/40">
              aucune option
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setOptionsOpen(true)}
          >
            Options…
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing((v) => !v)} title="Modifier">
            {editing ? <X className="size-4" /> : <Pencil className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setConfirmDelete(true)}
            title="Supprimer définitivement"
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 pt-3 border-t border-border/60 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Classe de l'élève</Label>
            <select
              value={u.classId ?? ""}
              onChange={(e) =>
                onUpdate(u._id, {
                  classId: (e.target.value || null) as Id<"classes"> | null,
                })
              }
              className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
            >
              <option value="">— Aucune —</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Groupe</Label>
            <select
              value={(u as { group?: string | null }).group ?? ""}
              onChange={(e) =>
                onUpdate(u._id, {
                  group: (e.target.value || null) as "G1" | "G2" | null,
                })
              }
              className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
            >
              <option value="">— Aucun —</option>
              <option value="G1">Groupe 1</option>
              <option value="G2">Groupe 2</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={u.isAdmin}
                  onChange={(e) => onUpdate(u._id, { isAdmin: e.target.checked })}
                />
                <Shield className="size-4 text-primary" /> Administrateur global
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={u.isClassAdmin}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onUpdate(u._id, {
                        isClassAdmin: true,
                        adminOfClassId: u.adminOfClassId ?? u.classId ?? null,
                      });
                    } else {
                      onUpdate(u._id, {
                        isClassAdmin: false,
                        adminOfClassId: null,
                      });
                    }
                  }}
                />
                <UserCog className="size-4 text-primary" /> Responsable de classe
              </label>
            </div>
            {u.isClassAdmin && (
              <div className="space-y-1.5">
                <Label>Classe dont il/elle est responsable</Label>
                <select
                  value={u.adminOfClassId ?? ""}
                  onChange={(e) =>
                    onUpdate(u._id, {
                      adminOfClassId: (e.target.value || null) as Id<"classes"> | null,
                    })
                  }
                  className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
                >
                  <option value="">— Choisir la classe —</option>
                  {classes.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      <OptionsDialog
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        current={u.options}
        userName={u.name || u.email || "cet utilisateur"}
        onSave={(next) => {
          onUpdate(u._id, { options: next });
          setOptionsOpen(false);
        }}
      />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="panel border-border/80 max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer ce compte ?</DialogTitle>
            <DialogDescription>
              {u.name || u.email} sera définitivement retiré : profil, sessions,
              identifiants et historique de connexion. Cette action est
              irréversible.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Suppression…" : "Supprimer définitivement"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Popup d'options (règles : LV2 obligatoire, max 3) ----------

function OptionsDialog({
  open,
  onOpenChange,
  current,
  userName,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  current: string[];
  userName: string;
  onSave: (options: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(current);

  // Resynchronise à chaque ouverture
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setSelected(current);
    setWasOpen(true);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const ruleError = optionRuleError(selected);

  const toggle = (opt: string) => {
    setSelected((prev) => {
      if (prev.includes(opt)) return prev.filter((o) => o !== opt);
      if (prev.length >= 4) return prev;
      // Interdiction Allemand + Espagnol ensemble : remplace l'autre LV2
      if (opt === "Allemand" && prev.includes("Espagnol")) {
        return prev.filter((o) => o !== "Espagnol").concat("Allemand");
      }
      if (opt === "Espagnol" && prev.includes("Allemand")) {
        return prev.filter((o) => o !== "Allemand").concat("Espagnol");
      }
      return [...prev, opt];
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel border-border/80 max-w-md">
        <DialogHeader>
          <DialogTitle>Options de {userName}</DialogTitle>
          <DialogDescription>
            Au moins une langue : <strong>Allemand</strong> ou <strong>Espagnol</strong>{" "}
            (jamais les deux). <strong>LCE</strong>, <strong>Latin</strong> et{" "}
            <strong>Sécurité Civile</strong> se cumulent avec l'une des deux
            langues. 4 options maximum.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={cn(
                "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                selected.includes(opt)
                  ? "border-primary bg-primary/10 text-primary glow-ring-soft"
                  : "border-border bg-secondary/40 hover:border-primary/50",
              )}
            >
              {selected.includes(opt) && <CheckCircle2 className="size-3.5" />}
              {opt}
            </button>
          ))}
        </div>
        {ruleError && <p className="text-xs text-destructive">{ruleError}</p>}
        <p className="text-xs text-muted-foreground">
          {selected.length}/4 option{selected.length > 1 ? "s" : ""} sélectionnée
          {selected.length > 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={!!ruleError}
            onClick={() => onSave(selected)}
          >
            Enregistrer
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Onglet Vacances & alternance A/B ----------

const MOIS = [
  "Septembre", "Octobre", "Novembre", "Décembre", "Janvier", "Février",
  "Mars", "Avril", "Mai", "Juin", "Juillet", "Août",
];

/** Calendrier annuel : les semaines sont « coloriées » A, B ou vacances. */
function YearCalendar({
  anchor,
  holidays,
  onPaint,
}: {
  anchor: string;
  holidays: Array<{ label: string; startDay: string; endDay: string }>;
  onPaint: (startDay: string, endDay: string) => void;
}) {
  const [painting, setPainting] = useState(false);
  const [selStart, setSelStart] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const { year, month: sepMonth } = schoolYearStart();
  // 12 mois de septembre à août
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = (sepMonth + i) % 12;
    const y = sepMonth + i > 11 ? year + 1 : year;
    return { y, m, label: MOIS[i] };
  });

  const holidayByDay = new Map<string, string>();
  for (const h of holidays) {
    let c = dayToUTC(h.startDay);
    const end = dayToUTC(h.endDay);
    while (c <= end) {
      holidayByDay.set(utcToDay(c), h.label);
      c += DAY_MS;
    }
  }

  const inSelection = (utc: number): boolean => {
    if (!painting || !selStart || !preview) return false;
    const s = Math.min(dayToUTC(selStart), dayToUTC(preview));
    const e = Math.max(dayToUTC(selStart), dayToUTC(preview));
    return utc >= s && utc <= e;
  };

  const handleDayClick = (utc: number) => {
    const day = utcToDay(utc);
    if (!painting) {
      setPainting(true);
      setSelStart(day);
      setPreview(day);
    } else if (!selStart) {
      setSelStart(day);
      setPreview(day);
    } else {
      const s = selStart <= day ? selStart : day;
      const e = selStart <= day ? day : selStart;
      onPaint(s, e);
      setPainting(false);
      setSelStart(null);
      setPreview(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-sky-400/60" /> Semaine A
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-indigo-400/60" /> Semaine B
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-amber-400/70" /> Vacances
        </span>
        <span>
          {painting
            ? "Cliquez sur le dernier jour de la période…"
            : "Cliquez sur un premier jour puis un dernier jour pour déclarer des vacances."}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {months.map(({ y, m, label }) => (
          <div key={`${y}-${m}`} className="rounded-lg border border-border/70 bg-secondary/30 p-2">
            <p className="text-xs font-semibold mb-1.5 text-center">
              {label} {y}
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              <span />
              {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                <span key={i} className="text-[8px] text-muted-foreground text-center">{d}</span>
              ))}
              {monthWeeks(y, m).map((week, wi) => {
                const label = weekLabelFor(week[0], anchor, holidays);
                return (
                  <div key={wi} className="contents">
                    <span
                      className={cn(
                        "text-[8px] font-mono text-center leading-[18px]",
                        label === "A" && "text-sky-300",
                        label === "B" && "text-indigo-300",
                        label === "vac" && "text-amber-300",
                      )}
                    >
                      {label === "vac" ? "v" : label}
                    </span>
                    {week.map((utc) => {
                      const d = new Date(utc);
                      const inMonth = d.getUTCMonth() === m;
                      const day = utcToDay(utc);
                      const isHol = holidayByDay.has(day);
                      const weekend = [0, 6].includes(d.getUTCDay());
                      return (
                        <button
                          key={utc}
                          type="button"
                          onClick={() => handleDayClick(utc)}
                          onMouseEnter={() => painting && setPreview(day)}
                          className={cn(
                            "h-[18px] rounded-sm text-[8px] leading-[18px] text-center transition-colors",
                            inMonth ? "cursor-pointer" : "opacity-25",
                            !inMonth && "pointer-events-none",
                            inSelection(utc) && "ring-2 ring-amber-300 bg-amber-400/40",
                            !inSelection(utc) && isHol && "bg-amber-400/70 text-amber-950 font-semibold",
                            !inSelection(utc) && !isHol && weekend && "bg-muted/30 text-muted-foreground",
                            !inSelection(utc) && !isHol && !weekend && "hover:bg-primary/30",
                          )}
                        >
                          {d.getUTCDate()}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HolidaysTab() {
  const weekState = useQuery(api.app.weekState) as WeekState | undefined;
  const anchor = useQuery(api.app.getWeekAnchor);
  const holidays = useQuery(api.app.listHolidays);
  const setAnchor = useMutation(api.app.setWeekAnchor);
  const addHoliday = useMutation(api.app.addHoliday);
  const deleteHoliday = useMutation(api.app.deleteHoliday);

  const [anchorDate, setAnchorDate] = useState("");
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [savingAnchor, setSavingAnchor] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleSaveAnchor = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
      toast.error("Indiquez une date valide (AAAA-MM-JJ).");
      return;
    }
    setSavingAnchor(true);
    try {
      await setAnchor({ startDay: anchorDate });
      toast.success("Semaine de référence enregistrée.");
      setAnchorDate("");
    } catch {
      toast.error("Enregistrement impossible.");
    } finally {
      setSavingAnchor(false);
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !end || end < start) {
      toast.error("Dates de vacances invalides.");
      return;
    }
    setAdding(true);
    try {
      await addHoliday({ label: label.trim() || "Vacances", startDay: start, endDay: end });
      toast.success("Période de vacances ajoutée : l'alternance s'arrête pendant cette période.");
      setLabel("");
      setStart("");
      setEnd("");
    } catch {
      toast.error("Ajout impossible.");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteHoliday = async (id: Id<"holidays">) => {
    try {
      await deleteHoliday({ holidayId: id });
      toast.success("Période supprimée.");
    } catch {
      toast.error("Suppression impossible.");
    }
  };

  const formatDay = (day: string | null | undefined) => {
    if (!day) return "…";
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="panel border-border/70">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="size-5 text-primary" /> Alternance des semaines A / B
            </CardTitle>
            <CardDescription>
              Les semaines alternent automatiquement : A, B, A, B… L'alternance
              s'arrête pendant les vacances et reprend où elle s'était arrêtée.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-secondary/40 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Semaine en cours
              </p>
              {weekState?.isHoliday ? (
                <p className="text-lg font-semibold text-amber-300">
                  {weekState.holidayLabel ?? "Vacances"} — alternance en pause
                </p>
              ) : (
                <p className="text-lg font-semibold">
                  Semaine <span className="text-primary font-mono">{weekState?.week ?? "…"}</span>
                  {weekState?.nextSchoolMonday && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      reprise le {formatDay(weekState.nextSchoolMonday)}
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="anchor-day">
                Semaine de référence (un lundi situé sur une semaine A)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="anchor-day"
                  type="date"
                  value={anchorDate || anchor?.startDay || ""}
                  onChange={(e) => setAnchorDate(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleSaveAnchor} disabled={savingAnchor} className="shrink-0">
                  {savingAnchor ? "…" : "Enregistrer"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Référence actuelle : semaine du {formatDay(anchor?.startDay)}.
                Modifiez-la uniquement si le décompte est décalé.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="panel border-border/70">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarOff className="size-5 text-primary" /> Ajouter une période
            </CardTitle>
            <CardDescription>
              Pendant les vacances, plus aucun cours n'est affiché et l'alternance
              A/B est suspendue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleAddHoliday} className="space-y-2 rounded-lg border border-border/70 bg-secondary/30 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="hol-label">Nom (ex. Vacances de la Toussaint)</Label>
                <Input
                  id="hol-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Vacances d'hiver"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="hol-start">Du</Label>
                  <Input
                    id="hol-start"
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hol-end">Au (inclus)</Label>
                  <Input
                    id="hol-end"
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={adding}>
                {adding ? "Ajout…" : "Ajouter la période"}
              </Button>
            </form>

            {!holidays ? (
              <Skeleton className="h-16 w-full" />
            ) : holidays.length > 0 ? (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {holidays.map((h) => (
                  <div
                    key={h._id}
                    className="flex items-center gap-3 rounded-lg border border-border/70 bg-secondary/40 px-3 py-2"
                  >
                    <CalendarOff className="size-4 text-amber-300 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{h.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Du {formatDay(h.startDay)} au {formatDay(h.endDay)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => handleDeleteHoliday(h._id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune période configurée — ou colorez-les directement sur le
                calendrier ci-dessous.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="panel border-border/70">
        <CardHeader>
          <CardTitle className="text-lg">Calendrier de l'année scolaire</CardTitle>
          <CardDescription>
            Les semaines sont coloriées automatiquement A, B ou vacances. Cliquez
            sur un premier jour puis un dernier jour pour déclarer une période de
            vacances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {anchor && holidays && (
            <YearCalendar
              anchor={anchor.startDay}
              holidays={holidays.map((h) => ({
                label: h.label,
                startDay: h.startDay,
                endDay: h.endDay,
              }))}
              onPaint={(s, e) =>
                addHoliday({
                  label: "Vacances",
                  startDay: s,
                  endDay: e,
                })
                  .then(() => toast.success("Période de vacances ajoutée."))
                  .catch(() => toast.error("Ajout impossible."))
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Chat privé : conversations élèves ↔ admins
// ============================================================================

function AdminChatTab() {
  // Conversation ouverte pilotable par URL : /admin?tab=adminchat&student=<id>
  // (utilisé par les notifications navigateur). Sans paramètre : liste.
  const [searchParams, setSearchParams] = useSearchParams();
  const studentParam = searchParams.get("student");
  const selected: Id<"users"> | "__self__" | null =
    studentParam === "salon" ? "__self__" : (studentParam as Id<"users">) ?? null;

  const openThread = (id: Id<"users"> | "__self__") => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("student", id === "__self__" ? "salon" : id);
    setSearchParams(next, { replace: true });
  };
  const closeThread = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("student");
    setSearchParams(next, { replace: true });
  };

  const threads = useQuery(api.app.listAdminThreads, {}) as
    | Array<{
        studentId: Id<"users">;
        studentName: string;
        lastText: string;
        lastAt: number;
        unread: number;
      }>
    | undefined;

  if (selected === null) {
    return (
      <AdminThreadsList
        threads={threads ?? []}
        loading={threads === undefined}
        onOpen={openThread}
      />
    );
  }
  return (
    <AdminChatThread
      studentId={selected === "__self__" ? undefined : selected}
      onBack={closeThread}
    />
  );
}

function AdminThreadsList({
  threads,
  loading,
  onOpen,
}: {
  threads: Array<{
    studentId: Id<"users">;
    studentName: string;
    lastText: string;
    lastAt: number;
    unread: number;
  }>;
  loading: boolean;
  onOpen: (id: Id<"users"> | "__self__") => void;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onOpen("__self__")}
        className="w-full flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left transition-colors hover:border-primary/60 cursor-pointer"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
          <MessageSquareLock className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            Salon des administrateurs
          </span>
          <span className="block text-xs text-muted-foreground truncate">
            Discussion entre admins (chaque admin a son propre salon privé)
          </span>
        </span>
      </button>
      <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Conversations élèves
      </p>
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : threads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Aucun élève n'a encore écrit. Dès qu'un élève envoie un message dans
          « Chat 🔒 », sa conversation apparaît ici.
        </p>
      ) : (
        threads.map((t) => (
          <button
            key={t.studentId}
            type="button"
            onClick={() => onOpen(t.studentId)}
            className="w-full flex items-center gap-3 rounded-xl border border-border/70 bg-secondary/30 px-4 py-3 text-left transition-colors hover:border-primary/50 cursor-pointer"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-primary">
              {t.studentName.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{t.studentName}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {new Date(t.lastAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {t.lastText}
              </span>
            </span>
            {t.unread > 0 && (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {t.unread}
              </span>
            )}
          </button>
        ))
      )}
    </div>
  );
}

function AdminChatThread({
  studentId,
  onBack,
}: {
  studentId: Id<"users"> | undefined; // undefined = salon des admins (moi)
  onBack: () => void;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Salon partagé (studentId undefined) ou conversation d'un élève.
  const salonMessages = useQuery(api.app.listAdminSalonMessages, {}) as
    | Array<{
        _id: string;
        text: string;
        createdAt: number;
        mine: boolean;
        authorName: string;
      }>
    | undefined;
  const threadMessages = useQuery(
    api.app.listAdminMessages,
    studentId ? { studentId } : "skip",
  ) as
    | Array<{ _id: string; text: string; createdAt: number; mine: boolean }>
    | undefined;
  const messages = studentId ? threadMessages : salonMessages;
  const send = useMutation(api.app.sendAdminMessage);
  const markRead = useMutation(api.app.markAdminChatReadAsAdmin);
  const setTyping = useMutation(api.app.setTyping);
  // Saisie d'un admin : visible par l'élève dans SA conversation
  // ("admin:<id>") ou dans le salon entre admins ("salon").
  const myScope = studentId ? `admin:${studentId}` : "salon";
  // On écoute ce que l'autre côté écrit : l'élève ou les autres admins.
  const typingNames = useQuery(api.app.listTyping, {
    scope: studentId ? `student:${studentId}` : "salon",
  }) as
    | string[]
    | undefined;
  const otherTyping = (typingNames ?? []).filter((n) => n.length > 0);

  useEffect(() => {
    if (studentId) void markRead({ studentId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await send({ text, ...(studentId ? { studentId } : {}) });
      setDraft("");
      await setTyping({ scope: myScope, typing: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/70 bg-secondary/20">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onBack}
          aria-label="Retour à la liste"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <MessageSquareLock className="size-4 text-primary" />
        <p className="text-sm font-semibold">
          {studentId ? "Conversation privée" : "Salon des administrateurs"}
        </p>
        <Lock className="ml-auto size-3.5 text-muted-foreground" />
      </div>
      <div
        ref={scrollRef}
        className="max-h-[420px] min-h-[280px] space-y-2 overflow-y-auto px-4 py-3"
      >
        {!messages ? (
          <Skeleton className="h-20 w-full" />
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Aucun message pour l'instant. Écrivez le premier !
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m._id}
              className={cn("flex", m.mine ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm",
                  m.mine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary/80 rounded-bl-sm",
                )}
              >
                {!m.mine && "authorName" in m && (
                  <p className="mb-0.5 text-[10px] font-bold text-primary">
                    {(m as { authorName: string }).authorName}
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
        {otherTyping.length > 0 && (
          <div className="flex justify-start">
            <TypingBubble name={otherTyping.join(", ")} />
          </div>
        )}
      </div>
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-border/60 px-3 py-2.5"
      >
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            void setTyping({ scope: myScope, typing: e.target.value.length > 0 });
          }}
          onBlur={() => void setTyping({ scope: myScope, typing: false })}
          placeholder="Écrire un message…"
          className="flex-1"
          maxLength={2000}
          disabled={sending}
        />
        <Button
          type="submit"
          size="icon"
          className="size-9 shrink-0"
          disabled={sending || !draft.trim()}
        >
          {sending ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
