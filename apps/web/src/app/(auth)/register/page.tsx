"use client";

import { useMutation } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard, authLink, FormError } from "@/components/auth-card";
import { MIN_PASSWORD, PasswordInput, PasswordStrength } from "@/components/password-strength";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const register = useMutation({ mutationFn: () => api("/auth/register", { method: "POST", body: { email, password, ...(name ? { name } : {}) } }) });

  function submit(event: FormEvent) {
    event.preventDefault();
    register.mutate();
  }

  if (register.isSuccess) {
    return (
      <AuthCard
        icon={MailCheck}
        title="Check your email"
        subtitle={
          <>
            If <span className="font-medium text-ink [overflow-wrap:anywhere]">{email}</span> can register, a verification link is on its way. Open it to finish setting up your account.
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
      title="Create your account"
      subtitle="Start managing your clients' Business Profiles in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={authLink}>
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Your name" hint="Optional. Shown to your teammates.">
          {(field) => <Input {...field} autoComplete="name" autoFocus placeholder="Alex Rivera" value={name} onChange={(event) => setName(event.target.value)} />}
        </Field>
        <Field label="Email address">
          {(field) => <Input {...field} type="email" required autoComplete="email" placeholder="you@agency.com" value={email} onChange={(event) => setEmail(event.target.value)} />}
        </Field>
        <div>
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            aria-describedby="password-strength"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordStrength id="password-strength" password={password} />
        </div>
        <FormError error={register.error} />
        <Button type="submit" size="lg" className="w-full" loading={register.isPending}>
          {register.isPending ? "Creating account" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}
