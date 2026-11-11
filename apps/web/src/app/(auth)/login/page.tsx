"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Info, MailWarning } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthCard, authLink, FormError, GoogleButton, OrDivider } from "@/components/auth-card";
import { PasswordInput } from "@/components/password-strength";
import { Notice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
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
    <Notice tone="bad" icon={AlertCircle} className="mb-5">
      {message}
    </Notice>
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
  const googleOn = options.data?.google ?? false;

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate();
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to manage your clients' Business Profiles."
      footer={
        passwordOn ? (
          <>
            New to LocalPilot?{" "}
            <Link href="/register" className={authLink}>
              Create an account
            </Link>
          </>
        ) : undefined
      }
    >
      <Suspense>
        <GoogleError />
      </Suspense>

      {options.isPending && <Skeleton className="h-11" />}
      {options.isSuccess && (
        <div>
          <GoogleButton href={googleOn ? apiUrl("/auth/google/start") : undefined} describedBy="google-off" />
          {!googleOn && (
            <p id="google-off" className="mt-2 text-center text-xs text-muted">
              Google sign-in isn&apos;t set up for this workspace yet.{passwordOn && " Use your email and password below."}
            </p>
          )}
        </div>
      )}
      {options.isError && (
        <Notice tone="info" icon={Info}>
          Couldn&apos;t check sign-in options. Your password still works.
        </Notice>
      )}

      {passwordOn && (
        <>
          {options.isError ? <div className="h-5" /> : <OrDivider />}
          <form onSubmit={submit} className="space-y-5">
            <Field label="Email address">
              {(field) => <Input {...field} type="email" required autoComplete="email" autoFocus placeholder="you@agency.com" value={email} onChange={(event) => setEmail(event.target.value)} />}
            </Field>
            <Field
              label="Password"
              action={
                <Link href="/forgot-password" className="rounded text-xs font-semibold text-primary hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                  Forgot password?
                </Link>
              }
            >
              {(field) => <PasswordInput {...field} required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />}
            </Field>

            {unverified ? (
              resend.isSuccess ? (
                <Notice tone="good" icon={CheckCircle2} title="Link sent">
                  Check your inbox for a new verification link.
                </Notice>
              ) : (
                <Notice
                  tone="warn"
                  icon={MailWarning}
                  title="Please verify your email first"
                  action={
                    <Button type="button" variant="secondary" size="sm" loading={resend.isPending} onClick={() => resend.mutate()}>
                      Send a new link
                    </Button>
                  }
                >
                  {resend.error ? resend.error.message : "We sent you a link when you signed up."}
                </Notice>
              )
            ) : (
              <FormError error={login.error} />
            )}

            <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
              {login.isPending ? "Logging in" : "Log in"}
            </Button>
          </form>
        </>
      )}
    </AuthCard>
  );
}
