"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

const LISTS = [
  ["services", "Services", "Teeth cleaning, implants, braces"],
  ["targetAreas", "Target areas", "Adyar, Velachery, Chennai"],
  ["usps", "Selling points", "Open Sundays, free parking"],
  ["keywords", "Keywords", "dentist in adyar, dental implants chennai"],
  ["competitors", "Competitors", "AI won't mention these"],
  ["dos", "Do's", "Mention the free first consultation"],
  ["donts", "Don'ts", "Never quote prices"],
] as const;

type ListKey = (typeof LISTS)[number][0];

interface Profile extends Record<ListKey, string[]> {
  description: string | null;
  tone: string | null;
  strategy: string | null;
  ctaUrl: string | null;
  onboardedAt: string | null;
  gbpSnapshot: { title?: string; address?: string | null; phone?: string | null; website?: string | null; categories?: string[]; description?: string | null; services?: string[]; serviceAreas?: string[] };
}

const toList = (text: string) => text.split(",").map((item) => item.trim()).filter(Boolean);

export default function KnowledgePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["profile", clientId], queryFn: () => api<{ name: string; profile: Profile | null }>(`/clients/${clientId}/profile`) });
  const [lists, setLists] = useState<Record<ListKey, string>>({ services: "", targetAreas: "", usps: "", keywords: "", competitors: "", dos: "", donts: "" });
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState("");
  const [strategy, setStrategy] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const profile = query.data?.profile;
  const google = profile?.gbpSnapshot;

  useEffect(() => {
    if (!query.data) return;
    const p = query.data.profile;
    const g = p?.gbpSnapshot;
    const fallback: Partial<Record<ListKey, string[] | undefined>> = { services: g?.services, targetAreas: g?.serviceAreas };
    setLists(Object.fromEntries(LISTS.map(([key]) => [key, (p?.[key]?.length ? p[key] : (fallback[key] ?? [])).join(", ")])) as Record<ListKey, string>);
    setDescription(p?.description ?? g?.description ?? "");
    setTone(p?.tone ?? "");
    setStrategy(p?.strategy ?? "");
    setCtaUrl(p?.ctaUrl ?? g?.website ?? "");
  }, [query.data]);

  const save = useMutation({
    mutationFn: () =>
      api(`/clients/${clientId}/profile`, {
        method: "PUT",
        body: {
          ...Object.fromEntries(LISTS.map(([key]) => [key, toList(lists[key])])),
          description: description || null,
          tone: tone || null,
          strategy: strategy || null,
          ctaUrl: ctaUrl || null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", clientId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", clientId] });
    },
  });
  const resync = useMutation({
    mutationFn: () => api(`/clients/${clientId}/profile/resync`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile", clientId] }),
  });

  if (query.isPending) return <Skeleton className="h-96" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  return (
    <>
      <PageHeader
        title="Knowledge base"
        subtitle="AI uses this for every post and review reply for this client. Separate list items with commas."
        actions={
          <Button variant="secondary" disabled={resync.isPending} onClick={() => resync.mutate()}>
            <RefreshCw className={resync.isPending ? "size-4 animate-spin" : "size-4"} />
            Refresh from Google
          </Button>
        }
      />
      {google?.title ? (
        <Card className="mb-6">
          <CardTitle>From Google</CardTitle>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[
              ["Name", google.title],
              ["Categories", google.categories?.join(", ")],
              ["Address", google.address],
              ["Phone", google.phone],
              ["Website", google.website],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="break-words">{value || "Not set"}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}
      <Card>
        <div className="grid gap-4">
          <div>
            <Label htmlFor="description">Business description</Label>
            <Textarea id="description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {LISTS.map(([key, label, placeholder]) => (
              <div key={key}>
                <Label htmlFor={key}>{label}</Label>
                <Input id={key} placeholder={placeholder} value={lists[key]} onChange={(event) => setLists({ ...lists, [key]: event.target.value })} />
              </div>
            ))}
            <div>
              <Label htmlFor="tone">Tone of voice</Label>
              <Input id="tone" placeholder="Warm, reassuring, plain English" value={tone} onChange={(event) => setTone(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="ctaUrl">Preferred link</Label>
              <Input id="ctaUrl" type="url" placeholder="https://" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="strategy">Strategy</Label>
            <Textarea id="strategy" rows={3} placeholder="What should this client's content achieve?" value={strategy} onChange={(event) => setStrategy(event.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving" : "Save knowledge base"}
          </Button>
          {save.isSuccess && <p className="text-sm text-good">Saved.</p>}
          {(save.error ?? resync.error) && (
            <p role="alert" className="text-sm text-bad">
              {(save.error ?? resync.error)?.message}
            </p>
          )}
        </div>
      </Card>
    </>
  );
}
