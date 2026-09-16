// Alternance des semaines A/B — partagé entre le backend Convex et le frontend.
// Règle établie avec l'utilisateur : la semaine du 14 septembre 2026 est une
// semaine A (celle du 21 au 25 est donc une semaine B, et ainsi de suite).
// L'alternance est suspendue pendant les vacances saisies par les admins.

export const WEEK_ANCHOR_DEFAULT = "2026-09-14";

export const DAY_MS = 24 * 3600 * 1000;

export type HolidayPeriod = { label: string; startDay: string; endDay: string };

export type WeekState = {
  week: "A" | "B";
  isHoliday: boolean;
  holidayLabel: string | null;
  nextSchoolMonday: string | null;
};

function pad(n: number): string {
  return `${n}`.padStart(2, "0");
}

/** "YYYY-MM-DD" (heure locale) -> "YYYY-MM-DD" */
export function todayDayString(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

/** "YYYY-MM-DD" -> timestamp UTC minuit. */
export function dayToUTC(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Timestamp UTC minuit -> "YYYY-MM-DD". */
export function utcToDay(utc: number): string {
  const d = new Date(utc);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Lundi (timestamp UTC minuit) de la semaine contenant `utc`. */
export function mondayOfUTC(utc: number): number {
  const d = new Date(utc);
  return utc - ((d.getUTCDay() + 6) % 7) * DAY_MS;
}

function isBlockedWeek(mondayUTC: number, holidays: HolidayPeriod[]): boolean {
  const ws = mondayOfUTC(dayToUTC(utcToDay(mondayUTC)));
  for (const h of holidays) {
    const hs = mondayOfUTC(dayToUTC(h.startDay));
    const he = mondayOfUTC(dayToUTC(h.endDay));
    if (ws >= hs && ws <= he) return true;
  }
  return false;
}

/** État de l'alternance pour un jour donné. */
export function computeWeekState(
  today: string,
  anchor: string | null,
  holidays: HolidayPeriod[],
): WeekState {
  const anchorMonday = mondayOfUTC(dayToUTC(anchor ?? WEEK_ANCHOR_DEFAULT));
  const t = dayToUTC(today);

  // Vacances en cours ?
  for (const h of holidays) {
    if (t >= dayToUTC(h.startDay) && t <= dayToUTC(h.endDay)) {
      let cursor = mondayOfUTC(t);
      while (isBlockedWeek(cursor, holidays)) cursor += 7 * DAY_MS;
      return {
        week: "A", // valeur neutre : l'alternance est suspendue
        isHoliday: true,
        holidayLabel: h.label,
        nextSchoolMonday: utcToDay(cursor),
      };
    }
  }

  // Compte des semaines A écoulées depuis l'ancre (hors vacances)
  const blocked = new Set<number>();
  for (const h of holidays) {
    let w = mondayOfUTC(dayToUTC(h.startDay));
    const wEnd = mondayOfUTC(dayToUTC(h.endDay));
    while (w <= wEnd) {
      blocked.add(w);
      w += 7 * DAY_MS;
    }
  }

  const todayMonday = mondayOfUTC(t);
  let count = 0;
  let cursor = anchorMonday;
  while (cursor <= todayMonday) {
    if (!blocked.has(cursor)) count += 1;
    cursor += 7 * DAY_MS;
  }
  return {
    week: count % 2 === 1 ? "A" : "B",
    isHoliday: false,
    holidayLabel: null,
    nextSchoolMonday: null,
  };
}

/** Étiquette d'une semaine (du lundi donné) : "A", "B" ou "vac". */
export function weekLabelFor(
  mondayUTC: number,
  anchor: string | null,
  holidays: HolidayPeriod[],
): "A" | "B" | "vac" {
  const monday = utcToDay(mondayUTC);
  for (const h of holidays) {
    if (monday >= h.startDay && monday <= h.endDay) return "vac";
  }
  return computeWeekState(monday, anchor, holidays).week;
}

/** Semaines (lundis) recouvrant un mois donné — pour le calendrier annuel. */
export function monthWeeks(year: number, month: number): number[][] {
  const firstMonday = mondayOfUTC(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lastMonday = mondayOfUTC(Date.UTC(year, month, lastDay));
  const weeks: number[][] = [];
  for (let w = firstMonday; w <= lastMonday; w += 7 * DAY_MS) {
    const days: number[] = [];
    for (let d = w; d < w + 7 * DAY_MS; d += DAY_MS) days.push(d);
    weeks.push(days);
  }
  return weeks;
}

/** Rentrée de l'année scolaire en cours (1er septembre, année de départ). */
export function schoolYearStart(): { year: number; month: number } {
  const now = new Date();
  return now.getMonth() >= 8
    ? { year: now.getFullYear(), month: 8 } // septembre de cette année
    : { year: now.getFullYear() - 1, month: 8 }; // septembre de l'an dernier
}

export function formatDayFr(day: string | null | undefined): string {
  if (!day) return "…";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
