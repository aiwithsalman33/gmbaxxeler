"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard, FormError } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const forgot = useMutation({ mutationFn: () => api("/auth/forgot-password", { method: "POST", body: { email } }) });

  function submit(event: FormEvent) {
    event.preventDefault();
    forgot.mutate();
  }

  if (forgot.isSuccess) {
    return (
      <AuthCard title="Check your email" subtitle={`If ${email} has an account, a reset link is on its way. It works for 1 hour.`}>
        <Button asChild className="w-full" variant="secondary">
          <Link href="/login">Back to login</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link."
      footer={
        <Link href="/login" className="font-medium text-primary">
          Back to login
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" required autoComplete="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <FormError error={forgot.error} />
        <Button type="submit" className="w-full" disabled={forgot.isPending}>
          {forgot.isPending ? "Sending" : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}
