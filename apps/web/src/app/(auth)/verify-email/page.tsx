"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

function Verify() {
  const token = useSearchParams().get("token");
  const verify = useMutation({ mutationFn: () => api("/auth/verify-email", { method: "POST", body: { token } }) });
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verify.mutate();
  }, [token, verify]);

  if (!token || verify.isError) {
    return (
      <AuthCard title="That link didn't work" subtitle="It may have expired or already been used. Log in to request a new one.">
        <Button asChild className="w-full" variant="secondary">
          <Link href="/login">Back to login</Link>
        </Button>
      </AuthCard>
    );
  }
  if (verify.isSuccess) {
    return (
      <AuthCard title="Email verified" subtitle="Your account is ready.">
        <Button asChild className="w-full">
          <Link href="/login">Log in</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Verifying your email">
      <Skeleton className="h-10" />
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
