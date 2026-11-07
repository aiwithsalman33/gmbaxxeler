"use client";

import * as Radix from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Portal>
        <Radix.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Radix.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card bg-white p-6 shadow-card">
          <Radix.Title className="pr-8 text-lg font-semibold">{title}</Radix.Title>
          <Radix.Description className="mt-1 text-sm text-muted">{description}</Radix.Description>
          <Radix.Close aria-label="Close" className="absolute top-4 right-4 cursor-pointer rounded-lg p-1 text-muted hover:bg-lavender">
            <X className="size-5" />
          </Radix.Close>
          <div className="mt-4">{children}</div>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
