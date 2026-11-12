"use client";

import { Toaster as Sonner, toast } from "sonner";

/** Mounted once in Providers. Use `toast.success(...)`, `toast.error(...)` anywhere. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border !border-line !bg-surface !text-ink !shadow-raised !font-sans",
          description: "!text-muted",
          success: "[&_[data-icon]]:!text-good",
          error: "[&_[data-icon]]:!text-bad",
        },
      }}
    />
  );
}

/** Shows an error from a failed mutation; keeps the message the API sent. */
export function toastError(error: unknown, fallback = "Something went wrong") {
  toast.error(error instanceof Error ? error.message : fallback);
}

export { toast };
