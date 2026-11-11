import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Shown when a list is empty. Always say what will appear here and how to get it. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondary,
  bare,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
  secondary?: ReactNode;
  /** Without the card frame, for use inside an existing card. */
  bare?: boolean;
  className?: string;
}) {
  const content = (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-12 text-center", className)}>
      <div className="relative mb-1">
        <div aria-hidden className="absolute inset-0 scale-150 rounded-full bg-primary-100/60 blur-xl" />
        <div className="relative flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700 ring-1 ring-primary-200">
          <Icon className="size-6" aria-hidden />
        </div>
      </div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="max-w-md text-sm text-muted">{body}</p>
      {(action || secondary) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
  return bare ? content : <Card className="p-0 sm:p-0">{content}</Card>;
}

export function ErrorState({ error, onRetry, bare }: { error: unknown; onRetry?: () => void; bare?: boolean }) {
  const content = (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-bad-soft text-bad ring-1 ring-red-200">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h2 className="text-base font-semibold">That didn&apos;t load</h2>
      <p className="max-w-md text-sm text-muted">{error instanceof Error ? error.message : "Something went wrong"}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
  return bare ? content : <Card className="p-0 sm:p-0">{content}</Card>;
}

/** Inline message strip for notes, warnings and errors inside a page. */
export function Notice({ tone = "info", icon: Icon, title, children, action, className }: { tone?: "info" | "warn" | "bad" | "good"; icon?: LucideIcon; title?: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  const tones = {
    info: "border-primary-200 bg-primary-50 text-primary-900 [&_svg]:text-primary",
    warn: "border-amber-200 bg-warn-soft text-amber-900 [&_svg]:text-warn",
    bad: "border-red-200 bg-bad-soft text-red-900 [&_svg]:text-bad",
    good: "border-green-200 bg-good-soft text-green-900 [&_svg]:text-good",
  };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cn("flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm", tones[tone], className)}>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5 opacity-90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
