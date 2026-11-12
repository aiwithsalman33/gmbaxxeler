"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Circle, Globe, Info, MapPin, MessageSquareQuote, RefreshCw, Search, type LucideIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TagInput } from "./tag-input";
import { useClients } from "@/components/client-switcher";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Notice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { ProgressRing } from "@/components/ui/widgets";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

const LISTS = {
  services: { label: "Services", placeholder: "Teeth cleaning, implants, braces", hint: "What the business offers. Press Enter or type a comma after each one." },
  targetAreas: { label: "Target areas", placeholder: "Adyar, Velachery, Chennai", hint: "Neighbourhoods and towns posts should mention." },
  usps: { label: "Selling points", placeholder: "Open Sundays, free parking", hint: "Reasons customers pick this business." },
  keywords: { label: "Keywords", placeholder: "dentist in adyar, dental implants chennai", hint: "Search phrases worked naturally into SEO posts." },
  competitors: { label: "Competitors", placeholder: "Bright Smile Dental", hint: "AI will never mention these by name." },
  dos: { label: "Do's", placeholder: "Mention the free first consultation", hint: "Things to always include or say." },
  donts: { label: "Don'ts", placeholder: "Never quote prices", hint: "Things AI must avoid." },
} as const;

type ListKey = keyof typeof LISTS;
const LIST_KEYS = Object.keys(LISTS) as ListKey[];

interface Profile extends Record<ListKey, string[]> {
  description: string | null;
  tone: string | null;
  strategy: string | null;
  ctaUrl: string | null;
  onboardedAt: string | null;
  gbpSnapshot: { title?: string; address?: string | null; phone?: string | null; website?: string | null; categories?: string[]; description?: string | null; services?: string[]; serviceAreas?: string[] };
}

interface Form extends Record<ListKey, string[]> {
  description: string;
  tone: string;
  strategy: string;
  ctaUrl: string;
}

const EMPTY: Form = { services: [], targetAreas: [], usps: [], keywords: [], competitors: [], dos: [], donts: [], description: "", tone: "", strategy: "", ctaUrl: "" };

function formFrom(p: Profile | null | undefined): Form {
  const g = p?.gbpSnapshot;
  const fallback: Partial<Record<ListKey, string[] | undefined>> = { services: g?.services, targetAreas: g?.serviceAreas };
  return {
    ...(Object.fromEntries(LIST_KEYS.map((key) => [key, p?.[key]?.length ? p[key] : (fallback[key] ?? [])])) as Record<ListKey, string[]>),
    description: p?.description ?? g?.description ?? "",
    tone: p?.tone ?? "",
    strategy: p?.strategy ?? "",
    ctaUrl: p?.ctaUrl ?? g?.website ?? "",
  };
}

const CHECKS: { key: keyof Form; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "services", label: "Services" },
  { key: "targetAreas", label: "Target areas" },
  { key: "usps", label: "Selling points" },
  { key: "tone", label: "Tone of voice" },
  { key: "keywords", label: "Keywords" },
  { key: "strategy", label: "Strategy" },
  { key: "ctaUrl", label: "Preferred link" },
  { key: "dos", label: "Do's" },
  { key: "donts", label: "Don'ts" },
];

const filled = (value: string | string[]) => (Array.isArray(value) ? value.length > 0 : value.trim().length > 0);

function urlError(value: string) {
  if (!value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? null : "Use a link that starts with https://";
  } catch {
    return "Enter a full link, like https://example.com";
  }
}

function listError(items: string[]) {
  if (items.length > 50) return "Keep this to 50 items or fewer";
  if (items.some((item) => item.length > 200)) return "Each item must be under 200 characters";
  return null;
}

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={cn("text-xs tabular-nums", value.length > max ? "font-semibold text-bad" : "text-subtle")}>{`${value.length} / ${max}`}</span>;
}

function Section({ icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} description={description} />
      <div className="grid gap-5">{children}</div>
    </Card>
  );
}

function KnowledgeSkeleton() {
  return (
    <LoadingBlock label="Loading knowledge base">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-[380px]" />
          <Skeleton className="h-[340px]" />
          <Skeleton className="h-[340px]" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-60" />
        </div>
      </div>
    </LoadingBlock>
  );
}

