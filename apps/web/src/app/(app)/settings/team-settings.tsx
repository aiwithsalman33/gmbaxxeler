"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["members"] });
    queryClient.invalidateQueries({ queryKey: ["invites"] });
  };

  const invite = useMutation({
    mutationFn: () => api("/workspace/invites", { method: "POST", body: { email } }),
    onSuccess: () => {
      setEmail("");
      refresh();
    },
  });
  const removeMember = useMutation({ mutationFn: (id: string) => api(`/workspace/members/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const cancelInvite = useMutation({ mutationFn: (id: string) => api(`/workspace/invites/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const error = invite.error ?? removeMember.error ?? cancelInvite.error;

  function submit(event: FormEvent) {
    event.preventDefault();
    invite.mutate();
  }

  return (
    <Card>
      <CardTitle>Team</CardTitle>
      <p className="mt-1 mb-4 text-sm text-muted">Invited people choose a password and see the same clients.</p>
      {members.isPending && <Skeleton className="h-16" />}
      <ul className="divide-y divide-line">
        {members.data?.map((member) => (
          <li key={member.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{member.user.email}</span>
            <span className="text-xs text-muted capitalize">{member.role}</span>
            {member.userId !== me.data?.user.id && (
              <Button size="sm" variant="ghost" disabled={removeMember.isPending} onClick={() => removeMember.mutate(member.id)}>
                Remove
              </Button>
            )}
          </li>
        ))}
        {invites.data?.map((pending) => (
          <li key={pending.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-muted">{pending.email}</span>
            <span className="text-xs text-muted">Invited</span>
            <Button size="sm" variant="ghost" disabled={cancelInvite.isPending} onClick={() => cancelInvite.mutate(pending.id)}>
              Cancel
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
        <Input aria-label="Team member email" type="email" required placeholder="teammate@agency.com" className="min-w-52 flex-1" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Button type="submit" variant="secondary" disabled={invite.isPending}>
          {invite.isPending ? "Sending" : "Send invite"}
        </Button>
      </form>
      {invite.isSuccess && <p className="mt-2 text-sm text-good">Invite sent.</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error.message}
        </p>
      )}
    </Card>
  );
}
