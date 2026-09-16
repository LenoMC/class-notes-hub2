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
import { optionRuleError } from "@/lib/subjects";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarOff,
  CalendarPlus,
  Check,
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"] as const;
const OPTIONS = ["LCE", "Latin", "Allemand", "Espagnol"] as const;

type WeekState = {
  week: "A" | "B";
  isHoliday: boolean;
  holidayLabel: string | null;
  nextSchoolMonday: string | null;
};

export default function Admin() {
  const { user } = useAuth();

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

  return (
    <AppShell isAdmin>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Administration</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Classes prédéfinies, emplois du temps, comptes utilisateurs et calendrier
        scolaire.
      </p>
      <Tabs defaultValue="classes" className="space-y-4">
        <TabsList className="bg-secondary/60">
          <TabsTrigger value="classes" className="gap-1.5">
            <Plus className="size-4" /> Classes
          </TabsTrigger>
          <TabsTrigger value="edt" className="gap-1.5">
            <CalendarPlus className="size-4" /> Emplois du temps
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="size-4" /> Utilisateurs
          </TabsTrigger>
          <TabsTrigger value="holidays" className="gap-1.5">
            <CalendarOff className="size-4" /> Vacances & semaines
          </TabsTrigger>
        </TabsList>

        <TabsContent value="classes">
          <ClassesTab />
        </TabsContent>
        <TabsContent value="edt">
          <TimetableAdminTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="holidays">
          <HolidaysTab />
        </TabsContent>
      </Tabs>
    </AppShell>
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
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [subject, setSubject] = useState("");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [weekType, setWeekType] = useState<"A" | "B" | "AB">("AB");
  const [saving, setSaving] = useState(false);

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
            <Input id="adm-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adm-end">Fin</Label>
            <Input id="adm-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
            {day === "Mercredi" && end > "12:10" && (
              <p className="text-xs text-destructive">
                Le mercredi, les cours s'arrêtent au plus tard à 12:10.
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
            onChange={(e) => setSubject(e.target.value)}
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
    },
  ) => void;
}) {
  const classes = useQuery(api.app.listClasses) ?? [];
  const remove = useMutation(api.app.deleteUser);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

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
          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          {u.className && <Badge variant="outline">{u.className}</Badge>}
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
      if (prev.length >= 3) return prev;
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
            (jamais les deux). <strong>LCE</strong> et <strong>Latin</strong> se
            cumulent avec l'une des deux langues. 3 options maximum.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
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
          {selected.length}/3 option{selected.length > 1 ? "s" : ""} sélectionnée
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
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="panel border-border/70">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="size-5 text-primary" /> Alternance des semaines A / B
          </CardTitle>
          <CardDescription>
            Les semaines alternent automatiquement : A, B, A, B… L'alternance
            s'arrête pendant les vacances et reprend où elle s'était arrêtée à la
            rentrée suivante.
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
            <CalendarOff className="size-5 text-primary" /> Périodes de vacances
          </CardTitle>
          <CardDescription>
            Pendant une période de vacances, plus aucun cours n'est affiché et
            l'alternance A/B est suspendue.
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
            <Skeleton className="h-20 w-full" />
          ) : holidays.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aucune période configurée. L'alternance A/B sera continue.
            </p>
          ) : (
            <div className="space-y-2">
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
