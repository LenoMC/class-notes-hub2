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
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/components/AppShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Ban,
  CalendarX2,
  Download,
  ExternalLink,
  FileUp,
  Link2,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;
const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i); // 8h -> 19h

type Slot = {
  _id: Id<"timetableSlots">;
  day: string;
  start: string;
  end: string;
  subject: string;
  teacher?: string;
  room?: string;
  cancelled?: boolean;
  cancellationReason?: string;
};

export default function Timetable() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSlotId = searchParams.get("slot");

  const slots = useQuery(api.app.listMySlots) ?? [];
  const [selected, setSelected] = useState<Slot | null>(null);

  useEffect(() => {
    if (!selectedSlotId) return;
    const found = slots.find((s) => s._id === selectedSlotId);
    if (found) setSelected(found);
  }, [selectedSlotId, slots]);

  const openSlot = (slot: Slot) => {
    setSelected(slot);
    setSearchParams({ slot: slot._id }, { replace: true });
  };

  const closeSlot = () => {
    setSelected(null);
    setSearchParams({}, { replace: true });
  };

  if (!user) return null;

  return (
    <AppShell isAdmin={user.isAdmin}>
      {!user.classId ? (
        <Card className="panel border-border/70">
          <CardHeader>
            <CardTitle>Emploi du temps</CardTitle>
            <CardDescription>
              Complète d'abord le questionnaire sur la page d'accueil pour choisir ta
              classe.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <TimetableGrid
          slots={slots as Slot[]}
          onOpen={openSlot}
          isClassAdmin={user.isClassAdmin}
          isAdmin={user.isAdmin}
          classId={user.classId}
        />
      )}

      {selected && (
        <SlotDialog slot={selected} canEdit={user.isAdmin || user.isClassAdmin} onClose={closeSlot} />
      )}
    </AppShell>
  );
}

// ---------- Grille ----------

