"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";

function Result() {
  const connected = useSearchParams().get("result") === "connected";
  return connected ? (
    <AuthCard audience="client" icon={CheckCircle2} tone="good" title="You're connected" subtitle="Thanks! Your agency can now look after your Business Profile. You can close this page." />
  ) : (
    <AuthCard audience="client" icon={XCircle} tone="bad" title="That didn't work" subtitle="Your profile wasn't connected. Please ask your agency for a new link." />
  );
}

export default function InviteDonePage() {
  return (
    <Suspense>
      <Result />
    </Suspense>
  );
}
