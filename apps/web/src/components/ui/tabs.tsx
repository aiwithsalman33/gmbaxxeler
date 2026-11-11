"use client";

import * as Radix from "@radix-ui/react-tabs";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Tabs = Radix.Root;
export const TabsContent = ({ className, ...props }: ComponentProps<typeof Radix.Content>) => (
  <Radix.Content className={cn("mt-5 focus-visible:outline-none", className)} {...props} />
);

/** Underlined page tabs. Arrow keys move between them. Scrolls sideways on narrow screens instead of wrapping. */
export function TabsList({ className, ...props }: ComponentProps<typeof Radix.List>) {
  return <Radix.List className={cn("-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1", className)} {...props} />;
}

export function TabsTrigger({ className, children, count, ...props }: ComponentProps<typeof Radix.Trigger> & { count?: number; children: ReactNode }) {
  return (
    <Radix.Trigger
      className={cn(
        "-mb-px inline-flex cursor-pointer items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap text-muted transition-colors hover:text-ink focus-visible:rounded-t-lg focus-visible:shadow-focus focus-visible:outline-none data-[state=active]:border-primary data-[state=active]:text-primary-700",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && <span className="rounded-full bg-primary-100 px-1.5 text-2xs font-semibold text-primary-800">{count}</span>}
    </Radix.Trigger>
  );
}

/** Pill-style choice between a few options, such as 7d / 28d / 90d. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-control border border-line bg-white p-1 shadow-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:shadow-focus focus-visible:outline-none",
            value === option.value ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-primary-50 hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
