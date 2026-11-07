"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard, FormError } from "@/components/auth-card";
import { MIN_PASSWORD, PasswordStrength } from "@/components/password-strength";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

export default function TeamInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const invite = useQuery({
    queryKey: ["team-invite", token],
    queryFn: () => api<{ agencyName: string; email: string; needsPassword: boolean }>(`/public/team-invites/${token}`),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => api(`/public/team-invites/${token}/accept`, { method: "POST", body: invite.data?.needsPassword ? { password, ...(name ? { name } : {}) } : {} }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    accept.mutate();
  }

  if (invite.isPending) {
    return (
      <AuthCard title="Loading your invite">
        <Skeleton className="h-24" />
      </AuthCard>
    );
  }
  if (invite.isError) {
    return (
      <AuthCard title="This invite isn't valid" subtitle="It may have expired or already been used. Ask for a new one.">
        <Button asChild className="w-full" variant="secondary">
          <Link href="/login">Back to login</Link>
        </Button>
      </AuthCard>
    );
  }
  if (accept.isSuccess) {
    return (
      <AuthCard title="You're on the team" subtitle="Log in to get started.">
        <Button asChild className="w-full">
          <Link href="/login">Log in</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={`Join ${invite.data.agencyName}`} subtitle={invite.data.email}>
      <form onSubmit={submit} className="space-y-4">
        {invite.data.needsPassword && (
          <>
            <div>
              <Label htmlFor="name">Your name</Label>
              <Input id="name" autoComplete="name" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">Choose a password</Label>
              <Input id="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              <PasswordStrength password={password} />
            </div>
          </>
        )}
        <FormError error={accept.error} />
        <Button type="submit" className="w-full" disabled={accept.isPending}>
          {accept.isPending ? "Joining" : "Accept invite"}
        </Button>
      </form>
    </AuthCard>
  );
}
