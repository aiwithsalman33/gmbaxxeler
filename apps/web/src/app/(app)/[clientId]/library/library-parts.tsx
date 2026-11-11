"use client";

import { Check, CheckCircle2, Clock, ExternalLink, FolderInput, Loader2, MoreHorizontal, Tag, Trash2, UploadCloud, XCircle } from "lucide-react";
import { useState, type DragEvent, type RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { LoadingBlock, Skeleton } from "@/components/ui/skeleton";
import { ProgressBar } from "@/components/ui/widgets";
import type { LibraryImage } from "@/lib/types";
import { cn, formatBytes, formatDate } from "@/lib/utils";

export const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5";

/** Big drop target. It is a real button, so Enter or Space opens the file picker. */
export function UploadZone({
  inputRef: input,
  folderLabel,
  onFiles,
  compact,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  folderLabel: string;
  onFiles: (files: File[]) => void;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) onFiles([...event.dataTransfer.files]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        aria-describedby="upload-rules"
        className={cn(
          "group flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed bg-white px-6 text-center transition-[background-color,border-color,box-shadow] focus-visible:shadow-focus focus-visible:outline-none",
          compact ? "py-7" : "py-10 sm:py-12",
          dragging ? "border-primary bg-primary-50 shadow-focus" : "border-line-strong hover:border-primary-300 hover:bg-primary-50/50",
        )}
      >
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-2xl text-primary ring-1 ring-primary-200 transition-transform",
            dragging ? "scale-110 bg-primary text-white ring-primary" : "bg-gradient-to-br from-primary-50 to-primary-100 group-hover:scale-105",
          )}
        >
          <UploadCloud className="size-6" aria-hidden />
        </span>
        <span>
          <span className="block text-sm font-semibold text-ink sm:text-base">{dragging ? `Drop to add to ${folderLabel}` : "Drag images here, or click to browse"}</span>
          <span className="mt-1 block text-sm text-muted">
            They go into <span className="font-medium text-ink-soft">{folderLabel}</span>
          </span>
        </span>
        <span id="upload-rules" className="flex flex-wrap justify-center gap-1.5">
          {["JPG or PNG", "10 KB to 5 MB", "At least 250 × 250 px"].map((rule) => (
            <Badge key={rule} tone="neutral" className="bg-lavender">
              {rule}
            </Badge>
          ))}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        aria-label="Upload images"
        accept="image/jpeg,image/png"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files?.length) onFiles([...event.target.files]);
          event.target.value = "";
        }}
      />
    </>
  );
}

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  preview: string;
  folderLabel: string;
  status: "waiting" | "uploading" | "done" | "failed";
  error?: string;
}

const STATUS = {
  waiting: { icon: Clock, text: "Waiting", style: "text-muted" },
  uploading: { icon: Loader2, text: "Uploading", style: "text-primary" },
  done: { icon: CheckCircle2, text: "Added", style: "text-good" },
  failed: { icon: XCircle, text: "Not added", style: "text-bad" },
};

