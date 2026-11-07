import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-14 text-center">
      <div className="rounded-2xl bg-primary-soft p-3 text-primary">
        <Icon className="size-6" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted">{body}</p>
      {action}
    </Card>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-14 text-center">
      <AlertTriangle className="size-6 text-bad" />
      <h2 className="text-base font-semibold">That didn&apos;t load</h2>
      <p className="max-w-md text-sm text-muted">{error instanceof Error ? error.message : "Something went wrong"}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}
