import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type Tone = "primary" | "good" | "warn" | "bad" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  primary: "bg-primary-100 text-primary-800 ring-primary-200",
  good: "bg-good-soft text-good ring-good-line",
  warn: "bg-warn-soft text-warn ring-warn-line",
  bad: "bg-bad-soft text-bad ring-bad-line",
  info: "bg-info-soft text-info ring-info-line",
  neutral: "bg-neutral-soft text-muted ring-neutral-line",
};

const DOTS: Record<Tone, string> = {
  primary: "bg-primary",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  info: "bg-info",
  neutral: "bg-subtle",
};

export function Badge({ tone = "neutral", dot, className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", TONES[tone], className)} {...props}>
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}

export function StatusDot({ tone, className, label }: { tone: Tone; className?: string; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block size-2.5 shrink-0 rounded-full ring-2 ring-surface", DOTS[tone], className)}
    />
  );
}
