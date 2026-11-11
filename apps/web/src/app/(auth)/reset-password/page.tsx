"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, LinkIcon, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthCard, authLink, FormError } from "@/components/auth-card";
import { MIN_PASSWORD, PasswordInput, PasswordStrength } from "@/components/password-strength";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { api } from "@/lib/api";

function Reset() {
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const reset = useMutation({ mutationFn: () => api("/auth/reset-password", { method: "POST", body: { token, password } }) });

  function submit(event: FormEvent) {
    event.preventDefault();
    reset.mutate();
  }

  if (!token) {
    return (
      <AuthCard icon={LinkIcon} tone="bad" title="That link didn't work" subtitle="It's missing its reset code. Request a new link and open it straight from your email.">
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">Send a new link</Link>
        </Button>
      </AuthCard>
    );
  }
  if (reset.isSuccess) {
    return (
      <AuthCard icon={CheckCircle2} tone="good" title="Password changed" subtitle="You can now log in with your new password.">
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Log in</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      icon={LockKeyhole}
      title="Choose a new password"
      subtitle="Pick something you don't use anywhere else."
      footer={
        <Link href="/login" className={authLink}>
          Back to login
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <div>
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            id="password"
            required
            autoFocus
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            aria-describedby="password-strength"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordStrength id="password-strength" password={password} />
        </div>
        <FormError error={reset.error} />
        <Button type="submit" size="lg" className="w-full" loading={reset.isPending}>
          {reset.isPending ? "Saving" : "Save password"}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}
