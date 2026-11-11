"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, UserPlus, Users, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/widgets";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";

interface Member {
  id: string;
  role: string;
  userId: string;
  user: { email: string; name: string | null };
}

interface Invite {
  id: string;
  email: string;
}

export function TeamSettings() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });
  const members = useQuery({ queryKey: ["members"], queryFn: () => api<Member[]>("/workspace/members") });
  const invites = useQuery({ queryKey: ["invites"], queryFn: () => api<Invite[]>("/workspace/invites") });
  const [email, setEmail] = useState("");
  const [removing, setRemoving] = useState<Member | null>(null);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["members"] });
    queryClient.invalidateQueries({ queryKey: ["invites"] });
  };

  const invite = useMutation({
    mutationFn: () => api("/workspace/invites", { method: "POST", body: { email } }),
    onSuccess: () => {
      toast.success(`Invite sent to ${email}`);
      setEmail("");
      refresh();
    },
    onError: (error) => toastError(error),
  });
  const removeMember = useMutation({
    mutationFn: (id: string) => api(`/workspace/members/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Team member removed");
      setRemoving(null);
      refresh();
    },
    onError: (error) => toastError(error),
  });
  const cancelInvite = useMutation({
    mutationFn: (id: string) => api(`/workspace/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Invite cancelled");
      refresh();
    },
    onError: (error) => toastError(error),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    invite.mutate();
  }

  const pendingInvites = invites.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={UserPlus} title="Invite a teammate" description="Invited people choose a password and see the same clients as you." />
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="team-invite-email">Email address</Label>
            <Input id="team-invite-email" type="email" required placeholder="teammate@agency.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <Button type="submit" loading={invite.isPending}>
            {!invite.isPending && <Mail aria-hidden />}
            {invite.isPending ? "Sending" : "Send invite"}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader
          icon={Users}
          title="Team"
          description={members.data ? `${members.data.length} ${members.data.length === 1 ? "member" : "members"}${pendingInvites.length ? `, ${pendingInvites.length} invited` : ""}` : "People with access to this workspace"}
        />
        {members.isPending && (
          <LoadingBlock label="Loading team" className="space-y-2">
            {[0, 1].map((n) => (
              <Skeleton key={n} className="h-14" />
            ))}
          </LoadingBlock>
        )}
        {members.isError && <ErrorState bare error={members.error} onRetry={() => members.refetch()} />}
        {members.data && (
          <ul className="divide-y divide-line">
            {members.data.map((member) => {
              const self = member.userId === me.data?.user.id;
              return (
                <li key={member.id} className="flex items-center gap-3 py-3 first:pt-0">
                  <Avatar name={member.user.name ?? member.user.email} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.user.name ?? member.user.email}
                      {self && <span className="font-normal text-muted"> (you)</span>}
                    </p>
                    {member.user.name && <p className="truncate text-xs text-muted">{member.user.email}</p>}
                  </div>
                  <Badge tone={member.role === "owner" ? "primary" : "neutral"} className="capitalize">
                    {member.role}
                  </Badge>
                  {!self && (
                    <Button size="sm" variant="ghost" className="text-bad hover:bg-bad-soft hover:text-bad" onClick={() => setRemoving(member)}>
                      Remove
                    </Button>
                  )}
                </li>
              );
            })}
            {pendingInvites.map((pending) => (
              <li key={pending.id} className="flex items-center gap-3 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-subtle">
                  <Mail className="size-4" aria-hidden />
                </span>
                <p className="min-w-0 flex-1 truncate text-sm text-muted">{pending.email}</p>
                <Badge tone="warn">Invited</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Cancel invite for ${pending.email}`}
                  loading={cancelInvite.isPending && cancelInvite.variables === pending.id}
                  onClick={() => cancelInvite.mutate(pending.id)}
                >
                  {!(cancelInvite.isPending && cancelInvite.variables === pending.id) && <X aria-hidden />}
                  <span className="hidden sm:inline">Cancel</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this team member?"
        description={`${removing?.user.email ?? "They"} will be signed out and lose access to this workspace.`}
        confirmLabel="Remove"
        danger
        loading={removeMember.isPending}
        onConfirm={() => removing && removeMember.mutate(removing.id)}
      />
    </div>
  );
}
