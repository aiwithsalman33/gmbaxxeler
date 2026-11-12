import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonStyles = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,filter] focus-visible:shadow-focus focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary bg-brand-button text-white shadow-md shadow-primary/25 hover:brightness-110 active:brightness-95",
        secondary: "border border-line-strong bg-surface text-ink hover:border-primary-300 hover:bg-primary-50",
        soft: "bg-primary-100 text-primary-800 hover:bg-primary-200",
        ghost: "text-ink-soft hover:bg-primary-50 hover:text-ink",
        danger: "border border-bad-line bg-surface text-bad hover:bg-bad-soft",
        // Fixed reds: readable with white text in both themes.
        "danger-solid": "bg-red-700 text-white hover:bg-red-800",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: { lg: "h-11 px-5 text-sm", md: "h-10 px-4 text-sm", sm: "h-8 px-3 text-xs", icon: "size-10", "icon-sm": "size-8" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  asChild?: boolean;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

export function Button({ className, variant, size, asChild, loading, disabled, children, ...props }: ButtonProps) {
  if (asChild) {
    return (
      <Slot className={cn(buttonStyles({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button className={cn(buttonStyles({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
