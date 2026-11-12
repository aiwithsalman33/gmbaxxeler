"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FlaskConical, Trash2 } from "lucide-react";
import { Notice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";

interface DemoSummary {
  clients: { id: string; name: string }[];
}

/** Only renders when sample businesses exist, so a clean workspace never sees it. */
export function DemoDataSettings() {
  const queryClient = useQueryClient();
  const demo = useQuery({ queryKey: ["demo-data"], queryFn: () => api<DemoSummary>("/settings/demo-data") });
  const remove = useMutation({
    mutationFn: () => api<{ clients: number }>("/settings/demo-data", { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (error) => toastError(error),
  });

  const clients = demo.data?.clients ?? [];
  if (!clients.length && !remove.isSuccess) return null;

  if (remove.isSuccess) {
    return (
      <Notice tone="good" icon={CheckCircle2} title="Demo data removed">
        Removed {remove.data.clients} demo clients and everything linked to them.
      </Notice>
    );
  }

  return (
    <Card className="border-warn-line">
      <CardHeader
        icon={FlaskConical}
        title="Demo data"
        description={`${clients.length} sample businesses are in this workspace. They are not real Google data. Removing them deletes everything linked to them; real clients are not touched.`}
        actions={
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            {!remove.isPending && <Trash2 aria-hidden />}
            Remove demo data
          </Button>
        }
      />
      <ul className="flex flex-wrap gap-1.5" aria-label="Sample businesses">
        {clients.map((client) => (
          <li key={client.id} className="rounded-full bg-lavender px-2.5 py-1 text-xs text-ink-soft">
            {client.name}
          </li>
        ))}
      </ul>
    </Card>
  );
}
