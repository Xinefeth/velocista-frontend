// Tarjeta con su chip de backlog (IDs y alcance por sprint), como decoratePBI del prototipo.
// El chip se muestra/oculta por CSS (body.show-pbi) y el alcance atenúa por data-sprint.
import type { ReactNode } from "react";

export type Sprint = "1" | "2" | "C" | "W";

const SLAB: Record<Sprint, string> = { "1": "S1", "2": "S2", C: "Could", W: "Won't" };

export function PbiChip({
  pbi,
  sprint = "1",
  inl = false,
}: {
  pbi: string;
  sprint?: Sprint;
  inl?: boolean;
}) {
  return (
    <span className={inl ? "pbi inl" : "pbi"}>
      {pbi} <i data-s={sprint}>{SLAB[sprint]}</i>
    </span>
  );
}

interface CardProps {
  pbi?: string;
  sprint?: Sprint;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}

export function Card({ pbi, sprint = "1", className = "", children, ...rest }: CardProps) {
  return (
    <article
      className={`card ${className}`.trim()}
      data-pbi={pbi}
      data-sprint={pbi ? sprint : undefined}
      {...rest}
    >
      {pbi && <PbiChip pbi={pbi} sprint={sprint} />}
      {children}
    </article>
  );
}
