"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthCard, FormError } from "@/components/auth-card";
import { MIN_PASSWORD, PasswordStrength } from "@/components/password-strength";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
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
      <AuthCard title="That link didn't work" subtitle="Request a new reset link.">
        <Button asChild className="w-full" variant="secondary">
          <Link href="/forgot-password">Reset password</Link>
        </Button>
      </AuthCard>
    );
  }
  if (reset.isSuccess) {
    return (
      <AuthCard title="Password changed" subtitle="You can log in with your new password.">
        <Button asChild className="w-full">
          <Link href="/login">Log in</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" required autoFocus minLength={MIN_PASSWORD} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <PasswordStrength password={password} />
        </div>
        <FormError error={reset.error} />
        <Button type="submit" className="w-full" disabled={reset.isPending}>
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
