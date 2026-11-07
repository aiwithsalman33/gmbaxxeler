"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiUrl } from "@/lib/api";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const invite = useQuery({ queryKey: ["invite", token], queryFn: () => api<{ agencyName: string }>(`/public/invites/${token}`) });

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        {invite.isPending && <Skeleton className="h-48" />}
        {invite.isError && <ErrorState error={invite.error} />}
        {invite.data && (
          <Card className="p-8 text-center">
            <h1 className="text-xl font-bold">Connect your Business Profile</h1>
            <p className="mt-2 mb-6 text-sm text-muted">{invite.data.agencyName} is asking for access to manage your Google Business Profile.</p>
            <Button asChild className="w-full">
              <a href={apiUrl(`/public/invites/${token}/start`)}>Continue with Google</a>
            </Button>
          </Card>
        )}
      </div>
    </main>
  );
}
