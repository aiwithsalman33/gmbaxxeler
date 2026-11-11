"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { LinkIcon, PartyPopper, UsersRound } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard, FormError } from "@/components/auth-card";
import { MIN_PASSWORD, PasswordInput, PasswordStrength } from "@/components/password-strength";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
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
      <AuthCard icon={UsersRound} title="Loading your invite">
        <LoadingBlock label="Loading invite" className="space-y-5">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-11" />
        </LoadingBlock>
      </AuthCard>
    );
  }
  if (invite.isError) {
    return (
      <AuthCard icon={LinkIcon} tone="bad" title="This invite isn't valid" subtitle="It may have expired or already been used. Ask your teammate to send a new one.">
        <Button asChild size="lg" className="w-full" variant="secondary">
          <Link href="/login">Back to login</Link>
        </Button>
      </AuthCard>
    );
  }
  if (accept.isSuccess) {
    return (
      <AuthCard icon={PartyPopper} tone="good" title="You're on the team" subtitle={`Welcome to ${invite.data.agencyName}. Log in to get started.`}>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Log in</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      icon={UsersRound}
      title={`Join ${invite.data.agencyName}`}
      subtitle={
        <>
          You&apos;ve been invited as <span className="font-medium text-ink [overflow-wrap:anywhere]">{invite.data.email}</span>
          {invite.data.needsPassword ? ". Set up your login to accept." : "."}
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        {invite.data.needsPassword && (
          <>
            <Field label="Your name" hint="Optional. Shown to your teammates.">
              {(field) => <Input {...field} autoComplete="name" autoFocus value={name} onChange={(event) => setName(event.target.value)} />}
            </Field>
            <div>
              <Label htmlFor="password">Choose a password</Label>
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
          </>
        )}
        <FormError error={accept.error} />
        <Button type="submit" size="lg" className="w-full" loading={accept.isPending}>
          {accept.isPending ? "Joining" : "Accept invite"}
        </Button>
      </form>
    </AuthCard>
  );
}
