"use client";

import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { FolderInput, ImageIcon, Images, Newspaper, Trash2, UploadCloud, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GRID, GridSkeleton, ImageTile, UploadList, UploadZone, type UploadItem } from "./library-parts";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast, toastError } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { FolderKind, LibraryImage } from "@/lib/types";

const FOLDERS = [
  { kind: "photos", label: "Photos", icon: Images, about: "Posted to the Google profile as photos on the photo schedule." },
  { kind: "seo_images", label: "SEO Post Images", icon: Newspaper, about: "Used as the picture on AI-written SEO posts." },
] as const satisfies readonly { kind: FolderKind; label: string; icon: typeof Images; about: string }[];

const MAX_BATCH_BYTES = 40 * 1024 * 1024;

/** The proxy accepts 50 MB per request, so a large drop goes up in several. */
function uploadBatches<T extends { file: File }>(items: T[]): T[][] {
  const batches: T[][] = [[]];
  let size = 0;
  for (const item of items) {
    if (size + item.file.size > MAX_BATCH_BYTES && batches.at(-1)!.length) {
      batches.push([]);
      size = 0;
    }
    batches.at(-1)!.push(item);
    size += item.file.size;
  }
  return batches;
}

interface UploadResult {
  name: string;
  ok: boolean;
  error?: string;
}

