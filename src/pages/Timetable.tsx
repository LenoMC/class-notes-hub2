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
import { isEpsSubject, subjectColor } from "@/lib/subjects";
import { useMutation, useQuery } from "convex/react";
import {
  Ban,
  CalendarX2,
  Download,
  ExternalLink,
  FileUp,
  Link2,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"] as const;
const DAY_START = 8; // 8h00
const DAY_END = 18.5; // 18h30
const HOUR_PX = 52;

type Slot = {
  _id: Id<"timetableSlots">;
  day: string;
  start: string;
  end: string;
  subject: string;
  teacher?: string;
  room?: string;
  weekType: "A" | "B" | "AB";
  cancelled?: boolean;
  cancellationReason?: string;
};

type WeekState = {
  week: "A" | "B";
  isHoliday: boolean;
  holidayLabel: string | null;
  nextSchoolMonday: string | null;
};

export default function Timetable() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSlotId = searchParams.get("slot");
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);

  const weekState = useQuery(api.app.weekState) as WeekState | undefined;
  // Vue : "cur" = semaine actuelle (A ou B selon l'alternance), A, B ou A+B.
  const [view, setView] = useState<"cur" | "A" | "B" | "AB">("cur");
  const activeWeek: "A" | "B" =
    view === "AB" ? "A" : view === "cur" ? (weekState?.week ?? "A") : view;

  const slots =
    useQuery(api.app.listMySlots, view === "AB" ? {} : { week: activeWeek }) ?? [];
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

  // Édition demandée depuis le dialog d'un cours (bouton « Modifier »)
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!id) return;
      setEditingSlotId(id);
    };
    window.addEventListener("coursflow:edit-slot", handler);
    return () => window.removeEventListener("coursflow:edit-slot", handler);
  }, []);

  if (!user) return null;

  const weekLabel =
    view === "cur"
      ? weekState?.isHoliday
        ? "Vacances scolaires"
        : `Semaine ${weekState?.week ?? "…"} — semaine actuelle`
      : view === "AB"
        ? "Toutes les semaines"
        : `Semaine ${view}`;

  return (
    <AppShell isAdmin={user.isAdmin}>
      {!user.classId ? (
        <Card className="panel border-border/70">
          <CardHeader>
            <CardTitle>Emploi du temps</CardTitle>
            <CardDescription>
              Complétez d'abord le questionnaire sur la page d'accueil pour choisir
              votre classe.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <TimetableGrid
          slots={slots as Slot[]}
          onOpen={openSlot}
          onEdit={(slot) => setEditingSlotId(slot._id)}
          isClassAdmin={user.isClassAdmin}
          isAdmin={user.isAdmin}
          classId={user.classId}
          view={view}
          setView={setView}
          weekLabel={weekLabel}
          weekState={weekState}
        />
      )}

      {selected && (
        <SlotDialog
          slot={selected}
          canEdit={user.isAdmin || user.isClassAdmin}
          onClose={closeSlot}
        />
      )}

      {editingSlotId && user.classId && (
        <EditSlotDialog
          slot={(slots as Slot[]).find((s) => s._id === editingSlotId) ?? null}
          classId={user.classId}
          onDone={() => setEditingSlotId(null)}
        />
      )}
    </AppShell>
  );
}

// ---------- Grille ----------