function TimetableGrid({
  slots,
  onOpen,
  isClassAdmin,
  isAdmin,
  classId,
}: {
  slots: Slot[];
  onOpen: (slot: Slot) => void;
  isClassAdmin: boolean;
  isAdmin: boolean;
  classId: Id<"classes">;
}) {
  const canEdit = isAdmin || isClassAdmin;
  const [showAdd, setShowAdd] = useState(false);
  const days = DAYS.slice(0, 6); // Lundi -> Samedi

  return (
    <>
      <div className="flex items-center justify-between mb-4">          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Emploi du temps</h1>
            <p className="text-sm text-muted-foreground">
              Sélectionnez un cours pour consulter ses documents.
            </p>
          </div>
        {canEdit && (
          <Button className="gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="size-4" /> Ajouter un cours
          </Button>
        )}
      </div>

      <Card className="panel border-border/70 overflow-x-auto">
        <CardContent className="p-3 sm:p-4">
          <div className="min-w-[760px]">
            <div className="grid" style={{ gridTemplateColumns: "56px repeat(6, 1fr)" }}>
              <div />
              {days.map((d) => (
                <div key={d} className="pb-2 text-center text-sm font-semibold">
                  {d}
                </div>
              ))}
            </div>
            <div className="relative grid" style={{ gridTemplateColumns: "56px repeat(6, 1fr)" }}>
              {/* Colonne des heures */}
              <div>
                {HOURS.map((h) => (
                  <div key={h} className="h-14 text-right pr-2 text-[10px] text-muted-foreground font-mono relative">
                    <span className="absolute top-0">{h}:00</span>
                  </div>
                ))}
              </div>
              {days.map((day, dayIdx) => (
                <div key={day} className="relative border-l border-border/60">
                  {HOURS.map((h) => (
                    <div key={h} className="h-14 border-b border-border/40" />
                  ))}
                  {slots
                    .filter((s) => s.day === day)
                    .map((slot) => {
                      const [sh, sm] = slot.start.split(":").map(Number);
                      const [eh, em] = slot.end.split(":").map(Number);
                      const startH = sh + sm / 60;
                      const endH = eh + em / 60;
                      const top = (startH - 8) * 56;
                      const height = Math.max((endH - startH) * 56 - 4, 28);
                      return (
                        <button
                          key={slot._id}
                          onClick={() => onOpen(slot)}
                          style={{ top: top + 2, height }}
                          className={cn(
                            "absolute left-1 right-1 rounded-lg border px-2 py-1 text-left overflow-hidden transition-all cursor-pointer hover:z-10 hover:scale-[1.02]",
                            slot.cancelled
                              ? "border-destructive/50 bg-destructive/10 line-through decoration-destructive/60"
                            : "border-primary/40 bg-primary/10 hover:bg-primary/15 glow-ring-soft",
                            dayIdx >= 5 && "opacity-80",
                          )}
                        >
                          <p className="text-xs font-semibold truncate">{slot.subject}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {slot.cancelled ? "Annulé · " : ""}
                            {slot.start}–{slot.end}
                            {slot.room ? ` · ${slot.room}` : ""}
                          </p>
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <AddSlotDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        classId={classId}
        canEdit={canEdit}
      />
    </>
  );
}

// ---------- Dialog cours + fichiers ----------

type FileRow = {
  _id: Id<"courseFiles">;
  title: string;
  kind: "cours" | "devoir";
  description: string | null;
  fileName: string;
  fileType: string;
  bytes: number | null;
  hasFile: boolean;
  storageId: Id<"_storage"> | null;
  externalUrl: string | null;
};

function SlotDialog({
  slot,
  canEdit,
  onClose,
}: {
  slot: Slot;
  canEdit: boolean;
  onClose: () => void;
}) {
  const files = useQuery(api.app.listFilesForSlot, { slotId: slot._id });
  const setCancelled = useMutation(api.app.setSlotCancelled);
  const [showUpload, setShowUpload] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);

  const handleCancelToggle = async () => {
    setWorking(true);
    try {
      await setCancelled({
        slotId: slot._id,
        cancelled: !slot.cancelled,
        reason: reason.trim() || undefined,
      });
      toast.success(
        slot.cancelled
          ? "Cours rétabli dans l'emploi du temps."
          : "Cours marqué comme annulé.",
      );
      onClose();
    } catch {
      toast.error("Action impossible.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="panel border-border/80 max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-xl flex items-center gap-2 flex-wrap">
                {slot.subject}
                {slot.cancelled && (
                  <Badge className="bg-destructive/15 text-destructive border border-destructive/40 gap-1">
                    <Ban className="size-3" /> Annulé
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {slot.day} · {slot.start}–{slot.end}
                {slot.teacher ? ` · ${slot.teacher}` : ""}
                {slot.room ? ` · salle ${slot.room}` : ""}
              </DialogDescription>
            </div>
            <Badge variant="secondary" className="glow-ring-soft shrink-0">
              <CalendarX2 className="size-3 text-primary mr-1" />
              {files?.length ?? 0} fichier{(files?.length ?? 0) > 1 ? "s" : ""}
            </Badge>
          </div>
        </DialogHeader>

        {slot.cancelled && slot.cancellationReason && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Motif de l'annulation : {slot.cancellationReason}
          </div>
        )}

        <div className="space-y-2">
          {!files ? (
            <Skeleton className="h-20 w-full" />
          ) : files.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun fichier pour ce cours
              {canEdit ? " — publiez le premier document." : " pour l'instant."}
            </p>
          ) : (
            files.map((f) => <FileCard key={f._id} file={f as FileRow} canEdit={canEdit} />)
          )}
        </div>

        {canEdit && (
          <Button className="w-full" onClick={() => setShowUpload((v) => !v)}>
            <FileUp className="size-4 mr-1.5" />
            {showUpload ? "Fermer" : "Ajouter un fichier (cours ou devoir)"}
          </Button>
        )}
        {canEdit && showUpload && (
          <UploadForm slotId={slot._id} onDone={() => setShowUpload(false)} />
        )}

        {canEdit && (
          <div className="border-t border-border/60 pt-3">
            {!showCancel ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowCancel(true)}
              >
                {slot.cancelled ? (
                  <>
                    <RotateCcw className="size-4 mr-1.5" /> Rétablir ce cours
                  </>
                ) : (
                  <>
                    <Ban className="size-4 mr-1.5 text-destructive" /> Annuler ce cours
                  </>
                )}
              </Button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCancelToggle();
                }}
                className="space-y-2"
              >
                <Label htmlFor="cancel-reason">Motif (visible par la classe)</Label>
                <Input
                  id="cancel-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Professeur absent, sortie scolaire…"
                />
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant={slot.cancelled ? "default" : "destructive"}
                    className="flex-1"
                    disabled={working}
                  >
                    {working
                      ? "…"
                      : slot.cancelled
                        ? "Confirmer le rétablissement"
                        : "Confirmer l'annulation"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowCancel(false)}
                  >
                    Retour
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FileCard({ file, canEdit }: { file: FileRow; canEdit: boolean }) {
  const remove = useMutation(api.app.deleteFile);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await remove({ fileId: file._id });
      toast.success("Fichier supprimé.");
    } catch {
      toast.error("Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/70 bg-secondary/40 p-3">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-1 size-2 rounded-full shrink-0",
            file.kind === "devoir" ? "bg-primary" : "bg-muted-foreground/60",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{file.title}</p>
            <Badge variant="outline" className="text-[10px] uppercase">
              {file.kind}
            </Badge>
          </div>
          {file.description && (
            <p className="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap">
              {file.description}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground truncate">
            {file.fileName}
            {file.bytes ? ` · ${(file.bytes / 1024).toFixed(0)} Ko` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {file.hasFile && file.storageId && <DownloadButton storageId={file.storageId} fileName={file.fileName} />}
          {file.externalUrl && (
            <a href={file.externalUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" title="Ouvrir le lien">
                <ExternalLink className="size-4" />
              </Button>
            </a>
          )}
          {canEdit && (
            <Button variant="ghost" size="icon" onClick={handleDelete} disabled={deleting} title="Supprimer">
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function DownloadButton({ storageId, fileName }: { storageId: Id<"_storage">; fileName: string }) {
  const getUrl = useQuery(api.app.getFileUrl, { storageId });
  return (
    <a href={getUrl ?? undefined} download={fileName}>
      <Button variant="ghost" size="icon" title="Télécharger" disabled={!getUrl}>
        <Download className="size-4 text-primary" />
      </Button>
    </a>
  );
}

// ---------- Formulaire d'upload ----------

function UploadForm({ slotId, onDone }: { slotId: Id<"timetableSlots">; onDone: () => void }) {
  const addFile = useMutation(api.app.addFileMeta);
  const generateUploadUrl = useMutation(api.app.generateUploadUrl);
  const [kind, setKind] = useState<"cours" | "devoir">("devoir");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || (!file && !externalUrl.trim())) {
      toast.error("Ajoute un titre puis un fichier ou un lien.");
      return;
    }
    setUploading(true);
    try {
      let storageId: Id<"_storage"> | undefined;
      let fileName = file?.name ?? "lien externe";
      let fileType = file?.type || "text/uri-list";
      let bytes: number | undefined;

      if (file) {
        // 1) Obtenir une URL d'upload signée depuis le backend
        const postUrl = await generateUploadUrl();
        // 2) Envoyer le fichier directement au stockage Convex
        const res = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!res.ok) throw new Error("Échec de l'envoi du fichier");
        const json = (await res.json()) as { storageId: Id<"_storage"> };
        storageId = json.storageId;
        bytes = file.size;
        fileType = file.type || "application/octet-stream";
        fileName = file.name;
      }

      await addFile({
        slotId,
        title: title.trim(),
        kind,
        description: description.trim() || undefined,
        fileName,
        fileType,
        bytes,
        storageId,
        externalUrl: externalUrl.trim() || undefined,
      });
      toast.success("Document publié. Il est visible par la classe immédiatement.");
      setTitle("");
      setDescription("");
      setFile(null);
      setExternalUrl("");
      onDone();
    } catch {
      toast.error("Publication impossible. Vérifiez le fichier ou le lien.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border/70 bg-secondary/30 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={kind === "devoir" ? "default" : "outline"}
          onClick={() => setKind("devoir")}
          className="gap-1.5"
        >
          <CalendarX2 className="size-4" /> Devoir
        </Button>
        <Button
          type="button"
          variant={kind === "cours" ? "default" : "outline"}
          onClick={() => setKind("cours")}
          className="gap-1.5"
        >
          <Link2 className="size-4" /> Fiche de cours
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="up-title">Titre</Label>
        <Input id="up-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="DM n°3 — chapitre 4" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="up-desc">Consigne (facultatif)</Label>
        <Textarea id="up-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="À rendre pour vendredi, exercices 12 à 14…" rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="up-file">Fichier</Label>
        <Input
          id="up-file"
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.zip"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="up-url">Ou lien externe (Drive, CNED…)</Label>
        <Input id="up-url" type="url" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…" />
      </div>
      <Button type="submit" className="w-full" disabled={uploading}>
        {uploading ? "Envoi…" : "Publier"}
      </Button>
    </form>
  );
}

// ---------- Dialog ajout de créneau (admins) ----------

function AddSlotDialog({
  open,
  onOpenChange,
  classId,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classId: Id<"classes">;
  canEdit: boolean;
}) {
  const upsert = useMutation(api.app.upsertSlot);
  const [day, setDay] = useState<string>("Lundi");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [subject, setSubject] = useState("");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [saving, setSaving] = useState(false);

  if (!canEdit) return null;

  const handleSubmit = async (e: React.FormEvent) => {
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
      });
      toast.success("Cours ajouté à l'emploi du temps.");
      onOpenChange(false);
      setSubject("");
      setTeacher("");
      setRoom("");
    } catch {
      toast.error("Ajout impossible (horaires invalides ?).");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel border-border/80 max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un cours</DialogTitle>
          <DialogDescription>Créneau de l'emploi du temps de la classe.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="sl-day">Jour</Label>
              <select
                id="sl-day"
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
              <Label htmlFor="sl-room">Salle</Label>
              <Input id="sl-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="B204" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sl-start">Début</Label>
              <Input id="sl-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sl-end">Fin</Label>
              <Input id="sl-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sl-subject">Matière</Label>
            <Input id="sl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Mathématiques" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sl-teacher">Professeur</Label>
            <Input id="sl-teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="Mme Bernard" />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Ajout…" : "Ajouter le cours"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
