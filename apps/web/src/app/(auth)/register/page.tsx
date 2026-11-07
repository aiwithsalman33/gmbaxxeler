"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard, FormError } from "@/components/auth-card";
import { MIN_PASSWORD, PasswordStrength } from "@/components/password-strength";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
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
      <AuthCard title="Check your email" subtitle={`If ${email} can register, a verification link is on its way.`}>
        <Button asChild className="w-full" variant="secondary">
          <Link href="/login">Back to login</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className="font-medium text-primary">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" autoComplete="name" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <PasswordStrength password={password} />
        </div>
        <FormError error={register.error} />
        <Button type="submit" className="w-full" disabled={register.isPending}>
          {register.isPending ? "Creating account" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}