const plural = (n: number, word = "image") => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function LibraryPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState<FolderKind>("photos");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagging, setTagging] = useState<LibraryImage | null>(null);
  const [tags, setTags] = useState("");
  const [deleting, setDeleting] = useState<LibraryImage[] | null>(null);
  const previews = useRef(new Set<string>());
  const browse = useRef<HTMLInputElement>(null);
  const base = `/clients/${clientId}/library/images`;
  const current = FOLDERS.find((item) => item.kind === folder)!;
  const other = FOLDERS.find((item) => item.kind !== folder)!;

  // Both folders load so each tab can show its count; the keys match the rest of the app.
  const queries = useQueries({
    queries: FOLDERS.map(({ kind }) => ({
      queryKey: ["library", clientId, kind],
      queryFn: () => api<{ images: LibraryImage[] }>(`${base}?folder=${kind}`),
    })),
  });
  const query = queries[FOLDERS.indexOf(current)]!;
  const images = query.data?.images ?? [];
  const chosen = images.filter((image) => selected.has(image.id));
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["library", clientId] });

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const patchUploads = (ids: string[], patch: (item: UploadItem, index: number) => Partial<UploadItem>) =>
    setUploads((list) => list.map((item) => (ids.includes(item.id) ? { ...item, ...patch(item, ids.indexOf(item.id)) } : item)));

  const upload = useMutation({
    mutationFn: async ({ items, kind }: { items: { id: string; file: File }[]; kind: FolderKind }) => {
      const results: UploadResult[] = [];
      for (const batch of uploadBatches(items)) {
        const ids = batch.map((item) => item.id);
        patchUploads(ids, () => ({ status: "uploading" }));
        const form = new FormData();
        batch.forEach(({ file }) => form.append("files", file));
        try {
          const response = await api<{ results: UploadResult[] }>(`${base}?folder=${kind}`, { method: "POST", form });
          patchUploads(ids, (_, i) => {
            const result = response.results[i];
            return result?.ok ? { status: "done" } : { status: "failed", error: result?.error ?? "Upload failed" };
          });
          results.push(...response.results);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          const rest = items.slice(items.indexOf(batch[0]!)).map((item) => item.id);
          patchUploads(rest, () => ({ status: "failed", error: message }));
          throw error;
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const added = results.filter((result) => result.ok).length;
      const failed = results.length - added;
      if (added && !failed) toast.success(`${plural(added)} added`);
      else if (added) toast.success(`${plural(added)} added`, { description: `${plural(failed)} could not be added. See the list for why.` });
      else toast.error(failed === 1 ? "That image could not be added" : "None of those images could be added", { description: "See the list for why." });
    },
    onError: (error) => toastError(error),
    onSettled: () => {
      invalidate();
      // Clear successful rows after a moment; failed rows stay until dismissed.
      setTimeout(() => setUploads((list) => list.filter((item) => keepUnless(item, item.status === "done"))), 4000);
    },
  });

  /** Filter helper that frees a row's preview when the row is dropped. */
  function keepUnless(item: UploadItem, drop: boolean) {
    if (!drop) return true;
    URL.revokeObjectURL(item.preview);
    previews.current.delete(item.preview);
    return false;
  }

  function startUpload(files: File[]) {
    const items = files.map((file) => ({ id: crypto.randomUUID(), file }));
    const rows: UploadItem[] = items.map(({ id, file }) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return { id, name: file.name, size: file.size, preview, folderLabel: current.label, status: "waiting" };
    });
    setUploads((list) => [...rows, ...list]);
    upload.mutate({ items, kind: folder });
  }

  const move = useMutation({
    mutationFn: async (ids: string[]) => {
      let moved = 0;
      for (let i = 0; i < ids.length; i += 200) {
        moved += (await api<{ moved: number }>(`${base}/bulk-move`, { method: "POST", body: { ids: ids.slice(i, i + 200), folder: other.kind } })).moved;
      }
      return moved;
    },
    onSuccess: (moved) => {
      toast.success(`Moved ${plural(moved)} to ${other.label}`);
      setSelected(new Set());
    },
    onError: (error) => toastError(error),
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (targets: LibraryImage[]) => {
      let failed = 0;
      for (const image of targets) {
        try {
          await api(`${base}/${image.id}`, { method: "DELETE" });
        } catch {
          failed += 1;
        }
      }
      if (failed === targets.length) throw new Error(failed === 1 ? "That image could not be deleted" : "Those images could not be deleted");
      return { deleted: targets.length - failed, failed };
    },
    onSuccess: ({ deleted, failed }, targets) => {
      if (failed) toast.error(`Deleted ${plural(deleted)}, ${failed} could not be deleted`);
      else toast.success(targets.length === 1 ? `Deleted ${targets[0]!.originalName}` : `Deleted ${plural(deleted)}`);
      setSelected((set) => new Set([...set].filter((id) => !targets.some((image) => image.id === id))));
      setDeleting(null);
    },
    onError: (error) => toastError(error),
    onSettled: invalidate,
  });

  const saveTags = useMutation({
    mutationFn: () =>
      api(`${base}/${tagging!.id}`, {
        method: "PATCH",
        body: { tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) },
      }),
    onSuccess: () => {
      toast.success("Tags saved");
      setTagging(null);
      invalidate();
    },
    onError: (error) => toastError(error),
  });

  const tagList = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  const tagError = tagList.length > 20 ? "Use 20 tags or fewer" : tagList.some((tag) => tag.length > 40) ? "Keep each tag under 40 characters" : null;

  function toggle(id: string) {
    setSelected((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Library"
        subtitle="Images the photo and SEO post schedulers rotate through for this client."
        actions={
          <Button onClick={() => browse.current?.click()}>
            <UploadCloud aria-hidden />
            Upload images
          </Button>
        }
      />

      <Tabs
        value={folder}
        onValueChange={(value) => {
          setFolder(value as FolderKind);
          setSelected(new Set());
        }}
      >
        <TabsList aria-label="Folders">
          {FOLDERS.map(({ kind, label, icon: Icon }, i) => (
            <TabsTrigger key={kind} value={kind} count={queries[i]!.data?.images.length}>
              <Icon className="size-4" aria-hidden />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={folder}>
          <p className="mb-4 text-sm text-muted">{current.about}</p>
          <UploadZone inputRef={browse} folderLabel={current.label} onFiles={startUpload} compact={images.length > 0} />
          <UploadList
            items={uploads}
            onDismiss={(id) => setUploads((list) => list.filter((item) => keepUnless(item, item.id === id)))}
            onClearFinished={() => setUploads((list) => list.filter((item) => keepUnless(item, item.status === "done" || item.status === "failed")))}
          />

          <section aria-label={`${current.label} images`} className="mt-8">
            {query.isPending && <GridSkeleton />}
            {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
            {query.data && images.length === 0 && (
              <EmptyState
                icon={ImageIcon}
                title={`No images in ${current.label} yet`}
                body="Drop images in the box above. They show up here with their size and how often each one has been used."
                action={
                  <Button onClick={() => browse.current?.click()}>
                    <UploadCloud aria-hidden />
                    Upload images
                  </Button>
                }
              />
            )}
            {images.length > 0 && (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted">
                    <span className="font-semibold text-ink">{plural(images.length)}</span>
                    {chosen.length > 0 && `, ${chosen.length} selected`}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(chosen.length === images.length ? new Set() : new Set(images.map((image) => image.id)))}>
                    {chosen.length === images.length ? "Clear selection" : "Select all"}
                  </Button>
                </div>
                <ul className={GRID}>
                  {images.map((image) => (
                    <ImageTile
                      key={image.id}
                      image={image}
                      selected={selected.has(image.id)}
                      otherLabel={other.label}
                      onToggle={() => toggle(image.id)}
                      onTags={() => {
                        setTagging(image);
                        setTags(image.tags.join(", "));
                      }}
                      onMove={() => move.mutate([image.id])}
                      onDelete={() => setDeleting([image])}
                    />
                  ))}
                </ul>
              </>
            )}
          </section>
        </TabsContent>
      </Tabs>

      {chosen.length > 0 && (
        <div role="region" aria-label="Selected images" className="pointer-events-none sticky bottom-4 z-20 mt-6 flex animate-pop-in justify-center">
          <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-card border border-primary-200 bg-surface/95 py-2 pr-2 pl-2.5 shadow-raised backdrop-blur-md sm:gap-3 sm:pl-3">
            <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-primary px-2 text-sm font-semibold text-white tabular-nums">{chosen.length}</span>
            <p className="mr-1 text-sm font-medium whitespace-nowrap sm:mr-3">selected</p>
            <Button size="sm" variant="secondary" loading={move.isPending} onClick={() => move.mutate(chosen.map((image) => image.id))}>
              {!move.isPending && <FolderInput aria-hidden />}
              <span className="sm:hidden">Move</span>
              <span className="hidden sm:inline">Move to {other.label}</span>
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDeleting(chosen)}>
              <Trash2 aria-hidden />
              Delete
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
              <X aria-hidden />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting?.length === 1 ? "Delete this image?" : `Delete ${deleting?.length ?? 0} images?`}
        description={`${deleting?.length === 1 ? `"${deleting[0]!.originalName}" is` : "They are"} removed from the library and won't be used again. Anything already posted to Google stays there. Upcoming jobs pick a different image.`}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />

      <Dialog
        open={tagging !== null}
        onOpenChange={(open) => !open && setTagging(null)}
        title="Edit tags"
        description={tagging?.originalName}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTagging(null)}>
              Cancel
            </Button>
            <Button loading={saveTags.isPending} disabled={tagError !== null} onClick={() => saveTags.mutate()}>
              Save tags
            </Button>
          </>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!tagError) saveTags.mutate();
          }}
        >
          <Field label="Tags" hint="Separate tags with commas, for example: team, storefront, summer" error={tagError}>
            {(props) => <Input {...props} autoFocus value={tags} onChange={(event) => setTags(event.target.value)} />}
          </Field>
        </form>
      </Dialog>
    </>
  );
}
