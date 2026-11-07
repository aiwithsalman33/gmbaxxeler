"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

interface Settings {
  emails: string[];
  webhookUrl: string | null;
  webhookKind: string;
  webhookChatId: string | null;
}

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["notification-settings"], queryFn: () => api<Settings>("/settings/notifications") });
  const [emails, setEmails] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookKind, setWebhookKind] = useState("generic");
  const [webhookChatId, setWebhookChatId] = useState("");
  const data = query.data;

  useEffect(() => {
    if (!data) return;
    setEmails(data.emails.join(", "));
    setWebhookUrl(data.webhookUrl ?? "");
    setWebhookKind(data.webhookKind);
    setWebhookChatId(data.webhookChatId ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api("/settings/notifications", {
        method: "PUT",
        body: {
          emails: emails.split(",").map((email) => email.trim()).filter(Boolean),
          webhookUrl: webhookUrl || null,
          webhookKind,
          webhookChatId: webhookChatId || null,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-settings"] }),
  });
  const test = useMutation({ mutationFn: () => api("/settings/notifications/test", { method: "POST" }) });
  const testEmail = useMutation({ mutationFn: () => api<{ to: string }>("/settings/mail/test", { method: "POST" }) });
  const error = save.error ?? test.error ?? testEmail.error;

  return (
    <Card>
      <CardTitle>Alerts</CardTitle>
      <p className="mt-1 mb-4 text-sm text-muted">Urgent alerts, such as bad reviews and failed uploads, go here as well as to the bell.</p>
      {query.isPending ? (
        <Skeleton className="h-24" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="alertEmails">Email addresses</Label>
            <Input id="alertEmails" placeholder="you@agency.com, team@agency.com" value={emails} onChange={(event) => setEmails(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="webhookKind">WhatsApp or Telegram webhook</Label>
            <select id="webhookKind" className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm" value={webhookKind} onChange={(event) => setWebhookKind(event.target.value)}>
              <option value="generic">Generic webhook</option>
              <option value="whatsapp">WhatsApp webhook</option>
              <option value="telegram">Telegram bot</option>
            </select>
          </div>
          <div>
            <Label htmlFor="webhookUrl">Webhook URL</Label>
            <Input id="webhookUrl" type="url" placeholder="https://" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} />
          </div>
          {webhookKind === "telegram" && (
            <div>
              <Label htmlFor="chatId">Telegram chat ID</Label>
              <Input id="chatId" value={webhookChatId} onChange={(event) => setWebhookChatId(event.target.value)} />
            </div>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          Save alerts
        </Button>
        <Button variant="secondary" disabled={test.isPending} onClick={() => test.mutate()}>
          Send test alert
        </Button>
        <Button variant="secondary" disabled={testEmail.isPending} onClick={() => testEmail.mutate()}>
          Send test email
        </Button>
        {save.isSuccess && <p className="text-sm text-good">Saved.</p>}
        {test.isSuccess && <p className="text-sm text-good">Test alert sent.</p>}
        {testEmail.isSuccess && <p className="text-sm text-good">Test email sent to {testEmail.data.to}.</p>}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error.message}
        </p>
      )}
    </Card>
  );
}
