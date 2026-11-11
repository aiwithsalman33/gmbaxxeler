import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type Tone = "primary" | "good" | "warn" | "bad" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  primary: "bg-primary-100 text-primary-800 ring-primary-200",
  good: "bg-good-soft text-good ring-green-200",
  warn: "bg-warn-soft text-warn ring-amber-200",
  bad: "bg-bad-soft text-bad ring-red-200",
  info: "bg-info-soft text-info ring-blue-200",
  neutral: "bg-gray-100 text-muted ring-gray-200",
};

const DOTS: Record<Tone, string> = {
  primary: "bg-primary",
  good: "bg-green-600",
  warn: "bg-amber-500",
  bad: "bg-red-600",
  info: "bg-blue-600",
  neutral: "bg-gray-400",
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
      className={cn("inline-block size-2.5 shrink-0 rounded-full ring-2 ring-white", DOTS[tone], className)}
    />
  );
}
