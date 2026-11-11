import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Scrolls inside its own box on narrow screens, so the page never scrolls sideways. */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    // relative: keeps absolutely positioned children (e.g. sr-only labels) inside the scroll box, not the page.
    <div className="relative -mx-5 overflow-x-auto sm:-mx-6">
      <table className={cn("w-full min-w-[36rem] border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-primary-50/50", className)} {...props} />;
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn("border-y border-line bg-lavender/60 px-3 py-2.5 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-muted uppercase first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6", className)}
      {...props}
    />
  );
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-3 align-middle first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6", className)} {...props} />;
}
