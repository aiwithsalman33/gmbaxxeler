"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

export function AiSettings() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["openai"], queryFn: () => api<OpenAiSettings>("/settings/openai") });
  const usage = useQuery({ queryKey: ["openai-usage"], queryFn: () => api<Usage>("/settings/openai/usage") });
  const [apiKey, setApiKey] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [inputPrice, setInputPrice] = useState("");
  const [outputPrice, setOutputPrice] = useState("");
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
      queryClient.invalidateQueries({ queryKey: ["openai"] });
    },
  });
  const test = useMutation({ mutationFn: () => api<{ ok: boolean; models: string[]; error?: string }>("/settings/openai/test", { method: "POST" }) });
  const remove = useMutation({
    mutationFn: () => api("/settings/openai", { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["openai"] }),
  });
  const error = save.error ?? test.error ?? remove.error;

  return (
    <Card>
      <CardTitle>OpenAI</CardTitle>
      <p className="mt-1 mb-4 text-sm text-muted">Used to rename photos, write posts and draft review replies. The key is encrypted and only its last 4 characters are ever shown.</p>
      {settings.isPending && <Skeleton className="h-32" />}
      {settings.isError && <p className="text-sm text-bad">{settings.error.message}</p>}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="apiKey">API key</Label>
              <Input id="apiKey" type="password" autoComplete="off" placeholder={data.maskedKey ?? "sk-..."} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="visionModel">Vision model</Label>
              <Input id="visionModel" list="openai-models" value={visionModel} onChange={(event) => setVisionModel(event.target.value)} />
              <datalist id="openai-models">
                {test.data?.models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="inputPrice">Input price per 1M tokens (USD)</Label>
              <Input id="inputPrice" type="number" min={0} step="0.01" value={inputPrice} onChange={(event) => setInputPrice(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="outputPrice">Output price per 1M tokens (USD)</Label>
              <Input id="outputPrice" type="number" min={0} step="0.01" value={outputPrice} onChange={(event) => setOutputPrice(event.target.value)} />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">Costs are estimates based on these prices. Check them against OpenAI&apos;s pricing page.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
            <Button variant="secondary" disabled={test.isPending || !data.connected} onClick={() => test.mutate()}>
              Test key
            </Button>
            {data.connected && (
              <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
                Remove key
              </Button>
            )}
          </div>
          {test.data && (
            <p className={test.data.ok ? "mt-2 text-sm text-good" : "mt-2 text-sm text-bad"}>
              {test.data.ok ? `Key works. ${test.data.models.length} models are available.` : test.data.error}
            </p>
          )}
          {save.isSuccess && <p className="mt-2 text-sm text-good">Saved.</p>}
          {error && (
            <p role="alert" className="mt-2 text-sm text-bad">
              {error.message}
            </p>
          )}
          {(usage.data?.clients.length ?? 0) > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-sm font-medium">Estimated usage, last {usage.data?.days} days</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1 font-medium">Client</th>
                    <th className="py-1 text-right font-medium">AI calls</th>
                    <th className="py-1 text-right font-medium">Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.data?.clients.map((row) => (
                    <tr key={row.clientId} className="border-t border-line">
                      <td className="py-1.5">{row.name}</td>
                      <td className="py-1.5 text-right">{formatNumber(row.calls)}</td>
                      <td className="py-1.5 text-right">${row.estCost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
