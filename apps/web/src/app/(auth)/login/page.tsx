"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard, FormError } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api, ApiFailure } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => api("/auth/login", { method: "POST", body: { email, password } }),
    onSuccess: () => router.replace("/"),
  });
  const resend = useMutation({ mutationFn: () => api("/auth/resend-verification", { method: "POST", body: { email } }) });
  const unverified = login.error instanceof ApiFailure && login.error.code === "email_not_verified";

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate();
  }

  return (
    <AuthCard
      title="Log in"
      subtitle="Welcome back"
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="font-medium text-primary">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" required autoComplete="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="password" className="mb-0">
              Password
            </Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        <FormError error={login.error} />
        {unverified && (
          <Button type="button" variant="secondary" size="sm" disabled={resend.isPending || resend.isSuccess} onClick={() => resend.mutate()}>
            {resend.isSuccess ? "Link sent. Check your inbox." : "Send a new verification link"}
          </Button>
        )}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? "Logging in" : "Log in"}
        </Button>
      </form>
    </AuthCard>
  );
}
