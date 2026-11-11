"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard, authLink, FormError } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const forgot = useMutation({ mutationFn: () => api("/auth/forgot-password", { method: "POST", body: { email } }) });

  function submit(event: FormEvent) {
    event.preventDefault();
    forgot.mutate();
  }

  if (forgot.isSuccess) {
    return (
      <AuthCard
        icon={MailCheck}
        title="Check your email"
        subtitle={
          <>
            If <span className="font-medium text-ink [overflow-wrap:anywhere]">{email}</span> has an account, a reset link is on its way. It works for 1 hour.
          </>
        }
        footer={
          <>
            Nothing yet? Check your spam folder or{" "}
            <button type="button" className={cn(authLink, "cursor-pointer")} onClick={() => forgot.reset()}>
              try another email
            </button>
            .
          </>
        }
      >
        <Button asChild size="lg" className="w-full" variant="secondary">
          <Link href="/login">Back to login</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={KeyRound}
      title="Forgot your password?"
      subtitle="Enter the email you log in with and we'll send you a link to choose a new one."
      footer={
        <Link href="/login" className={cn(authLink, "inline-flex items-center gap-1.5")}>
          <ArrowLeft className="size-4" aria-hidden />
          Back to login
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-5 text-left">
        <Field label="Email address">
          {(field) => <Input {...field} type="email" required autoComplete="email" autoFocus placeholder="you@agency.com" value={email} onChange={(event) => setEmail(event.target.value)} />}
        </Field>
        <FormError error={forgot.error} />
        <Button type="submit" size="lg" className="w-full" loading={forgot.isPending}>
          {forgot.isPending ? "Sending" : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}