/** One row per file, so a rejected file shows the server's reason next to its name. */
export function UploadList({ items, onDismiss, onClearFinished }: { items: UploadItem[]; onDismiss: (id: string) => void; onClearFinished: () => void }) {
  if (!items.length) return null;
  const finished = items.filter((item) => item.status === "done" || item.status === "failed").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const busy = finished < items.length;
  return (
    <Card className="mt-4 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div aria-live="polite">
          <p className="text-sm font-semibold">{busy ? `Uploading ${finished} of ${items.length}` : failed ? `${failed} ${failed === 1 ? "image was" : "images were"} not added` : "All images added"}</p>
          {!busy && failed > 0 && <p className="text-xs text-muted">Check the reason next to each file, fix it and try again.</p>}
        </div>
        {!busy && (
          <Button size="sm" variant="ghost" onClick={onClearFinished}>
            Clear list
          </Button>
        )}
      </div>
      <ProgressBar value={(finished / items.length) * 100} label="Upload progress" className="mb-3" />
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((item) => {
          const status = STATUS[item.status];
          const Icon = status.icon;
          return (
            <li key={item.id} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2", item.status === "failed" ? "border-red-200 bg-bad-soft/60" : "border-line bg-white")}>
              <img src={item.preview} alt="" className="size-10 shrink-0 rounded-lg bg-lavender object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={item.name}>
                  {item.name}
                </p>
                <p className={cn("flex items-start gap-1 text-xs", status.style)}>
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", item.status === "uploading" && "animate-spin")} aria-hidden />
                  <span className={cn(item.status !== "failed" && "truncate")}>{item.status === "failed" ? (item.error ?? "Upload failed") : `${status.text} · ${formatBytes(item.size)} · ${item.folderLabel}`}</span>
                </p>
              </div>
              {item.status === "failed" && (
                <Button size="icon-sm" variant="ghost" aria-label={`Dismiss ${item.name}`} onClick={() => onDismiss(item.id)}>
                  <XCircle aria-hidden />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function usageText(image: LibraryImage) {
  return image.usageCount === 0 ? "Not used yet" : `Used ${image.usageCount} ${image.usageCount === 1 ? "time" : "times"}`;
}

export function ImageTile({
  image,
  selected,
  otherLabel,
  onToggle,
  onTags,
  onMove,
  onDelete,
}: {
  image: LibraryImage;
  selected: boolean;
  otherLabel: string;
  onToggle: () => void;
  onTags: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={cn("group relative overflow-hidden rounded-card border bg-white shadow-card transition-[border-color,box-shadow]", selected ? "border-primary ring-2 ring-primary" : "border-line hover:shadow-raised")}>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Select ${image.originalName}`}
        onClick={onToggle}
        className="peer relative block aspect-square w-full cursor-pointer overflow-hidden bg-lavender focus-visible:outline-none"
      >
        <img src={image.publicUrl} alt="" loading="lazy" className={cn("size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]", selected && "scale-[0.97] rounded-xl")} />
        <span
          aria-hidden
          className={cn(
            "absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-md border-2 shadow-sm transition-[opacity,background-color]",
            selected ? "border-primary bg-primary text-white opacity-100" : "border-white bg-ink/20 text-transparent backdrop-blur-sm sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
          )}
        >
          <Check className="size-4" strokeWidth={3} />
        </span>
        <span aria-hidden className="absolute top-2.5 right-2.5">
          <Badge tone={image.usageCount ? "primary" : "neutral"} className="bg-white/90 backdrop-blur-sm">
            {image.usageCount ? `Used ${image.usageCount}×` : "New"}
          </Badge>
        </span>
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex translate-y-2 flex-col gap-0.5 bg-gradient-to-t from-ink/85 via-ink/60 to-transparent px-3 pt-10 pb-3 text-left text-white opacity-0 transition-[opacity,transform] group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
        >
          <span className="truncate text-sm font-semibold">{image.originalName}</span>
          <span className="text-xs text-white/85">
            {image.width} × {image.height} · {formatBytes(image.bytes)}
          </span>
          <span className="text-xs text-white/85">
            {usageText(image)}
            {image.lastUsedAt && `, last ${formatDate(image.lastUsedAt)}`}
          </span>
        </span>
      </button>
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-card peer-focus-visible:shadow-[inset_0_0_0_3px_var(--color-primary)]" />
      <div className="flex items-start gap-1 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={image.originalName}>
            {image.originalName}
          </p>
          <p className="truncate text-xs text-muted">
            {image.width} × {image.height} · {formatBytes(image.bytes)}
          </p>
          {image.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {image.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="max-w-full truncate rounded-full bg-primary-50 px-2 py-0.5 text-2xs font-medium text-primary-800">
                  {tag}
                </span>
              ))}
              {image.tags.length > 3 && <span className="px-1 text-2xs text-muted">+{image.tags.length - 3}</span>}
            </div>
          )}
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${image.originalName}`} className="-mr-1 shrink-0">
              <MoreHorizontal aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Tag aria-hidden />} onSelect={onTags}>
              Edit tags
            </MenuItem>
            <MenuItem icon={<FolderInput aria-hidden />} onSelect={onMove}>
              Move to {otherLabel}
            </MenuItem>
            <MenuItem icon={<ExternalLink aria-hidden />} onSelect={() => window.open(image.publicUrl, "_blank", "noopener,noreferrer")}>
              Open full size
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger icon={<Trash2 aria-hidden />} onSelect={onDelete}>
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </li>
  );
}

export function GridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <LoadingBlock label="Loading images" className={GRID}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-card border border-line bg-white shadow-card">
          <Skeleton className="aspect-square rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-3/4 rounded-md" />
            <Skeleton className="h-3 w-1/2 rounded-md" />
          </div>
        </div>
      ))}
    </LoadingBlock>
  );
}
