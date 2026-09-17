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
import {
  COLOR_CHOICES,
  defaultColorFor,
  isEpsSubject,
  canSpanPeriods,
  slotStyle,
  subjectStyle,
} from "@/lib/subjects";
import {
  PAUSES,
  PERIODS,
  periodLabel,
  periodsForDay,
} from "@/lib/periods";
import { formatDayFr } from "@/lib/weeks";
import { useMutation, useQuery } from "convex/react";
import {
  Ban,
  CalendarX2,
  Download,
  ExternalLink,
  FileUp,
  Link2,
  Lock,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
  Users2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"] as const;

type Slot = {
  _id: Id<"timetableSlots">;
  day: string;
  start: string;
  end: string;
  subject: string;
  teacher?: string;
  room?: string;
  weekType: "A" | "B" | "AB";
  group?: "G1" | "G2" | null;
  color?: string;
  cancelled?: boolean;
  cancellationReason?: string;
};

type WeekState = {
  week: "A" | "B";
  isHoliday: boolean;
  holidayLabel: string | null;
  nextSchoolMonday: string | null;
};

/** Position d'un cours dans la grille : ligne de départ + nombre de lignes. */
function slotPlacement(slot: Slot): { startIdx: number; span: number } {
  const startIdx = PERIODS.findIndex((p) => p.start === slot.start);
  const endIdx = PERIODS.findIndex((p) => p.end === slot.end);
  const s = startIdx >= 0 ? startIdx : 0;
  const e = endIdx >= 0 ? endIdx : s;
  return { startIdx: s, span: Math.max(e - s + 1, 1) };
}

/** Géométrie de la grille : hauteur d'un créneau, gouttière entre créneaux,
    et position cumulée du haut de chaque créneau (bandes de pause incluses).
    Sert à poser les cours en absolu, à cheval sur la croix entre deux
    créneaux (EPS, Sécurité Civile). */
const ROW_H = 84;
const ROW_GAP = 8; // = gap-2
const ROW_TOPS: number[] = (() => {
  const tops: number[] = [];
  let y = 0;
  PERIODS.forEach((p, i) => {
    tops[i] = y;
    y += ROW_H;
    const pause = PAUSES.find((pa) => pa.after === p.id);
    y += ROW_GAP + (pause ? pause.h + ROW_GAP : 0);
  });
  return tops;
})();

/** Hauteur totale du corps de grille (créneaux + bandes de pause). */
const BODY_H = ROW_TOPS[ROW_TOPS.length - 1] + ROW_H;

/** Calculs de position d'une colonne jour (en absolu dans le corps).
    Géométrie : axe 64px + 4 gouttières de 8px + marge droite de 8px. */
const AXIS_W = 64;
const colLeft = (di: number) =>
  `calc(${AXIS_W}px + ${di} * ((100% - ${AXIS_W + 40}px) / 5 + 8px))`;
const COL_WIDTH = `calc((100% - ${AXIS_W + 40}px) / 5)`;
const GRID_COLS = `${AXIS_W}px repeat(5, calc((100% - ${AXIS_W + 40}px) / 5))`;

/** Convertit "HH:MM" en minutes depuis minuit. */
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Position Y (px) correspondant à une minute de la journée, sur l'axe.
    Renvoie null si l'heure est hors de la grille (avant 8:15, après 16:45). */
function yForMinute(min: number): number | null {
  const first = PERIODS[0];
  const last = PERIODS[PERIODS.length - 1];
  if (min < toMin(first.start) || min > toMin(last.end)) return null;
  for (let i = 0; i < PERIODS.length; i++) {
    const p = PERIODS[i];
    const sMin = toMin(p.start);
    const eMin = toMin(p.end);
    if (min <= eMin) {
      // Dans le créneau i (ou exactement à son début)
      const frac = Math.max(0, Math.min(1, (min - sMin) / (eMin - sMin)));
      return ROW_TOPS[i] + frac * ROW_H;
    }
    // Dans la pause qui suit ce créneau ?
    const pause = PAUSES.find((pa) => pa.after === p.id);
    const next = PERIODS[i + 1];
    if (pause && next && min < toMin(next.start)) {
      const gapTop = ROW_TOPS[i] + ROW_H + ROW_GAP;
      const pauseTop = gapTop + ROW_GAP;
      const frac = (min - eMin) / (toMin(next.start) - eMin);
      return pauseTop + frac * pause.h;
    }
  }
  return null;
}

export default function Timetable() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSlotId = searchParams.get("slot");
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);

  const weekState = useQuery(api.app.weekState) as WeekState | undefined;
  // Semaine actuelle uniquement (A ou B selon l'alternance calculée).
  const slots = useQuery(api.app.listMySlots, { week: weekState?.week ?? "A" }) ?? [];
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
      setSelected(null);
      setEditingSlotId(id);
    };
    window.addEventListener("coursflow:edit-slot", handler);
    return () => window.removeEventListener("coursflow:edit-slot", handler);
  }, []);

  if (!user) return null;

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
          weekState={weekState}
        />
      )}

      {selected && (
        <SlotDialog
          slot={selected}
          canEdit={user.isAdmin || user.isClassAdmin}
          isAdmin={user.isAdmin}
          onClose={closeSlot}
        />
      )}

      {editingSlotId && user.classId && (
        <EditSlotDialog
          slot={(slots as Slot[]).find((s) => s._id === editingSlotId) ?? null}
          classId={user.classId}
          isAdmin={user.isAdmin}
          onDone={() => setEditingSlotId(null)}
        />
      )}

      {(user.isAdmin || user.isClassAdmin) && (
        <div className="mt-6">
          <FridayGroupsCard />
        </div>
      )}
    </AppShell>
  );
}

