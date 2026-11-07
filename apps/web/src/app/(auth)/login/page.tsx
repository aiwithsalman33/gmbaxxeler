"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthCard, FormError } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiFailure, apiUrl } from "@/lib/api";

const GOOGLE_ERRORS: Record<string, string> = {
  not_allowed: "This Google account isn't allowed to use LocalPilot.",
  agency_account: "The agency Google account can't be used to log in. Use your own account.",
  google_denied: "Google sign-in was cancelled.",
  google_unverified: "This Google account's email isn't verified.",
  google_expired: "That sign-in took too long. Please try again.",
  google_redirect: "Google rejected the redirect URI. Check it in Settings > Google.",
  google_not_configured: "Google sign-in isn't set up yet.",
  google_failed: "Google sign-in failed. Please try again.",
};

function GoogleError() {
  const message = GOOGLE_ERRORS[useSearchParams().get("error") ?? ""];
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 text-sm text-bad">
      {message}
    </p>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const options = useQuery({ queryKey: ["auth-options"], queryFn: () => api<{ password: boolean; google: boolean }>("/auth/options") });
  const login = useMutation({
    mutationFn: () => api("/auth/login", { method: "POST", body: { email, password } }),
    onSuccess: () => router.replace("/"),
  });
  const resend = useMutation({ mutationFn: () => api("/auth/resend-verification", { method: "POST", body: { email } }) });
  const unverified = login.error instanceof ApiFailure && login.error.code === "email_not_verified";
  const passwordOn = options.data?.password ?? true;

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate();
  }

  return (
    <AuthCard
      title="Log in"
      subtitle="Welcome back"
      footer={
        passwordOn ? (
          <>
            New here?{" "}
            <Link href="/register" className="font-medium text-primary">
              Create an account
            </Link>
          </>
        ) : undefined
      }
    >
      <Suspense>
        <GoogleError />
      </Suspense>
      {options.isPending && <Skeleton className="mb-4 h-10" />}
      {options.data?.google && (
        <Button asChild variant="secondary" className="mb-4 w-full">
          <a href={apiUrl("/auth/google/start")}>Continue with Google</a>
        </Button>
      )}
      {options.data?.google && passwordOn && <p className="mb-4 text-center text-xs text-muted">or use your password</p>}
      {options.isError && <p className="mb-4 text-sm text-muted">Couldn't check sign-in options. Your password still works.</p>}
      {passwordOn && (
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
      )}
    </AuthCard>
  );
}
