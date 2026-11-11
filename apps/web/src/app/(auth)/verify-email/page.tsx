"use client";

import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, LinkIcon, MailOpen } from "lucide-react";
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
      <AuthCard icon={LinkIcon} tone="bad" title="That link didn't work" subtitle="It may have expired or already been used. Log in and we'll offer to send you a new one.">
        <Button asChild size="lg" className="w-full" variant="secondary">
          <Link href="/login">Back to login</Link>
        </Button>
      </AuthCard>
    );
  }
  if (verify.isSuccess) {
    return (
      <AuthCard icon={BadgeCheck} tone="good" title="Email verified" subtitle="Your account is ready. Log in to get started.">
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Log in</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard icon={MailOpen} title="Verifying your email" subtitle="This only takes a moment.">
      <div role="status" aria-label="Verifying your email">
        <Skeleton className="h-11" />
      </div>
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
