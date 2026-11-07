"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, ImageIcon, Tag, Trash2, UploadCloud } from "lucide-react";
import { useParams } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { FolderKind, LibraryImage } from "@/lib/types";
import { cn, formatBytes, formatDate } from "@/lib/utils";

const FOLDERS: { kind: FolderKind; label: string }[] = [
  { kind: "photos", label: "Photos" },
  { kind: "seo_images", label: "SEO Post Images" },
];

const MAX_BATCH_BYTES = 40 * 1024 * 1024;

/** The proxy accepts 50 MB per request, so a large drop goes up in several. */
function uploadBatches(files: File[]): File[][] {
  const batches: File[][] = [[]];
  let size = 0;
  for (const file of files) {
    if (size + file.size > MAX_BATCH_BYTES && batches.at(-1)!.length) {
      batches.push([]);
      size = 0;
    }
    batches.at(-1)!.push(file);
    size += file.size;
  }
  return batches;
}

interface UploadResult {
  name: string;
  ok: boolean;
  error?: string;
}

export default function LibraryPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState<FolderKind>("photos");
  const [dragging, setDragging] = useState(false);
  const [failures, setFailures] = useState<UploadResult[]>([]);
  const [tagging, setTagging] = useState<LibraryImage | null>(null);
  const [tags, setTags] = useState("");
  const base = `/clients/${clientId}/library/images`;
  const other = FOLDERS.find((item) => item.kind !== folder)!;

  const query = useQuery({
    queryKey: ["library", clientId, folder],
    queryFn: () => api<{ images: LibraryImage[] }>(`${base}?folder=${folder}`),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["library", clientId] });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const results: UploadResult[] = [];
      for (const batch of uploadBatches(files)) {
        const form = new FormData();
        batch.forEach((file) => form.append("files", file));
        results.push(...(await api<{ results: UploadResult[] }>(`${base}?folder=${folder}`, { method: "POST", form })).results);
      }
      return { results };
    },
    onSuccess: ({ results }) => setFailures(results.filter((result) => !result.ok)),
    onError: () => setFailures([]),
    onSettled: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`${base}/${id}`, { method: "DELETE" }), onSuccess: invalidate });
  const move = useMutation({
    mutationFn: (id: string) => api(`${base}/${id}`, { method: "PATCH", body: { folder: other.kind } }),
    onSuccess: invalidate,
  });
  const saveTags = useMutation({
    mutationFn: () =>
      api(`${base}/${tagging!.id}`, {
        method: "PATCH",
        body: { tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) },
      }),
    onSuccess: () => {
      setTagging(null);
      invalidate();
    },
  });

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) upload.mutate([...event.dataTransfer.files]);
  }

  return (
    <>
      <PageHeader title="Library" subtitle="JPG or PNG, 10 KB to 5 MB, at least 250x250" />
      <div role="tablist" className="mb-4 inline-flex rounded-xl border border-line bg-white p-1">
        {FOLDERS.map(({ kind, label }) => (
          <button
            key={kind}
            role="tab"
            aria-selected={folder === kind}
            onClick={() => {
              setFolder(kind);
              setFailures([]);
            }}
            className={cn("cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium", folder === kind ? "bg-primary text-white" : "text-muted hover:bg-lavender")}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn("mb-6 flex flex-col items-center gap-2 rounded-card border-2 border-dashed bg-white p-8 text-center transition-colors", dragging ? "border-primary bg-primary-soft" : "border-line")}
      >
        <UploadCloud className="size-7 text-primary" />
        <p className="text-sm font-medium">{upload.isPending ? "Uploading" : "Drag images here"}</p>
        <Button size="sm" variant="secondary" disabled={upload.isPending} onClick={() => input.current?.click()}>
          Choose files
        </Button>
        <input
          ref={input}
          type="file"
          aria-label="Upload images"
          accept="image/jpeg,image/png"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files?.length) upload.mutate([...event.target.files]);
            event.target.value = "";
          }}
        />
      </div>

      {upload.isError && (
        <p role="alert" className="mb-4 text-sm text-bad">
          {upload.error.message}
        </p>
      )}
      {failures.length > 0 && (
        <Card className="mb-6 border-red-200 p-4">
          <p className="mb-2 text-sm font-medium text-bad">{failures.length} files were not uploaded</p>
          <ul className="space-y-1 text-sm text-muted">
            {failures.map((failure) => (
              <li key={failure.name}>
                {failure.name}: {failure.error}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {query.isPending && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} className="aspect-square" />
          ))}
        </div>
      )}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data?.images.length === 0 && <EmptyState icon={ImageIcon} title="No images here yet" body="Upload images and the scheduler will rotate through them." />}
      {query.data && query.data.images.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {query.data.images.map((image) => (
            <li key={image.id} className="overflow-hidden rounded-card border border-line bg-white shadow-card">
              <img src={image.publicUrl} alt={image.originalName} loading="lazy" className="aspect-square w-full object-cover" />
              <div className="space-y-1 p-3">
                <p className="truncate text-sm font-medium" title={image.originalName}>
                  {image.originalName}
                </p>
                <p className="text-xs text-muted">
                  {image.width}x{image.height}, {formatBytes(image.bytes)}
                </p>
                <p className="text-xs text-muted">
                  {image.usageCount === 0 ? "Not used yet" : `Used ${image.usageCount} times, last ${formatDate(image.lastUsedAt)}`}
                </p>
                {image.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {image.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] text-primary-dark">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-1 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Edit tags for ${image.originalName}`}
                    onClick={() => {
                      setTagging(image);
                      setTags(image.tags.join(", "));
                    }}
                  >
                    <Tag className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Move ${image.originalName} to ${other.label}`} title={`Move to ${other.label}`} onClick={() => move.mutate(image.id)}>
                    <ArrowRightLeft className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${image.originalName}`}
                    onClick={() => {
                      if (window.confirm(`Delete ${image.originalName}?`)) remove.mutate(image.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={tagging !== null} onOpenChange={(open) => !open && setTagging(null)} title="Edit tags" description="Separate tags with commas">
        <Input value={tags} aria-label="Tags" onChange={(event) => setTags(event.target.value)} />
        <Button className="mt-4 w-full" disabled={saveTags.isPending} onClick={() => saveTags.mutate()}>
          Save tags
        </Button>
      </Dialog>
    </>
  );
}
