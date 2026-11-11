"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Mail, Send, Webhook } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { toast, toastError } from "@/components/ui/toast";
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
    onSuccess: () => {
      toast.success("Alert settings saved");
      queryClient.invalidateQueries({ queryKey: ["notification-settings"] });
    },
    onError: (error) => toastError(error),
  });
  const test = useMutation({
    mutationFn: () => api("/settings/notifications/test", { method: "POST" }),
    onSuccess: () => toast.success("Test alert sent"),
    onError: (error) => toastError(error),
  });
  const testEmail = useMutation({
    mutationFn: () => api<{ to: string }>("/settings/mail/test", { method: "POST" }),
    onSuccess: ({ to }) => toast.success(`Test email sent to ${to}`),
    onError: (error) => toastError(error),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  if (query.isPending) {
    return (
      <LoadingBlock label="Loading alert settings" className="space-y-6">
        <Skeleton className="h-[220px] rounded-card" />
        <Skeleton className="h-[260px] rounded-card" />
      </LoadingBlock>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader
          icon={Mail}
          title="Email alerts"
          description="Urgent alerts, such as bad reviews and failed uploads, go here as well as to the bell."
          actions={
            <Button type="button" variant="secondary" size="sm" loading={testEmail.isPending} onClick={() => testEmail.mutate()}>
              {!testEmail.isPending && <Send aria-hidden />}
              Send test email
            </Button>
          }
        />
        <Field label="Email addresses" hint="Separate several addresses with commas.">
          {(props) => <Input {...props} placeholder="you@agency.com, team@agency.com" value={emails} onChange={(event) => setEmails(event.target.value)} />}
        </Field>
      </Card>

      <Card>
        <CardHeader
          icon={Webhook}
          title="WhatsApp or Telegram"
          description="Send the same alerts to a chat through a webhook."
          actions={
            <Button type="button" variant="secondary" size="sm" loading={test.isPending} onClick={() => test.mutate()}>
              {!test.isPending && <BellRing aria-hidden />}
              Send test alert
            </Button>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Webhook type">
            {(props) => (
              <Select {...props} value={webhookKind} onChange={(event) => setWebhookKind(event.target.value)}>
                <option value="generic">Generic webhook</option>
                <option value="whatsapp">WhatsApp webhook</option>
                <option value="telegram">Telegram bot</option>
              </Select>
            )}
          </Field>
          <Field label="Webhook URL">{(props) => <Input {...props} type="url" placeholder="https://" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} />}</Field>
          {webhookKind === "telegram" && <Field label="Telegram chat ID">{(props) => <Input {...props} value={webhookChatId} onChange={(event) => setWebhookChatId(event.target.value)} />}</Field>}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={save.isPending}>
          Save alerts
        </Button>
      </div>
    </form>
  );
}
