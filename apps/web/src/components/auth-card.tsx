import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-8">
        <Link href="/login" className="text-sm font-bold text-primary">
          LocalPilot
        </Link>
        <h1 className="mt-3 text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
      </Card>
    </main>
  );
}

export function FormError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-bad">
      {error.message}
    </p>
  );
}