// ---------- Grille à créneaux fixes (avec fusion sur plusieurs créneaux) ----------

function TimetableGrid({
  slots,
  onOpen,
  onEdit,
  isClassAdmin,
  isAdmin,
  classId,
  weekState,
}: {
  slots: Slot[];
  onOpen: (slot: Slot) => void;
  onEdit: (slot: Slot) => void;
  isClassAdmin: boolean;
  isAdmin: boolean;
  classId: Id<"classes">;
  weekState: WeekState | undefined;
}) {
  const canEdit = isAdmin || isClassAdmin;
  const [showAdd, setShowAdd] = useState(false);
  const week = weekState?.week ?? "A";
  const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const todayName = DAYS_FR[new Date().getDay()];
  // Horloge vivante : re-rendu chaque 30 s pour déplacer la ligne « maintenant ».
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const isSchoolDay = todayName !== "Samedi" && todayName !== "Dimanche";
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowY = isSchoolDay ? yForMinute(nowMin) : null;

  // Regroupe les cours par case de départ « jour|ligne » (A et B côte à côte)
  const cellGroups = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const di = DAYS.indexOf(s.day as (typeof DAYS)[number]);
      if (di < 0) continue;
      const { startIdx } = slotPlacement(s);
      const key = `${di}|${startIdx}`;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [slots]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Emploi du temps</h1>
          <p className="text-sm text-muted-foreground">
            Sélectionnez un cours pour consulter ses documents.
            {weekState?.isHoliday && weekState.holidayLabel && (
              <span className="block sm:inline text-amber-300">
                {weekState.holidayLabel} — reprise le{" "}
                {formatDayFr(weekState.nextSchoolMonday)}.
              </span>
            )}
          </p>
        </div>
        <Badge
          variant="outline"
          className="font-mono text-xs border-primary/50 text-primary"
        >
          Semaine {weekState?.isHoliday ? "— vacances" : week || "…"} (actuelle)
        </Badge>
        {canEdit && (
          <Button className="gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="size-4" /> Ajouter un cours
          </Button>
        )}
      </div>

      <Card className="panel border-border/70 overflow-hidden">
        <CardContent className="p-3 sm:p-5">
          <div className="overflow-x-auto pb-1">
            <div className="min-w-[880px]">
              {/* En-tête des jours — même géométrie que le corps */}
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                <div />
                {DAYS.map((d) => (
                  <div
                    key={d}
                    className={cn(
                      "py-2 text-center text-sm font-bold tracking-wide rounded-lg border transition-colors",
                      d === todayName
                        ? "bg-primary/20 border-primary/50 text-primary shadow-[0_0_16px_rgba(91,116,201,0.25)]"
                        : "bg-secondary/60 border-border/50",
                    )}
                  >
                    {d}
                    {d === todayName && (
                      <span className="block text-[9px] font-mono font-normal opacity-75">
                        aujourd'hui
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Corps : positionnement absolu — les heures sont posées SUR les
                  traits de l'axe de gauche, les pauses (récréation, déjeuner)
                  occupent de vraies bandes horizontales, et une ligne «
                  maintenant » suit l'heure réelle pendant la journée. */}
              <div className="relative" style={{ height: BODY_H }}>
                {/* Cellules de fond (toutes les cases jour/créneau) */}
                {PERIODS.map((p, i) =>
                  DAYS.map((day, di) => (
                    <div
                      key={`bg-${p.id}-${day}`}
                      className="absolute rounded-xl border border-border/40 bg-secondary/25"
                      style={{
                        top: ROW_TOPS[i],
                        height: ROW_H,
                        left: colLeft(di),
                        width: COL_WIDTH,
                      }}
                    />
                  )),
                )}

                {/* Bandes de pause. Récréation : fine, contenue entre la fin de
                    l'axe et les cases (ne déborde pas). Déjeuner : rendu comme
                    un cours vide de la hauteur d'un créneau. */}
                {PAUSES.map((pause) => {
                  const idx = PERIODS.findIndex((p) => p.id === pause.after);
                  if (idx < 0) return null;
                  const top = ROW_TOPS[idx] + ROW_H + ROW_GAP;
                  const isLunch = pause.kind === "lunch";
                  return isLunch ? (
                    <div
                      key={pause.label + idx}
                      className="absolute flex items-center justify-center rounded-xl border border-border/40 bg-secondary/25"
                      style={{
                        top,
                        height: pause.h,
                        left: `calc(${AXIS_W}px + 8px)`,
                        right: 0,
                      }}
                    >
                      <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
                        {pause.label}
                      </span>
                    </div>
                  ) : (
                    <div
                      key={pause.label + idx}
                      className="absolute flex items-center justify-center rounded-md border border-dashed border-amber-300/30 bg-amber-300/[0.05]"
                      style={{
                        top,
                        height: pause.h,
                        left: AXIS_W,
                        right: 0,
                      }}
                    >
                      <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                        {pause.label}
                      </span>
                    </div>
                  );
                })}

                {/* Ligne « maintenant » : suit l'heure réelle de la journée. */}
                {nowY !== null && (
                  <div
                    className="absolute pointer-events-none z-10"
                    style={{ top: nowY, left: AXIS_W, right: 0 }}
                  >
                    <div className="relative h-0 border-t-2 border-red-400/80 shadow-[0_0_8px_rgba(248,113,113,0.5)]">
                      <span className="absolute -top-[7px] -left-px size-3 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.8)]" />
                      <span className="absolute -top-[9px] right-1 rounded bg-red-400/90 px-1.5 text-[9px] font-bold leading-[18px] text-background font-mono">
                        {now.getHours()}:{String(now.getMinutes()).padStart(2, "0")}
                      </span>
                    </div>
                  </div>
                )}

                {/* Étiquettes horaires sur l'axe de GAUCHE : chaque heure une
                    seule fois, centrée sur le trait qui sépare les créneaux.
                    Alternance de teinte pour faciliter la lecture : créneaux
                    pairs en blanc, impairs en gris. */}
                {PERIODS.map((p, i) => {
                  const pauseAfter = PAUSES.find((pa) => pa.after === p.id);
                  const even = i % 2 === 0;
                  return (
                    <div key={p.id}>
                      <span
                        className={cn(
                          "absolute font-mono text-[10px] font-bold leading-none",
                          even ? "text-white" : "text-muted-foreground",
                        )}
                        style={{
                          top: ROW_TOPS[i],
                          left: 0,
                          width: AXIS_W - 8,
                          textAlign: "right",
                          transform: "translateY(-50%)",
                        }}
                      >
                        {p.start}
                      </span>
                      {(pauseAfter || i === PERIODS.length - 1) && (
                        <span
                          className={cn(
                            "absolute font-mono text-[10px] leading-none",
                            even ? "text-muted-foreground" : "text-white",
                          )}
                          style={{
                            top: ROW_TOPS[i] + ROW_H,
                            left: 0,
                            width: AXIS_W - 8,
                            textAlign: "right",
                            transform: "translateY(-50%)",
                          }}
                        >
                          {p.end}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Cours : posés sur leur créneau de départ, fusion verticale
                    sur plusieurs créneaux (EPS, Sécurité Civile) */}
                {[...cellGroups.entries()].map(([key, group]) => {
                  const [diStr, siStr] = key.split("|");
                  const di = Number(diStr);
                  const startIdx = Number(siStr);
                  const span = Math.max(
                    ...group.map((s) => slotPlacement(s).span),
                  );
                  const lastIdx = startIdx + span - 1;
                  const bottom = ROW_TOPS[lastIdx] + ROW_H;
                  return (
                    <div
                      key={key}
                      className="absolute"
                      style={{
                        top: ROW_TOPS[startIdx],
                        height: bottom - ROW_TOPS[startIdx],
                        left: colLeft(di),
                        width: COL_WIDTH,
                      }}
                    >
                      <div
                        className={cn(
                          "grid h-full gap-1.5",
                          group.length === 2 ? "grid-cols-2" : "grid-cols-1",
                        )}
                      >
                        {group.map((slot) => (
                          <CourseBox
                            key={slot._id}
                            slot={slot}
                            canEdit={canEdit}
                            onOpen={onOpen}
                            onEdit={onEdit}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
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

function CourseBox({
  slot,
  canEdit,
  onOpen,
  onEdit,
}: {
  slot: Slot;
  canEdit: boolean;
  onOpen: (slot: Slot) => void;
  onEdit: (slot: Slot) => void;
}) {
  const eps = isEpsSubject(slot.subject);
  return (
    <div
      style={slotStyle(slot.subject, slot.color)}
      className={cn(
        "relative flex flex-col justify-center rounded-lg border px-2.5 py-2 overflow-hidden shadow-sm",
        slot.cancelled && "line-through decoration-destructive/70",
        !eps &&
          "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110",
        eps && "cursor-default",
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
      <p className="text-[13px] font-bold leading-tight truncate">
        {slot.cancelled && <Ban className="inline size-3 mr-1 text-destructive" />}
        {slot.subject}
      </p>
      {slot.teacher && (
        <p className="mt-0.5 flex items-center gap-1 text-[10px] opacity-90 truncate">
          <UserRound className="size-2.5 shrink-0" />
          {slot.teacher}
        </p>
      )}
      {slot.room && (
        <p className="flex items-center gap-1 text-[10px] opacity-80 truncate italic">
          <MapPin className="size-2.5 shrink-0" />
          {slot.room}
        </p>
      )}
      {slot.weekType !== "AB" && (
        <span className="absolute bottom-1 right-1.5 text-[8px] font-mono opacity-70">
          {slot.weekType}
        </span>
      )}
      {slot.group && (
        <span className="absolute bottom-1 left-1.5 text-[8px] font-mono font-bold opacity-90">
          {slot.group === "G1" ? "GR 1" : "GR 2"}
        </span>
      )}
      {eps && canEdit && (
        <button
          type="button"
          className="absolute right-1 top-1 rounded p-1 bg-background/70 opacity-70 hover:opacity-100 cursor-pointer"
          title="Modifier ce cours"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(slot);
          }}
        >
          <Pencil className="size-3" />
        </button>
      )}
      {slot.cancelled && (
        <span className="absolute top-1 right-1 text-[8px] text-destructive font-bold uppercase">
          {eps ? "" : "annulé"}
        </span>
      )}
    </div>
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
  isAdmin,
  onClose,
}: {
  slot: Slot;
  canEdit: boolean;
  isAdmin: boolean;
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
                  className="rounded-md border px-2 py-0.5"
                  style={subjectStyle(slot.subject, slot.color)}
                >
                  {slot.subject}
                </span>
                {slot.cancelled && (
                  <Badge className="bg-destructive/15 text-destructive border border-destructive/40 gap-1">
                    <Ban className="size-3" /> Annulé
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {slot.day} · {periodLabel(slot.start, slot.end)}
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
            {/* Les responsables modifient ; seuls les admins globaux suppriment */}
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("coursflow:edit-slot", { detail: slot._id }),
                );
              }}
            >
              <Pencil className="size-4 mr-1.5" /> Modifier ce cours
              {!isAdmin && (
                <span className="text-xs text-muted-foreground ml-1">
                  (la suppression est réservée aux administrateurs)
                </span>
              )}
            </Button>
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
  "Sécurité Civile",
  "Vie de classe",
];

function SlotForm({
  classId,
  initial,
  isAdmin,
  onDone,
}: {
  classId: Id<"classes">;
  initial?: Slot | null;
  isAdmin: boolean;
  onDone: () => void;
}) {
  const upsert = useMutation(api.app.upsertSlot);
  const remove = useMutation(api.app.deleteSlot);
  const [day, setDay] = useState<string>(initial?.day ?? "Lundi");
  const [periodStart, setPeriodStart] = useState<string>(
    initial?.start ?? "08:15",
  );
  const [periodEnd, setPeriodEnd] = useState<string>(initial?.end ?? "09:10");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [teacher, setTeacher] = useState(initial?.teacher ?? "");
  const [room, setRoom] = useState(initial?.room ?? "");
  const [weekType, setWeekType] = useState<"A" | "B" | "AB">(
    initial?.weekType ?? "AB",
  );
  const [group, setGroup] = useState<"G1" | "G2" | null>(
    initial?.group ?? null,
  );
  const [color, setColor] = useState<string>(
    initial?.color ?? defaultColorFor(initial?.subject ?? "") ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const dayPeriods = periodsForDay(day);
  const startPeriod =
    dayPeriods.find((p) => p.start === periodStart) ?? dayPeriods[0];
  // Un cours occupe UN seul créneau fixe. Seuls l'EPS et la Sécurité Civile
  // peuvent chevaucher plusieurs créneaux (ex. 10:20 à 12:10) : le champ Fin
  // est alors débloqué, sinon il est verrouillé sur la fin du créneau choisi.
  const spannable = canSpanPeriods(subject);
  const endOptions = spannable
    ? dayPeriods.filter((p) => p.end > periodStart)
    : startPeriod
      ? [startPeriod]
      : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startPeriod) return;
    setSaving(true);
    try {
      await upsert({
        slotId: initial?._id,
        classId,
        day: day as (typeof DAYS)[number],
        start: startPeriod.start,
        end: periodEnd,
        subject: subject.trim(),
        teacher: teacher.trim() || undefined,
        room: room.trim() || undefined,
        weekType,
        ...(group ? { group } : {}),
        color: color || undefined,
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
    } catch (err) {
      toast.error(
        err instanceof Error && !err.message.startsWith("{")
          ? err.message
          : "Suppression impossible (réservée aux administrateurs globaux).",
      );
      setRemoving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="sl-day">Jour</Label>
          <select
            id="sl-day"
            value={day}
            onChange={(e) => {
              const nextDay = e.target.value;
              setDay(nextDay);
              const next = periodsForDay(nextDay);
              if (!next.some((p) => p.start === periodStart)) {
                setPeriodStart(next[0].start);
                setPeriodEnd(next[0].end);
              } else if (!next.some((p) => p.end === periodEnd)) {
                const sp = next.find((p) => p.start === periodStart) ?? next[0];
                setPeriodEnd(sp.end);
              }
            }}
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
          <Label htmlFor="sl-start">Début</Label>
          <select
            id="sl-start"
            value={periodStart}
            onChange={(e) => {
              setPeriodStart(e.target.value);
              const sp = dayPeriods.find((p) => p.start === e.target.value);
              // Hors EPS, la fin suit toujours le créneau de début
              if (sp && (periodEnd <= e.target.value || !spannable))
                setPeriodEnd(sp.end);
            }}
            className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm font-mono"
          >
            {dayPeriods.map((p) => (
              <option key={p.id} value={p.start}>
                {periodLabel(p.start, p.end)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="sl-end">Fin</Label>
          {!spannable && (
            <span className="text-[11px] text-muted-foreground">
              Liée au créneau de début
            </span>
          )}
        </div>
        <select
          id="sl-end"
          value={periodEnd}
          disabled={!spannable}
          onChange={(e) => setPeriodEnd(e.target.value)}
          className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm font-mono disabled:cursor-not-allowed disabled:opacity-60"
        >
          {endOptions.map((p) => (
            <option key={p.id} value={p.end}>
              {p.end}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {spannable
            ? "L'EPS et la Sécurité Civile peuvent occuper plusieurs créneaux d'affilée."
            : "Seuls l'EPS et la Sécurité Civile peuvent occuper plusieurs créneaux."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sl-subject">Matière</Label>
        <Input
          id="sl-subject"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            // Suit la couleur de la matière tant que l'admin n'a rien choisi
            if (!initial?.color) setColor(defaultColorFor(e.target.value) ?? "");
            // Si l'on quitte l'EPS / la Sécurité Civile, la fin revient au
            // créneau simple
            if (!canSpanPeriods(e.target.value)) {
              const sp = dayPeriods.find((p) => p.start === periodStart);
              if (sp) setPeriodEnd(sp.end);
            }
          }}
          placeholder="Mathématiques"
          list="subjects-list"
          required
        />
        <datalist id="subjects-list">
          {COMMON_SUBJECTS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      {(
        <div className="space-y-1.5">
          <Label>Groupe</Label>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(
              [
                [null, "Tous"],
                ["G1", "Groupe 1"],
                ["G2", "Groupe 2"],
              ] as const
            ).map(([g, label]) => (
              <Button
                key={label}
                type="button"
                variant={group === g ? "default" : "ghost"}
                size="sm"
                className="flex-1 rounded-none text-xs"
                onClick={() => setGroup(g)}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            « Tous » s'affiche pour toute la classe ; « Groupe 1/2 » seulement
            pour les élèves concernés.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="sl-teacher">Professeur</Label>
          <Input
            id="sl-teacher"
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
            placeholder="M. DRONY"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sl-room">Salle</Label>
          <Input
            id="sl-room"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="304"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Couleur de la case</Label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setColor("")}
            title="Couleur de la matière"
            className={cn(
              "size-7 rounded-full border-2 cursor-pointer flex items-center justify-center text-[9px] font-bold",
              color === "" ? "border-primary" : "border-border",
            )}
            style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            auto
          </button>
          {COLOR_CHOICES.map((c) => (
            <button
              key={c.hex}
              type="button"
              title={c.name}
              onClick={() => setColor(c.hex)}
              className={cn(
                "size-7 rounded-full border-2 cursor-pointer",
                color === c.hex ? "border-primary" : "border-transparent",
              )}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          « auto » utilise la couleur officielle de la matière.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Semaine</Label>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(
            [
              ["AB", "Toutes"],
              ["A", "A"],
              ["B", "B"],
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
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving ? "Enregistrement…" : initial ? "Enregistrer" : "Ajouter le cours"}
        </Button>
        {initial && isAdmin && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={removing}
            title={
              isAdmin
                ? "Supprimer ce cours"
                : "Suppression réservée aux administrateurs globaux"
            }
          >
            <Trash2 className="size-4 mr-1.5" />
            {removing ? "…" : "Supprimer"}
          </Button>
        )}
      </div>
      {initial && !isAdmin && (
        <p className="text-xs text-muted-foreground">
          Vous pouvez modifier ce cours ; seule la suppression est réservée aux
          administrateurs globaux.
        </p>
      )}
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
  const { user } = useAuth();
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
        <SlotForm
          classId={classId}
          isAdmin={!!user?.isAdmin}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditSlotDialog({
  slot,
  classId,
  isAdmin,
  onDone,
}: {
  slot: Slot | null;
  classId: Id<"classes">;
  isAdmin: boolean;
  onDone: () => void;
}) {
  if (!slot) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="panel border-border/80 max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le cours</DialogTitle>
          <DialogDescription>
            {slot.day} · {periodLabel(slot.start, slot.end)} — {slot.subject}
          </DialogDescription>
        </DialogHeader>
        <SlotForm classId={classId} initial={slot} isAdmin={isAdmin} onDone={onDone} />
      </DialogContent>
    </Dialog>
  );
}

// ---------- Groupes du vendredi (responsable de classe) ----------

function FridayGroupsCard() {
  const { user } = useAuth();
  const canManage = !!user && (user.isAdmin || user.isClassAdmin);
  const members = useQuery(
    api.app.listMyClassMembers,
    canManage ? {} : "skip",
  ) as Array<{
    _id: Id<"users">;
    name: string | null;
    email: string | null;
    group: "G1" | "G2" | null;
  }> | undefined;
  const setGroup = useMutation(api.app.setUserGroup);
  const [show, setShow] = useState(false);

  if (!canManage) return null;

  const handleSet = async (
    userId: Id<"users">,
    group: "G1" | "G2" | null,
  ) => {
    try {
      await setGroup({ userId, group });
    } catch (err) {
      toast.error(
        err instanceof Error && !err.message.startsWith("{")
          ? err.message
          : "Attribution impossible.",
      );
    }
  };

  const g1 = (members ?? []).filter((m) => m.group === "G1");
  const g2 = (members ?? []).filter((m) => m.group === "G2");
  const none = (members ?? []).filter((m) => !m.group);

  return (
    <Card className="panel border-border/70">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users2 className="size-5 text-primary" /> Groupes du vendredi
            </CardTitle>
            <CardDescription>
              Répartissez les élèves en deux groupes. Un cours peut aussi être
              réservé à un groupe à sa création, pour n'importe quel jour.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShow((v) => !v)}>
            {show ? "Masquer" : "Gérer"}
          </Button>
        </div>
      </CardHeader>
      {show && (
        <CardContent>
          {!members ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(["G1", "G2"] as const).map((g) => {
                const list = g === "G1" ? g1 : g2;
                return (
                  <div
                    key={g}
                    className="rounded-lg border border-border/60 bg-secondary/30 p-3"
                  >
                    <p className="text-sm font-semibold mb-2">
                      {g === "G1" ? "Groupe 1" : "Groupe 2"}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        — {list.length} élève{list.length > 1 ? "s" : ""}
                      </span>
                    </p>
                    <div className="space-y-1">
                      {list.map((m) => (
                        <MemberRow
                          key={m._id}
                          m={m}
                          onSet={handleSet}
                          currentGroup={g}
                        />
                      ))}
                      {list.length === 0 && (
                        <p className="text-xs text-muted-foreground py-1">
                          Aucun élève pour le moment.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!members ? null : (
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">
                Sans groupe ({none.length})
              </p>
              <div className="space-y-1">
                {none.map((m) => (
                  <MemberRow key={m._id} m={m} onSet={handleSet} currentGroup={null} />
                ))}
                {none.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Tous les élèves ont un groupe.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function MemberRow({
  m,
  onSet,
  currentGroup,
}: {
  m: {
    _id: Id<"users">;
    name: string | null;
    email: string | null;
    group: "G1" | "G2" | null;
  };
  onSet: (userId: Id<"users">, group: "G1" | "G2" | null) => void;
  currentGroup: "G1" | "G2" | null;
}) {
  const other: "G1" | "G2" = currentGroup === "G1" ? "G2" : "G1";
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5">
      <span className="text-xs truncate">
        {m.name || m.email || "Utilisateur"}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] font-mono"
          onClick={() => onSet(m._id, other)}
          title={`Basculer en Groupe ${other === "G1" ? "1" : "2"}`}
        >
          → {other === "G1" ? "GR 1" : "GR 2"}
        </Button>
        {currentGroup && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            onClick={() => onSet(m._id, null)}
            title="Retirer du groupe"
          >
            <X className="size-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
