"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Client, Guide } from "@/lib/types";

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
      onCreated(client);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add client" description="Enter a mobile number, a Gmail address, or both.">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="businessName">Business name</Label>
          <Input id="businessName" required minLength={2} value={form.businessName} onChange={set("businessName")} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="contactPhone">Client mobile</Label>
            <Input id="contactPhone" type="tel" placeholder="+919876543210" value={form.contactPhone} onChange={set("contactPhone")} />
          </div>
          <div>
            <Label htmlFor="contactEmail">Client Gmail</Label>
            <Input id="contactEmail" type="email" value={form.contactEmail} onChange={set("contactEmail")} />
          </div>
        </div>
        <div>
          <Label htmlFor="address">Business address (optional)</Label>
          <Input id="address" value={form.address} onChange={set("address")} />
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={2} value={form.notes} onChange={set("notes")} />
        </div>
        {create.isError && (
          <p role="alert" className="text-sm text-bad">
            {create.error.message}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={create.isPending}>
          Add client
        </Button>
      </form>
    </Dialog>
  );
}

export function GuideDialog({ client, onClose, onSent }: { client: Client | null; onClose: () => void; onSent: () => void }) {
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const clientId = client?.id;

  useEffect(() => {
    setCopied(false);
    setInviteUrl(null);
  }, [clientId]);

  const guide = useQuery({
    queryKey: ["guide", clientId],
    queryFn: () => api<Guide>(`/clients/${clientId}/guide`),
    enabled: Boolean(clientId),
  });
  const send = useMutation({
    mutationFn: (channel: string) => api(`/clients/${clientId}/guide/send`, { method: "POST", body: { channel } }),
    onSuccess: onSent,
  });
  const sendEmail = useMutation({
    mutationFn: () => api(`/clients/${clientId}/invite-email`, { method: "POST" }),
    onSuccess: onSent,
  });
  const createInvite = useMutation({
    mutationFn: () => api<{ url: string }>("/invites", { method: "POST", body: { clientId } }),
    onSuccess: ({ url }) => setInviteUrl(url),
  });

  async function copy() {
    if (!guide.data) return;
    await navigator.clipboard.writeText(guide.data.text);
    setCopied(true);
    send.mutate("copy");
  }

  return (
    <Dialog open={client !== null} onOpenChange={(open) => !open && onClose()} title={`Guide for ${client?.name ?? "client"}`} description="Send this so the client can add your agency as Manager.">
      {guide.isPending && <Skeleton className="h-48" />}
      {guide.isError && <p className="text-sm text-bad">{guide.error.message}</p>}
      {guide.data && (
        <>
          <pre className="max-h-64 overflow-y-auto rounded-xl bg-lavender p-3 font-sans text-sm whitespace-pre-wrap">{guide.data.text}</pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={copy}>
              {copied ? "Copied" : "Copy message"}
            </Button>
            {guide.data.whatsappUrl && (
              <Button asChild size="sm" variant="secondary" onClick={() => send.mutate("copy")}>
                <a href={guide.data.whatsappUrl} target="_blank" rel="noreferrer">
                  Open WhatsApp
                </a>
              </Button>
            )}
            {client?.contactPhone && guide.data.channels.includes("sms") && (
              <Button size="sm" variant="secondary" disabled={send.isPending} onClick={() => send.mutate("sms")}>
                Send SMS
              </Button>
            )}
            {client?.contactEmail && (
              <Button size="sm" disabled={sendEmail.isPending} onClick={() => sendEmail.mutate()}>
                {sendEmail.isPending ? "Sending" : "Send invite by email"}
              </Button>
            )}
          </div>
          {send.isSuccess && send.variables !== "copy" && <p className="mt-2 text-sm text-good">Guide sent.</p>}
          {sendEmail.isSuccess && <p className="mt-2 text-sm text-good">Invite sent to {client?.contactEmail}.</p>}
          {sendEmail.isError && <p className="mt-2 text-sm text-bad">{sendEmail.error.message}</p>}
          {send.isError && <p className="mt-2 text-sm text-bad">{send.error.message}</p>}

          <div className="mt-5 border-t border-line pt-4">
            <p className="text-sm font-medium">Can&apos;t add a manager?</p>
            <p className="mt-1 text-xs text-muted">Send a sign-in link instead. The client connects with their own Google account.</p>
            {inviteUrl ? (
              <Input readOnly aria-label="Invite link" className="mt-2" value={inviteUrl} onFocus={(event) => event.target.select()} />
            ) : (
              <Button className="mt-2" size="sm" variant="secondary" disabled={createInvite.isPending} onClick={() => createInvite.mutate()}>
                Create sign-in link
              </Button>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