function TimetableGrid({
  slots,
  onOpen,
  onEdit,
  isClassAdmin,
  isAdmin,
  classId,
  view,
  setView,
  weekLabel,
  weekState,
}: {
  slots: Slot[];
  onOpen: (slot: Slot) => void;
  onEdit: (slot: Slot) => void;
  isClassAdmin: boolean;
  isAdmin: boolean;
  classId: Id<"classes">;
  view: "cur" | "A" | "B" | "AB";
  setView: (w: "cur" | "A" | "B" | "AB") => void;
  weekLabel: string;
  weekState: WeekState | undefined;
}) {
  const canEdit = isAdmin || isClassAdmin;
  const [showAdd, setShowAdd] = useState(false);
  const totalH = DAY_END - DAY_START;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Emploi du temps</h1>
          <p className="text-sm text-muted-foreground">
            Sélectionnez un cours pour consulter ses documents.
            {weekState?.isHoliday && weekState.holidayLabel && (
              <span className="ml-2 text-amber-300">
                {weekState.holidayLabel} — reprise le{" "}
                {formatDay(weekState.nextSchoolMonday)}.
              </span>
            )}
          </p>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(
            [
              ["cur", "Actuelle"],
              ["A", "A"],
              ["B", "B"],
              ["AB", "A + B"],
            ] as const
          ).map(([w, label]) => (
            <Button
              key={w}
              variant={view === w ? "default" : "ghost"}
              size="sm"
              className="rounded-none font-mono"
              onClick={() => setView(w)}
            >
              {label}
            </Button>
          ))}
        </div>
        {canEdit && (
          <Button className="gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="size-4" /> Ajouter un cours
          </Button>
        )}
      </div>

      <Badge variant="outline" className="mb-3 font-mono text-xs">
        {weekLabel}
      </Badge>

      <Card className="panel border-border/70 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[70vh]">
            <div className="min-w-[720px]">
              {/* En-tête des jours */}
              <div
                className="sticky top-0 z-10 grid bg-background/95 backdrop-blur-sm border-b border-border/60"
                style={{ gridTemplateColumns: "56px repeat(5, 1fr)" }}
              >
                <div />
                {DAYS.map((d) => (
                  <div key={d} className="py-2 text-center text-sm font-semibold">
                    {d}
                  </div>
                ))}
              </div>
              {/* Corps */}
              <div
                className="relative grid"
                style={{
                  gridTemplateColumns: "56px repeat(5, 1fr)",
                  height: totalH * HOUR_PX,
                }}
              >
                {/* Colonne des heures */}
                <div className="relative">
                  {Array.from({ length: Math.ceil(totalH * 2) }, (_, i) => {
                    const h = DAY_START + i / 2;
                    const hh = Math.floor(h);
                    const mm = h % 1 === 0 ? "00" : "30";
                    return (
                      <div
                        key={i}
                        className="absolute right-2 text-[10px] text-muted-foreground font-mono"
                        style={{ top: (h - DAY_START) * HOUR_PX - 6 }}
                      >
                        {hh}:{mm}
                      </div>
                    );
                  })}
                </div>
                {DAYS.map((day) => (
                  <div key={day} className="relative border-l border-border/60">
                    {Array.from({ length: Math.ceil(totalH * 2) }, (_, i) => (
                      <div
                        key={i}
                        className="absolute inset-x-0"
                        style={{
                          top: (i + 1) * (HOUR_PX / 2),
                          borderTop: "1px solid hsl(var(--border) / 0.4)",
                        }}
                      />
                    ))}
                    {slots
                      .filter((s) => s.day === day)
                      .map((slot) => {
                        const [sh, sm] = slot.start.split(":").map(Number);
                        const [eh, em] = slot.end.split(":").map(Number);
                        const startH = sh + sm / 60;
                        const endH = eh + em / 60;
                        const top = (startH - DAY_START) * HOUR_PX;
                        const height = Math.max((endH - startH) * HOUR_PX - 3, 26);
                        const eps = isEpsSubject(slot.subject);
                        return (
                          <div
                            key={slot._id}
                            style={{ top: top + 2, height }}
                            className={cn(
                              "absolute left-1 right-1 rounded-lg border px-2 py-1 text-left overflow-hidden",
                              slot.cancelled && "line-through decoration-destructive/60",
                              !eps && "transition-all hover:z-10 hover:brightness-125",
                              eps ? "cursor-default" : "cursor-pointer",
                              subjectColor(slot.subject),
                            )}
                            onClick={() => {
                              // Le sport n'a pas de devoirs : case non cliquable
                              if (eps) return;
                              onOpen(slot);
                            }}
                            title={
                              eps
                                ? "EPS — aucun devoir ni document"
                                : `${slot.subject} — voir les documents`
                            }
                          >
                            <p className="text-xs font-semibold truncate leading-tight">
                              {slot.cancelled && (
                                <Ban className="inline size-3 mr-1 text-destructive" />
                              )}
                              {slot.subject}
                            </p>
                            {height > 40 && (
                              <p className="text-[10px] opacity-80 truncate leading-tight">
                                {slot.start}–{slot.end}
                                {slot.teacher ? ` · ${slot.teacher}` : ""}
                                {slot.room ? ` · ${slot.room}` : ""}
                              </p>
                            )}
                            {eps && canEdit && (
                              <button
                                type="button"
                                className="absolute right-1 top-1 rounded p-1 bg-background/60 opacity-70 hover:opacity-100 cursor-pointer"
                                title="Modifier ou supprimer ce cours"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEdit(slot);
                                }}
                              >
                                <Pencil className="size-3" />
                              </button>
                            )}
                            {slot.cancelled && height > 50 && (
                              <p className="text-[10px] text-destructive font-medium">
                                Annulé
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
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

function formatDay(day: string | null): string {
  if (!day) return "…";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
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
  const eps = isEpsSubject(slot.subject);

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
                <span
                  className={cn("rounded-md border px-2 py-0.5", subjectColor(slot.subject))}
                >
                  {slot.subject}
                  {slot.cancelled && (
                    <Badge className="ml-2 bg-destructive/15 text-destructive border border-destructive/40 gap-1">
                      <Ban className="size-3" /> Annulé
                    </Badge>
                  )}
                </span>
              </DialogTitle>
              <DialogDescription>
                {slot.day} · {slot.start}–{slot.end}
                {slot.weekType !== "AB"
                  ? ` · semaine ${slot.weekType}`
                  : " · toutes les semaines"}
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

        {eps && (
          <div className="rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
            <Lock className="size-4" />
            L'EPS n'a pas de devoirs : cette matière ne comporte aucun document.
          </div>
        )}

        {!eps && (
          <>
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
                files.map((f) => (
                  <FileCard key={f._id} file={f as FileRow} canEdit={canEdit} />
                ))
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
          </>
        )}

        {canEdit && (
          <div className="border-t border-border/60 pt-3 space-y-2">
            {!eps && !showCancel && (
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
            )}
            {!eps && showCancel && (
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
            {canEdit && <EditHint slotId={slot._id} onEdit={onClose} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Ouvre l'édition du créneau via un événement écouté par la page EDT
function EditHint({ slotId, onEdit }: { slotId: string; onEdit: () => void }) {
  return (
    <Button
      variant="ghost"
      className="w-full"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent("coursflow:edit-slot", { detail: slotId }),
        );
        onEdit();
      }}
    >
      <Pencil className="size-4 mr-1.5" /> Modifier ou supprimer ce cours
    </Button>
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
          {file.hasFile && file.storageId && (
            <DownloadButton storageId={file.storageId} fileName={file.fileName} />
          )}
          {file.externalUrl && (
            <a href={file.externalUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" title="Ouvrir le lien">
                <ExternalLink className="size-4" />
              </Button>
            </a>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={deleting}
              title="Supprimer"
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function DownloadButton({
  storageId,
  fileName,
}: {
  storageId: Id<"_storage">;
  fileName: string;
}) {
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

function UploadForm({
  slotId,
  onDone,
}: {
  slotId: Id<"timetableSlots">;
  onDone: () => void;
}) {
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
      toast.error("Ajoutez un titre puis un fichier ou un lien.");
      return;
    }
    setUploading(true);
    try {
      let storageId: Id<"_storage"> | undefined;
      let fileName = file?.name ?? "lien externe";
      let fileType = file?.type || "text/uri-list";
      let bytes: number | undefined;

      if (file) {
        const postUrl = await generateUploadUrl();
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
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border/70 bg-secondary/30 p-3"
    >
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
        <Input
          id="up-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="DM n°3 — chapitre 4"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="up-desc">Consigne (facultatif)</Label>
        <Textarea
          id="up-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="À rendre pour vendredi, exercices 12 à 14…"
          rows={2}
        />
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
        <Input
          id="up-url"
          type="url"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <Button type="submit" className="w-full" disabled={uploading}>
        {uploading ? "Envoi…" : "Publier"}
      </Button>
    </form>
  );
}

// ---------- Formulaire ajout / édition de créneau (admins) ----------

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

function SlotForm({
  classId,
  initial,
  onDone,
}: {
  classId: Id<"classes">;
  initial?: Slot | null;
  onDone: () => void;
}) {
  const upsert = useMutation(api.app.upsertSlot);
  const remove = useMutation(api.app.deleteSlot);
  const [day, setDay] = useState<string>(initial?.day ?? "Lundi");
  const [start, setStart] = useState(initial?.start ?? "08:00");
  const [end, setEnd] = useState(initial?.end ?? "09:00");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [teacher, setTeacher] = useState(initial?.teacher ?? "");
  const [room, setRoom] = useState(initial?.room ?? "");
  const [weekType, setWeekType] = useState<"A" | "B" | "AB">(
    initial?.weekType ?? "AB",
  );
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await upsert({
        slotId: initial?._id,
        classId,
        day: day as (typeof DAYS)[number],
        start,
        end,
        subject: subject.trim(),
        teacher: teacher.trim() || undefined,
        room: room.trim() || undefined,
        weekType,
      });
      toast.success(initial ? "Cours modifié." : "Cours ajouté à l'emploi du temps.");
      onDone();
    } catch (err) {
      toast.error(
        err instanceof Error && !err.message.startsWith("{")
          ? err.message
          : "Enregistrement impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initial) return;
    setRemoving(true);
    try {
      await remove({ slotId: initial._id });
      toast.success("Cours supprimé de l'emploi du temps.");
      onDone();
    } catch {
      toast.error("Suppression impossible.");
      setRemoving(false);
    }
  };

  return (
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
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sl-room">Salle</Label>
          <Input
            id="sl-room"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="B204"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sl-start">Début</Label>
          <Input
            id="sl-start"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sl-end">Fin</Label>
          <Input
            id="sl-end"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
          {day === "Mercredi" && end > "12:10" && (
            <p className="text-xs text-destructive">
              Le mercredi, les cours s'arrêtent au plus tard à 12:10.
            </p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sl-subject">Matière</Label>
        <Input
          id="sl-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Mathématiques"
          list="subjects-list"
          required
        />
        <datalist id="subjects-list">
          {COMMON_SUBJECTS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">
          La couleur de la case suit automatiquement la matière (EPS : sans devoirs).
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Semaine</Label>
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
        <Label htmlFor="sl-teacher">Professeur</Label>
        <Input
          id="sl-teacher"
          value={teacher}
          onChange={(e) => setTeacher(e.target.value)}
          placeholder="Mme Bernard"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving ? "Enregistrement…" : initial ? "Enregistrer" : "Ajouter le cours"}
        </Button>
        {initial && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={removing}
          >
            <Trash2 className="size-4 mr-1.5" />
            {removing ? "…" : "Supprimer"}
          </Button>
        )}
      </div>
    </form>
  );
}

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
  if (!canEdit) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel border-border/80 max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un cours</DialogTitle>
          <DialogDescription>
            Créneau de l'emploi du temps de la classe.
          </DialogDescription>
        </DialogHeader>
        <SlotForm classId={classId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditSlotDialog({
  slot,
  classId,
  onDone,
}: {
  slot: Slot | null;
  classId: Id<"classes">;
  onDone: () => void;
}) {
  if (!slot) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="panel border-border/80 max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le cours</DialogTitle>
          <DialogDescription>
            {slot.day} · {slot.start}–{slot.end} — {slot.subject}
          </DialogDescription>
        </DialogHeader>
        <SlotForm classId={classId} initial={slot} onDone={onDone} />
      </DialogContent>
    </Dialog>
  );
}
