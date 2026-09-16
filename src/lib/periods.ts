// Créneaux fixes de la journée — partagés entre le backend et le frontend.
// Liste établie par l'utilisateur :
// 8:15-9:10 · 9:10-10:05 · 10:20-11:15 · 12:45-13:40 · 13:40-14:35 · 14:55-15:50 · 15:50-16:45
// (+ 11:15-12:10, utilisé le mercredi qui s'arrête à 12h10).

export type Period = {
  id: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  mercrediOnly: boolean;
};

export const PERIODS: Period[] = [
  { id: "P1", start: "08:15", end: "09:10", mercrediOnly: false },
  { id: "P2", start: "09:10", end: "10:05", mercrediOnly: false },
  { id: "P3", start: "10:20", end: "11:15", mercrediOnly: false },
  { id: "P4", start: "11:15", end: "12:10", mercrediOnly: true }, // mercredi uniquement
  { id: "P5", start: "12:45", end: "13:40", mercrediOnly: false },
  { id: "P6", start: "13:40", end: "14:35", mercrediOnly: false },
  { id: "P7", start: "14:55", end: "15:50", mercrediOnly: false },
  { id: "P8", start: "15:50", end: "16:45", mercrediOnly: false },
];

/** Créneaux disponibles pour un jour donné (mercredi : jusqu'à 12h10). */
export function periodsForDay(day: string): Period[] {
  return PERIODS.filter((p) => (day === "Mercredi" ? true : !p.mercrediOnly));
}

/** Libellé court d'un créneau, ex. « 8:15 - 9:10 ». */
export function periodLabel(start: string, end: string): string {
  return `${start.replace(/^0/, "")} - ${end}`;
}
