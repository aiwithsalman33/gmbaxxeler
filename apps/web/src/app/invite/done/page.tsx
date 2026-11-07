"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";

function Result() {
  const connected = useSearchParams().get("result") === "connected";
  return (
    <Card className="w-full max-w-md p-8 text-center">
      <h1 className="text-xl font-bold">{connected ? "You're connected" : "That didn't work"}</h1>
      <p className="mt-2 text-sm text-muted">{connected ? "You can close this page." : "Please ask your agency for a new link."}</p>
    </Card>
  );
}

export default function InviteDonePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <Result />
      </Suspense>
    </main>
  );
}
