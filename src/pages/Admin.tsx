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
import { useMutation, useQuery } from "convex/react";
import {
  CalendarPlus,
  Check,
  Pencil,
  Plus,
  Shield,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;
const OPTIONS = ["LCE", "Latin", "Allemand", "Espagnol"] as const;

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
        Classes prédéfinies, emplois du temps et comptes utilisateurs.
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
    } catch {
      toast.error("Ajout impossible (horaires invalides ?).");
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
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adm-week">Semaine</Label>
          <select
            id="adm-week"
            value={weekType}
            onChange={(e) => setWeekType(e.target.value as "A" | "B" | "AB")}
            className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm"
          >
            <option value="AB">Toutes les semaines (A et B)</option>
            <option value="A">Semaine A uniquement</option>
            <option value="B">Semaine B uniquement</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adm-subject">Matière</Label>
          <Input id="adm-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Mathématiques" required />
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
      options?: (typeof OPTIONS)[number][];
    },
  ) => {
    try {
      await update({ userId, ...patch });
      toast.success("Utilisateur mis à jour.");
    } catch {
      toast.error("Mise à jour impossible.");
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
      options?: (typeof OPTIONS)[number][];
    },
  ) => void;
}) {
  const classes = useQuery(api.app.listClasses) ?? [];
  const remove = useMutation(api.app.deleteUser);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const toggleOption = (opt: (typeof OPTIONS)[number]) => {
    const next = u.options.includes(opt)
      ? u.options.filter((o) => o !== opt)
      : [...u.options, opt];
    onUpdate(u._id, { options: next });
  };

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
          {u.options.map((o) => (
            <Badge key={o} variant="outline">{o}</Badge>
          ))}
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
            <Label>Options suivies (plusieurs possibles)</Label>
            <div className="flex flex-wrap gap-1.5">
              {OPTIONS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => toggleOption(o)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium transition-colors cursor-pointer",
                    u.options.includes(o)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary/50 hover:border-primary/50",
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
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
                      // À la promotion, demander la classe gérée : elle s'affiche ci-dessous
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
