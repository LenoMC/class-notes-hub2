// Couleurs et règles par matière — partagé entre le backend Convex et le frontend.

export function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** EPS / sport : pas de devoirs ni de fichiers, créneau non cliquable. */
export function isEpsSubject(subject: string): boolean {
  const n = normalizeSubject(subject);
  if (/chimie/.test(n)) return false; // physique-chimie n'est pas le sport
  return /(\beps\b|ed\s*\.?\s*physique|\bsport\b)/.test(n);
}

export function subjectKey(subject: string): string {
  const n = normalizeSubject(subject);
  if (isEpsSubject(subject)) return "eps";
  if (/physique|chimie/.test(n)) return "physiquechimie";
  if (/math/.test(n)) return "mathematiques";
  if (/franc/.test(n)) return "francais";
  if (/histoire|\bgeo\b/.test(n)) return "histoire";
  if (/anglais/.test(n)) return "anglais";
  if (/allemand|german/.test(n)) return "allemand";
  if (/espagnol/.test(n)) return "espagnol";
  if (/latin/.test(n)) return "latin";
  if (/\blce\b/.test(n)) return "lce";
  if (/\bsvt\b|sciences\s*vie/.test(n)) return "svt";
  if (/techno/.test(n)) return "technologie";
  if (/arts?\s*plastiques|\barts?\b/.test(n)) return "arts";
  if (/musique/.test(n)) return "musique";
  if (/vie\s*de\s*classe/.test(n)) return "vieclasse";
  return "default";
}

/** Couleurs par matière (tableau roulant de l'EDT). */
const COLORS: Record<string, string> = {
  francais: "bg-sky-500/15 border-sky-400/40 text-sky-100",
  mathematiques: "bg-rose-500/15 border-rose-400/40 text-rose-100",
  anglais: "bg-pink-500/15 border-pink-400/40 text-pink-100",
  allemand: "bg-amber-500/15 border-amber-400/40 text-amber-100",
  espagnol: "bg-orange-500/15 border-orange-400/40 text-orange-100",
  latin: "bg-indigo-500/15 border-indigo-400/40 text-indigo-100",
  lce: "bg-violet-500/15 border-violet-400/40 text-violet-100",
  histoire: "bg-yellow-500/15 border-yellow-400/40 text-yellow-100",
  physiquechimie: "bg-teal-500/15 border-teal-400/40 text-teal-100",
  svt: "bg-emerald-500/15 border-emerald-400/40 text-emerald-100",
  technologie: "bg-lime-500/15 border-lime-400/40 text-lime-100",
  eps: "bg-purple-400/10 border-purple-300/30 text-purple-100",
  arts: "bg-cyan-500/15 border-cyan-400/40 text-cyan-100",
  musique: "bg-fuchsia-500/15 border-fuchsia-400/40 text-fuchsia-100",
  vieclasse: "bg-slate-400/10 border-slate-300/30 text-slate-100",
};

const DEFAULT_COLOR = "bg-primary/10 border-primary/40 text-primary";

export function subjectColor(subject: string): string {
  return COLORS[subjectKey(subject)] ?? DEFAULT_COLOR;
}

/** Règles des options : au moins une LV2 (Allemand ou Espagnol), jamais les
 *  deux, 3 options maximum. LCE et Latin se cumulent avec l'une des deux LV2. */
export const OPTION_RULES = {
  min: 1,
  max: 3,
};

export function optionRuleError(options: string[]): string | null {
  const hasA = options.includes("Allemand");
  const hasE = options.includes("Espagnol");
  if (hasA && hasE) {
    return "Impossible de choisir Allemand et Espagnol ensemble.";
  }
  if (options.length > OPTION_RULES.max) {
    return `Maximum ${OPTION_RULES.max} options.`;
  }
  if (!hasA && !hasE) {
    return "Choisissez au moins une LV2 : Allemand ou Espagnol.";
  }
  return null;
}
