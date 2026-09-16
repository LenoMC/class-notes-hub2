// Créneaux fixes de la journée — partagés entre le backend et le frontend.
// Liste établie par l'utilisateur :
// 8:15-9:10 · 9:10-10:05 · [récré] · 10:20-11:15 · 11:15-12:10 · [déjeuner]
// 12:45-13:40 · 13:40-14:35 · [récré] · 14:55-15:50 · 15:50-16:45

export type Period = {
  id: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

export const PERIODS: Period[] = [
  { id: "P1", start: "08:15", end: "09:10" },
  { id: "P2", start: "09:10", end: "10:05" },
  { id: "P3", start: "10:20", end: "11:15" },
  { id: "P4", start: "11:15", end: "12:10" },
  { id: "P5", start: "12:45", end: "13:40" },
  { id: "P6", start: "13:40", end: "14:35" },
  { id: "P7", start: "14:55", end: "15:50" },
  { id: "P8", start: "15:50", end: "16:45" },
];

/** Pauses de la journée : aucune matière possible pendant ces plages. */
export const PAUSES: Array<{ after: string; label: string }> = [
  { after: "P2", label: "Récréation" },
  { after: "P4", label: "Déjeuner" },
  { after: "P6", label: "Récréation" },
];

/** Créneaux disponibles pour un jour donné (tous identiques désormais). */
export function periodsForDay(_day: string): Period[] {
  return PERIODS;
}

/** Libellé court d'un créneau, ex. « 8:15 - 9:10 ». */
export function periodLabel(start: string, end: string): string {
  return `${start.replace(/^0/, "")} - ${end}`;
}
