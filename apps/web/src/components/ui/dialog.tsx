"use client";

import * as Radix from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Buttons pinned to the bottom of the dialog. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZES = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };

/** Centered modal. Focus is trapped and returned on close; Escape closes it. */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md" }: DialogProps) {
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Portal>
        <Radix.Overlay className="fixed inset-0 z-40 animate-fade-in bg-black/50 backdrop-blur-[2px]" />
        <Radix.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[min(90dvh,56rem)] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 animate-pop-in flex-col rounded-card border border-line bg-surface shadow-raised focus:outline-none",
            SIZES[size],
          )}
        >
          <div className="border-b border-line px-4 pt-4 pb-3.5 sm:px-6 sm:pt-5 sm:pb-4">
            <Radix.Title className="pr-8 text-lg font-semibold">{title}</Radix.Title>
            <Radix.Description className={cn("mt-1 text-sm text-muted", !description && "sr-only")}>{description ?? title}</Radix.Description>
          </div>
          <Radix.Close aria-label="Close" className="absolute top-4 right-4 cursor-pointer rounded-lg p-1.5 text-muted hover:bg-lavender hover:text-ink">
            <X className="size-5" />
          </Radix.Close>
          <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
          {/* On phones the buttons share the row evenly, so they are easy to tap. */}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3.5 *:flex-1 sm:px-6 sm:py-4 sm:*:flex-none">{footer}</div>}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}

/** Panel that slides in from the right; used for reply editing and other side tasks. */
export function Drawer({ open, onOpenChange, title, description, children, footer }: Omit<DialogProps, "size">) {
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Portal>
        <Radix.Overlay className="fixed inset-0 z-40 animate-fade-in bg-black/40" />
        <Radix.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg animate-slide-in-right flex-col bg-surface shadow-raised focus:outline-none">
          <div className="border-b border-line px-4 pt-4 pb-3.5 sm:px-6 sm:pt-5 sm:pb-4">
            <Radix.Title className="pr-8 text-lg font-semibold">{title}</Radix.Title>
            <Radix.Description className={cn("mt-1 text-sm text-muted", !description && "sr-only")}>{description ?? title}</Radix.Description>
          </div>
          <Radix.Close aria-label="Close" className="absolute top-4 right-4 cursor-pointer rounded-lg p-1.5 text-muted hover:bg-lavender hover:text-ink">
            <X className="size-5" />
          </Radix.Close>
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3.5 sm:px-6 sm:py-4">{footer}</div>}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}

/** A small confirm modal, used instead of window.confirm. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
  danger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={danger ? "danger-solid" : "primary"} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-soft">{description}</p>
    </Dialog>
  );
}
