"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, LinkIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { AuthCard, GoogleButton } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { api, apiUrl } from "@/lib/api";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const invite = useQuery({ queryKey: ["invite", token], queryFn: () => api<{ agencyName: string }>(`/public/invites/${token}`) });

  if (invite.isPending) {
    return (
      <AuthCard audience="client" icon={Building2} title="Opening your invite">
        <LoadingBlock label="Loading invite" className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-11" />
        </LoadingBlock>
      </AuthCard>
    );
  }
  if (invite.isError) {
    return (
      <AuthCard audience="client" icon={LinkIcon} tone="bad" title="This link isn't working" subtitle={
          <>
            {invite.error.message}
            <span className="mt-1 block">Ask your agency for a new link if this keeps happening.</span>
          </>
        }
      >
        <Button size="lg" variant="secondary" className="w-full" loading={invite.isFetching} onClick={() => invite.refetch()}>
          Try again
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      audience="client"
      icon={Building2}
      title="Connect your Business Profile"
      subtitle={
        <>
          <span className="font-semibold text-ink">{invite.data.agencyName}</span> is asking for access to manage your Google Business Profile.
        </>
      }
      footer="You'll sign in on Google's own page and choose what to share."
    >
      <GoogleButton href={apiUrl(`/public/invites/${token}/start`)} />
    </AuthCard>
  );
}