export default function KnowledgePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["profile", clientId], queryFn: () => api<{ name: string; profile: Profile | null }>(`/clients/${clientId}/profile`) });
  const { data: clients } = useClients();
  const connected = clients?.find((client) => client.id === clientId)?.status === "connected";
  const [form, setForm] = useState<Form>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const profile = query.data?.profile;
  const google = profile?.gbpSnapshot;
  const saved = useMemo(() => formFrom(query.data?.profile), [query.data]);

  useEffect(() => {
    if (query.data) setForm(formFrom(query.data.profile));
  }, [query.data]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const neverSaved = query.data !== undefined && !profile?.onboardedAt;

  const errors = {
    description: form.description.length > 3000 ? "Keep the description under 3,000 characters" : null,
    strategy: form.strategy.length > 3000 ? "Keep the strategy under 3,000 characters" : null,
    tone: form.tone.length > 500 ? "Keep the tone under 500 characters" : null,
    ctaUrl: urlError(form.ctaUrl),
    ...(Object.fromEntries(LIST_KEYS.map((key) => [key, listError(form[key])])) as Record<ListKey, string | null>),
  };
  const invalid = Object.values(errors).some(Boolean);
  const shown = (key: keyof typeof errors) => (submitted || key === "ctaUrl" ? errors[key] : form[key].length > 0 ? errors[key] : null);

  const done = CHECKS.filter((check) => filled(form[check.key]));
  const score = Math.round((done.length / CHECKS.length) * 100);

  const save = useMutation({
    mutationFn: () =>
      api(`/clients/${clientId}/profile`, {
        method: "PUT",
        body: {
          ...Object.fromEntries(LIST_KEYS.map((key) => [key, form[key]])),
          description: form.description.trim() || null,
          tone: form.tone.trim() || null,
          strategy: form.strategy.trim() || null,
          ctaUrl: form.ctaUrl.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Knowledge base saved", { description: "New posts and replies will use it." });
      queryClient.invalidateQueries({ queryKey: ["profile", clientId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", clientId] });
    },
    onError: (error) => toastError(error),
  });
  const resync = useMutation({
    mutationFn: () => api(`/clients/${clientId}/profile/resync`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Refreshed from Google");
      return queryClient.invalidateQueries({ queryKey: ["profile", clientId] });
    },
    onError: (error) => toastError(error),
  });

  function onSave() {
    setSubmitted(true);
    if (invalid) {
      toast.error("Fix the highlighted fields first");
      return;
    }
    save.mutate();
  }

  if (query.isPending) return <KnowledgeSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const list = (key: ListKey) => (
    <Field label={LISTS[key].label} hint={LISTS[key].hint} error={shown(key)}>
      {(props) => <TagInput {...props} value={form[key]} placeholder={LISTS[key].placeholder} onChange={(items) => set(key, items)} />}
    </Field>
  );

  return (
    <>
      <PageHeader
        title="Knowledge base"
        subtitle={`What AI knows about ${query.data.name}. It is used for every post and review reply.`}
        actions={
          <Button
            variant="secondary"
            loading={resync.isPending}
            disabled={!connected}
            title={connected ? undefined : "Available once this client is connected"}
            onClick={() => resync.mutate()}
          >
            {!resync.isPending && <RefreshCw aria-hidden />}
            Refresh from Google
          </Button>
        }
      />

      {neverSaved && (
        <Notice tone="info" icon={Info} title="Not saved yet" className="mb-6">
          {google?.title ? "We filled in what we could from Google. Check it, add the rest and save." : "Fill in what you know about this business and save. You can come back and add more any time."}
        </Notice>
      )}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        className="grid items-start gap-6 lg:grid-cols-3"
      >
        <div className="space-y-6 lg:col-span-2">
          <Section icon={Building2} title="About the business" description="The basics AI writes from.">
            <Field label="Business description" error={shown("description")} action={<Counter value={form.description} max={3000} />} hint="Two or three sentences about what the business does and who it serves.">
              {(props) => <Textarea {...props} rows={4} value={form.description} onChange={(event) => set("description", event.target.value)} />}
            </Field>
            {list("services")}
            {list("usps")}
          </Section>

          <Section icon={MapPin} title="Where and how to grow" description="Who the content is for and what it should achieve.">
            {list("targetAreas")}
            <Field label="Strategy" error={shown("strategy")} action={<Counter value={form.strategy} max={3000} />} hint="For example: more bookings for implants from nearby neighbourhoods.">
              {(props) => <Textarea {...props} rows={3} placeholder="What should this client's content achieve?" value={form.strategy} onChange={(event) => set("strategy", event.target.value)} />}
            </Field>
            <Field label="Preferred link" error={shown("ctaUrl")} hint="Where posts send people, like a booking page.">
              {(props) => <Input {...props} type="url" inputMode="url" placeholder="https://" value={form.ctaUrl} onChange={(event) => set("ctaUrl", event.target.value)} />}
            </Field>
          </Section>

          <Section icon={MessageSquareQuote} title="Voice and rules" description="How posts and replies should sound.">
            <Field label="Tone of voice" error={shown("tone")} action={<Counter value={form.tone} max={500} />}>
              {(props) => <Input {...props} placeholder="Warm, reassuring, plain English" value={form.tone} onChange={(event) => set("tone", event.target.value)} />}
            </Field>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {list("dos")}
              {list("donts")}
            </div>
          </Section>

          <Section icon={Search} title="Search" description="Help the profile show up for the right searches.">
            {list("keywords")}
            {list("competitors")}
          </Section>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Completeness" description="More detail means posts sound more like the business." className="mb-4" />
            <div className="flex items-center gap-5">
              <ProgressRing value={score} size={104} stroke={10} label="Knowledge base completeness" />
              <p className="text-sm text-muted">
                <span className="block text-base font-semibold text-ink">
                  {done.length} of {CHECKS.length} filled
                </span>
                {score === 100 ? "Everything is filled in." : "Fill in the open items to finish."}
              </p>
            </div>
            <ul className="mt-5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {CHECKS.map((check) => {
                const ok = filled(form[check.key]);
                return (
                  <li key={check.key} className={cn("flex items-center gap-2 text-sm", ok ? "text-muted" : "text-ink")}>
                    {ok ? <CheckCircle2 className="size-4 shrink-0 text-good" aria-label="Filled" /> : <Circle className="size-4 shrink-0 text-subtle" aria-label="Empty" />}
                    {check.label}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader icon={Globe} title="From Google" description={google?.title ? "Read-only. Edit these on the Google profile." : "Nothing synced yet."} className="mb-4" />
            {google?.title ? (
              <dl className="space-y-3 text-sm">
                {[
                  ["Name", google.title],
                  ["Categories", google.categories?.join(", ")],
                  ["Address", google.address],
                  ["Phone", google.phone],
                  ["Website", google.website],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-muted">{label}</dt>
                    <dd className={cn("mt-0.5 break-words", !value && "text-subtle")}>{value || "Not set"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted">{connected ? "Use Refresh from Google to pull the name, address and categories." : "These appear once the client gives the agency access on Google."}</p>
            )}
          </Card>
        </aside>

        <div className="sticky bottom-4 z-20 lg:col-span-3">
          <div className="flex items-center gap-2 rounded-card border border-line bg-surface/95 py-2.5 pr-2.5 pl-4 shadow-raised backdrop-blur-md sm:gap-3 sm:py-3 sm:pr-3 sm:pl-5">
            <p className="mr-auto flex min-w-0 items-center gap-2 text-sm" aria-live="polite">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dirty || neverSaved ? "bg-warn" : "bg-good")} />
              <span className="truncate">{dirty ? "Unsaved changes" : neverSaved ? "Not saved yet" : `Saved ${formatDate(profile?.onboardedAt)}`}</span>
            </p>
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setForm(saved);
                  setSubmitted(false);
                }}
              >
                Discard
              </Button>
            )}
            <Button type="submit" loading={save.isPending}>
              Save<span className="hidden sm:inline"> knowledge base</span>
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
