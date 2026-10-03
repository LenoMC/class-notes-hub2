import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type FicheKind = "cours" | "devoir" | "revision";

// Libellés et couleurs des types de fiches (cours / devoir / révision).

/** Libellé affiché pour un type de fiche. */
export function kindLabel(kind: FicheKind): string {
  return kind === "revision" ? "révision" : kind;
}

/** Pastille de couleur associée à un type de fiche. */
export function kindDotClass(kind: FicheKind): string {
  return kind === "devoir"
    ? "bg-primary"
    : kind === "revision"
      ? "bg-emerald-400"
      : "bg-muted-foreground/60";
}
