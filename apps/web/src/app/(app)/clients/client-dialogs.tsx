"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, Link2, Mail, MessageCircle, Smartphone } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { LocationChecklist } from "@/components/location-checklist";
import { Notice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { Client, GoogleStatus, Guide } from "@/lib/types";

const EMPTY = { businessName: "", contactPhone: "", contactEmail: "", address: "", notes: "" };

export function AddClientDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (client: Client) => void }) {
  const [form, setForm] = useState(EMPTY);
  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  const create = useMutation({
    mutationFn: () => {
      const entries = Object.entries(form).map(([key, value]) => [key, value.trim().replace(key === "contactPhone" ? /\s/g : "", "")]);
      return api<{ client: Client }>("/clients", { method: "POST", body: Object.fromEntries(entries.filter(([, value]) => value)) });
    },
    onSuccess: ({ client }) => {
      setForm(EMPTY);
      toast.success(`${client.name} added`, { description: "Checking Google to connect it." });
      onCreated(client);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add client"
      description="Enter the business name with its mobile number, Gmail, or both. We then check your Google accounts and connect it automatically, or help you request Manager access."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-client-form" loading={create.isPending}>
            Add and connect
          </Button>
        </>
      }
    >
      <form id="add-client-form" onSubmit={submit} className="space-y-4">
        <Field label="Business name">{(props) => <Input {...props} name="businessName" required minLength={2} autoFocus value={form.businessName} onChange={set("businessName")} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client mobile" hint="With country code">
            {(props) => <Input {...props} type="tel" placeholder="+919876543210" value={form.contactPhone} onChange={set("contactPhone")} />}
          </Field>
          <Field label="Gmail" hint="Owner's, or one with Manager access">
            {(props) => <Input {...props} type="email" placeholder="owner@gmail.com" value={form.contactEmail} onChange={set("contactEmail")} />}
          </Field>
        </div>
        <p className="text-xs text-muted">
          The mobile number matches the phone on the Business Profile. If the Gmail already has Manager access, you can sign in with it on the next step to connect at once.
        </p>
        <Field label="Business address" hint="Optional. Helps match a Manager invitation, which carries no phone number.">
          {(props) => <Input {...props} value={form.address} onChange={set("address")} />}
        </Field>
        <Field label="Notes">{(props) => <Textarea {...props} rows={2} className="min-h-16" value={form.notes} onChange={set("notes")} />}</Field>
        {create.isError && <Notice tone="bad">{create.error.message}</Notice>}
      </form>
    </Dialog>
  );
}

export function ImportDialog({ open, onOpenChange, connectionId }: { open: boolean; onOpenChange: (open: boolean) => void; connectionId: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Import from Google" description="Pick the business profiles your agency account already manages. Each one becomes a client.">
      <LocationChecklist bare connectionId={connectionId} />
    </Dialog>
  );
}

export function GuideDialog({ client, onClose, onSent }: { client: Client | null; onClose: () => void; onSent: () => void }) {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const clientId = client?.id;

  useEffect(() => {
    setCopied(false);
    setLinkCopied(false);
    setInviteUrl(null);
  }, [clientId]);

  const googleStatus = useQuery({ queryKey: ["google-status"], queryFn: () => api<GoogleStatus>("/settings/google/status") });
  const guide = useQuery({
    queryKey: ["guide", clientId],
    queryFn: () => api<Guide>(`/clients/${clientId}/guide`),
    enabled: Boolean(clientId),
  });
  const send = useMutation({
    mutationFn: (channel: string) => api(`/clients/${clientId}/guide/send`, { method: "POST", body: { channel } }),
    onSuccess: (_, channel) => {
      if (channel !== "copy") toast.success("Guide sent by SMS");
      onSent();
    },
    onError: (error) => toastError(error),
  });
  const sendEmail = useMutation({
    mutationFn: () => api(`/clients/${clientId}/invite-email`, { method: "POST" }),
    onSuccess: () => {
      toast.success(`Invite sent to ${client?.contactEmail}`);
      onSent();
    },
    onError: (error) => toastError(error),
  });
  const createInvite = useMutation({
    mutationFn: () => api<{ url: string }>("/invites", { method: "POST", body: { clientId } }),
    onSuccess: ({ url }) => setInviteUrl(url),
    onError: (error) => toastError(error),
  });

  async function copy() {
    if (!guide.data) return;
    await navigator.clipboard.writeText(guide.data.text);
    setCopied(true);
    toast.success("Message copied");
    send.mutate("copy");
  }

  return (
    <Dialog
      open={client !== null}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={`Guide for ${client?.name ?? "client"}`}
      description="Send this so the client can add your agency as Manager on their Business Profile."
    >
      {guide.isPending && (
        <LoadingBlock label="Loading guide" className="space-y-3">
          <Skeleton className="h-56" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-32" />
          </div>
        </LoadingBlock>
      )}
      {guide.isError && <Notice tone="bad">{guide.error.message}</Notice>}
      {guide.data && (
        <>
          <pre className="max-h-64 overflow-y-auto rounded-xl border border-line bg-lavender p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink-soft">{guide.data.text}</pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={copy}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy message"}
            </Button>
            {guide.data.whatsappUrl && (
              <Button asChild size="sm" variant="secondary" onClick={() => send.mutate("copy")}>
                <a href={guide.data.whatsappUrl} target="_blank" rel="noreferrer">
                  <MessageCircle aria-hidden />
                  Open WhatsApp
                </a>
              </Button>
            )}
            {client?.contactPhone && guide.data.channels.includes("sms") && (
              <Button size="sm" variant="secondary" loading={send.isPending && send.variables === "sms"} onClick={() => send.mutate("sms")}>
                {!(send.isPending && send.variables === "sms") && <Smartphone aria-hidden />}
                Send SMS
              </Button>
            )}
            {client?.contactEmail && (
              <Button size="sm" variant="secondary" loading={sendEmail.isPending} onClick={() => sendEmail.mutate()}>
                {!sendEmail.isPending && <Mail aria-hidden />}
                {sendEmail.isPending ? "Sending" : "Send invite by email"}
              </Button>
            )}
          </div>

          {googleStatus.data?.clientOauthLinks && (
            <div className="mt-6 rounded-xl border border-line p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Link2 className="size-4 text-primary" aria-hidden />
                Can&apos;t add a manager?
              </p>
              <p className="mt-1 text-sm text-muted">Send a sign-in link instead. The client connects with their own Google account.</p>
              {inviteUrl ? (
                <div className="mt-3 flex gap-2">
                  <Input readOnly aria-label="Invite link" value={inviteUrl} onFocus={(event) => event.target.select()} />
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="Copy invite link"
                    onClick={async () => {
                      await navigator.clipboard.writeText(inviteUrl);
                      setLinkCopied(true);
                    }}
                  >
                    {linkCopied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  </Button>
                </div>
              ) : (
                <Button className="mt-3" size="sm" variant="secondary" loading={createInvite.isPending} onClick={() => createInvite.mutate()}>
                  Create sign-in link
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
