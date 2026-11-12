"use client";

import * as Radix from "@radix-ui/react-dropdown-menu";
import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Menu = Radix.Root;
export const MenuTrigger = Radix.Trigger;

/** Dropdown menu panel. Arrow keys, Home/End and type-ahead work out of the box. */
export function MenuContent({ className, children, ...props }: ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        sideOffset={6}
        align="end"
        className={cn("z-40 min-w-52 animate-fade-in rounded-xl border border-line bg-white p-1.5 shadow-raised", className)}
        {...props}
      >
        {children}
      </Radix.Content>
    </Radix.Portal>
  );
}

export function MenuItem({ className, icon, children, danger, asChild, ...props }: ComponentProps<typeof Radix.Item> & { icon?: ReactNode; danger?: boolean }) {
  // With asChild, Radix merges onto exactly one child element (a Link, say), so the
  // icon has to go inside that element. Passing icon and child side by side throws
  // "React.Children.only" the moment the menu opens, and the menu never shows.
  const child: ReactElement<{ children?: ReactNode }> | null = asChild && isValidElement<{ children?: ReactNode }>(children) ? children : null;
  return (
    <Radix.Item
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-primary-50 [&_svg]:size-4 [&_svg]:text-muted",
        danger ? "text-bad data-[highlighted]:bg-bad-soft [&_svg]:text-bad" : "text-ink",
        className,
      )}
      asChild={child !== null}
      {...props}
    >
      {child ? (
        cloneElement(child, undefined, icon, child.props.children)
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </Radix.Item>
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof Radix.Label>) {
  return <Radix.Label className={cn("px-2.5 py-1.5 text-xs text-muted", className)} {...props} />;
}

export function MenuSeparator() {
  return <Radix.Separator className="my-1 h-px bg-line" />;
}
