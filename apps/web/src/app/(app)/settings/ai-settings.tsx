"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, KeyRound, Trash2, XCircle, Zap } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, Notice } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

interface OpenAiSettings {
  connected: boolean;
  maskedKey: string | null;
  visionModel: string;
  inputPricePerM: number;
  outputPricePerM: number;
}

interface Usage {
  days: number;
  clients: { clientId: string; name: string; calls: number; estCost: number }[];
}

function UsageCard() {
  const usage = useQuery({ queryKey: ["openai-usage"], queryFn: () => api<Usage>("/settings/openai/usage") });
  const rows = usage.data?.clients ?? [];
  const totalCalls = rows.reduce((sum, row) => sum + row.calls, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.estCost, 0);

  return (
    <Card>
      <CardHeader icon={BarChart3} title="Estimated usage" description={usage.data ? `AI calls per client over the last ${usage.data.days} days` : "AI calls per client"} />
      {usage.isPending && (
        <LoadingBlock label="Loading usage" className="space-y-2">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-11" />
          ))}
        </LoadingBlock>
      )}
      {usage.isError && <ErrorState bare error={usage.error} onRetry={() => usage.refetch()} />}
      {usage.data && rows.length === 0 && (
        <EmptyState bare icon={BarChart3} title="No AI usage yet" body="Once photos are renamed, posts written or replies drafted, each client's calls and estimated cost show up here." className="py-8" />
      )}
      {rows.length > 0 && (
        <Table className="min-w-[28rem]">
          <THead>
            <tr>
              <TH>Client</TH>
              <TH className="text-right">AI calls</TH>
              <TH className="text-right">Est. cost</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.clientId}>
                <TD className="font-medium">{row.name}</TD>
                <TD className="text-right tabular-nums">{formatNumber(row.calls)}</TD>
                <TD className="text-right tabular-nums">${row.estCost.toFixed(4)}</TD>
              </TR>
            ))}
            <tr className="bg-lavender/60 font-semibold">
              <TD>Total</TD>
              <TD className="text-right tabular-nums">{formatNumber(totalCalls)}</TD>
              <TD className="text-right tabular-nums">${totalCost.toFixed(4)}</TD>
            </tr>
          </TBody>
        </Table>
      )}
    </Card>
  );
}

export function AiSettings() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["openai"], queryFn: () => api<OpenAiSettings>("/settings/openai") });
  const [apiKey, setApiKey] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [inputPrice, setInputPrice] = useState("");
  const [outputPrice, setOutputPrice] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const data = settings.data;

  useEffect(() => {
    if (!data) return;
    setVisionModel(data.visionModel);
    setInputPrice(String(data.inputPricePerM));
    setOutputPrice(String(data.outputPricePerM));
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api("/settings/openai", {
        method: "PUT",
        body: { visionModel, inputPricePerM: Number(inputPrice), outputPricePerM: Number(outputPrice), ...(apiKey ? { apiKey } : {}) },
      }),
    onSuccess: () => {
      setApiKey("");
      toast.success("AI settings saved");
      queryClient.invalidateQueries({ queryKey: ["openai"] });
    },
    onError: (error) => toastError(error),
  });
  const test = useMutation({
    mutationFn: () => api<{ ok: boolean; models: string[]; error?: string }>("/settings/openai/test", { method: "POST" }),
    onError: (error) => toastError(error),
  });
  const remove = useMutation({
    mutationFn: () => api("/settings/openai", { method: "DELETE" }),
    onSuccess: () => {
      setConfirmRemove(false);
      test.reset();
      toast.success("OpenAI key removed");
      queryClient.invalidateQueries({ queryKey: ["openai"] });
    },
    onError: (error) => toastError(error),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          icon={KeyRound}
          title="OpenAI"
          description="Renames photos, writes posts and drafts review replies. The key is encrypted and only its last 4 characters are ever shown."
          actions={
            data &&
            (data.connected ? (
              <Badge tone="good" dot>
                Key saved
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                No key yet
              </Badge>
            ))
          }
        />
        {settings.isPending && (
          <LoadingBlock label="Loading AI settings" className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-[66px]" />
            ))}
          </LoadingBlock>
        )}
        {settings.isError && <ErrorState bare error={settings.error} onRetry={() => settings.refetch()} />}
        {data && (
          <form onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="API key" hint={data.connected ? "Leave blank to keep the saved key." : "Starts with sk-"}>
                {(props) => <Input {...props} type="password" autoComplete="off" placeholder={data.maskedKey ?? "sk-..."} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />}
              </Field>
              <Field label="Vision model" hint={test.data?.ok ? "Suggestions come from your key's model list." : "Test the key to see available models."}>
                {(props) => (
                  <>
                    <Input {...props} list="openai-models" value={visionModel} onChange={(event) => setVisionModel(event.target.value)} />
                    <datalist id="openai-models">
                      {test.data?.models.map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
              <Field label="Input price per 1M tokens (USD)">
                {(props) => <Input {...props} type="number" min={0} step="0.01" value={inputPrice} onChange={(event) => setInputPrice(event.target.value)} />}
              </Field>
              <Field label="Output price per 1M tokens (USD)">
                {(props) => <Input {...props} type="number" min={0} step="0.01" value={outputPrice} onChange={(event) => setOutputPrice(event.target.value)} />}
              </Field>
            </div>
            <p className="mt-3 text-xs text-muted">Costs are estimates based on these prices. Check them against OpenAI&apos;s pricing page.</p>

            {test.data && (
              <Notice tone={test.data.ok ? "good" : "bad"} icon={test.data.ok ? CheckCircle2 : XCircle} className="mt-4">
                {test.data.ok ? `Key works. ${test.data.models.length} models are available.` : test.data.error}
              </Notice>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
              <Button type="submit" loading={save.isPending}>
                Save
              </Button>
              <Button type="button" variant="secondary" loading={test.isPending} disabled={!data.connected} onClick={() => test.mutate()}>
                {!test.isPending && <Zap aria-hidden />}
                Test key
              </Button>
              {data.connected && (
                <Button type="button" variant="danger" className="sm:ml-auto" onClick={() => setConfirmRemove(true)}>
                  <Trash2 aria-hidden />
                  Remove key
                </Button>
              )}
            </div>
          </form>
        )}
      </Card>

      <UsageCard />

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove the OpenAI key?"
        description="Photo renaming, post writing and reply drafting stop until a new key is saved."
        confirmLabel="Remove key"
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
