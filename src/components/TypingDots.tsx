import { cn } from "@/lib/utils";

/** Animation « ••• écrit » : trois points qui rebondissent, suivis du nom. */
export function TypingDots({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-flex items-end gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-muted-foreground/70 animate-bounce"
            style={{ animationDelay: `${i * 150}ms`, animationDuration: "1s" }}
          />
        ))}
      </span>
      <span>{name} écrit…</span>
    </span>
  );
}

/** Variante compacte sans nom (bulle dans le fil). */
export function TypingBubble({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-secondary/70 px-3 py-2",
        className,
      )}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground/70 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "1s" }}
        />
      ))}
    </span>
  );
}
