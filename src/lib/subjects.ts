// Couleurs et règles par matière — partagé entre le backend Convex et le frontend.
// Couleurs reprises de l'emploi du temps réel (Pronote) fourni par l'utilisateur :
// Vert = Technologie & SVT · Bleu = Français · Rose = Anglais
// Rouge saumon = Mathématiques · Jaune olive = Histoire-Géo
// Saumon pâle = Physique-Chimie · Gris clair = Allemand · Violet = Latin
// Gris bleuté = LCE/LLC · Violet pâle = EPS · Bleu clair = Arts · Beige = Musique.

import type { CSSProperties } from "react";

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
  if (/latin|\blca\b/.test(n)) return "latin";
  if (/\blce\b|llc/.test(n)) return "lce";
  if (/\bsvt\b|sciences\s*vie/.test(n)) return "svt";
  if (/techno/.test(n)) return "technologie";
  if (/arts?\s*plastiques/.test(n)) return "arts";
  if (/musique/.test(n)) return "musique";
  if (/vie\s*de\s*classe/.test(n)) return "vieclasse";
  return "default";
}

/** Couleur de référence de chaque matière (identique à l'EDT réel). */
export const SUBJECT_HEX: Record<string, string> = {
  francais: "#3b6bc7", // bleu
  technologie: "#5f9c57", // vert
  svt: "#5f9c57", // vert
  anglais: "#e57fb1", // rose
  mathematiques: "#cd6155", // rouge saumon
  histoire: "#b5b35c", // jaune olive
  physiquechimie: "#d99a76", // saumon pâle
  allemand: "#aeb6c4", // gris clair
  latin: "#8a7cc2", // violet
  lce: "#7d8aa8", // gris bleuté
  eps: "#c3b6e8", // violet pâle
  arts: "#8fb8d8", // bleu clair
  musique: "#c2b49a", // beige
  espagnol: "#d9924e", // orange doux
  vieclasse: "#9aa2b1", // gris neutre
};

const DEFAULT_HEX = "#5b74c9"; // bleu électrique du thème

export function subjectHex(subject: string): string {
  return SUBJECT_HEX[subjectKey(subject)] ?? DEFAULT_HEX;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lighten(hex: string, amount = 0.65): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Style d'une « pastille » matière (badge compact). */
export function subjectStyle(
  subject: string,
  colorOverride?: string | null,
): CSSProperties {
  const hex = colorOverride || subjectHex(subject);
  return {
    backgroundColor: hexToRgba(hex, 0.3),
    borderColor: hexToRgba(hex, 0.65),
    color: lighten(hex, 0.7),
  };
}

/** Style d'une case de l'emploi du temps (fond plus visible). */
export function slotStyle(
  subject: string,
  colorOverride?: string | null,
): CSSProperties {
  const hex = colorOverride || subjectHex(subject);
  return {
    backgroundColor: hexToRgba(hex, 0.38),
    borderColor: hexToRgba(hex, 0.7),
    color: "#f4f6fb",
  };
}

/** Couleur par défaut d'une matière (utilise la couleur officielle). */
export function defaultColorFor(subject: string): string | undefined {
  return SUBJECT_HEX[subjectKey(subject)];
}

/** Palette proposée à la création d'un cours (couleur libre). */
export const COLOR_CHOICES: Array<{ name: string; hex: string }> = [
  { name: "Bleu — Français", hex: "#3b6bc7" },
  { name: "Vert — Techno / SVT", hex: "#5f9c57" },
  { name: "Rose — Anglais", hex: "#e57fb1" },
  { name: "Rouge — Mathématiques", hex: "#cd6155" },
  { name: "Jaune olive — Histoire-Géo", hex: "#b5b35c" },
  { name: "Saumon — Physique-Chimie", hex: "#d99a76" },
  { name: "Gris clair — Allemand", hex: "#aeb6c4" },
  { name: "Violet — Latin", hex: "#8a7cc2" },
  { name: "Gris bleuté — LCE", hex: "#7d8aa8" },
  { name: "Violet pâle — EPS", hex: "#c3b6e8" },
  { name: "Bleu clair — Arts Plastiques", hex: "#8fb8d8" },
  { name: "Beige — Musique", hex: "#c2b49a" },
  { name: "Orange — Espagnol", hex: "#d9924e" },
  { name: "Gris — Vie de classe", hex: "#9aa2b1" },
];

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
