import mark from "@/assets/brand/axgrow-mark.png";
import { cn } from "@/lib/utils";

/**
 * AX Grow logo: the glowing shop mark from the brand file, with the wordmark set in Poppins so it
 * stays sharp and follows the theme. `onDark` keeps "AX" white on the dark sidebar and brand panel.
 */
export function Logo({ className, onDark = false, compact = false, tagline = false }: { className?: string; onDark?: boolean; compact?: boolean; tagline?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {/* A plain img: the file is already sized, and standalone builds need no image optimizer for it. */}
      <img src={mark.src} alt="" width={40} height={40} className="size-10 shrink-0 drop-shadow-[0_2px_10px_rgb(98_70_234/0.35)]" />
      {!compact && (
        <span className="flex min-w-0 flex-col">
          <span className={cn("text-[1.3rem] leading-none font-bold tracking-tight", onDark ? "text-white" : "text-ink")}>
            AX <span className="text-brand">Grow</span>
          </span>
          {tagline && <span className={cn("mt-1 text-[0.6rem] font-medium tracking-[0.1em] whitespace-nowrap uppercase", onDark ? "text-sidebar-muted" : "text-subtle")}>Automate · Optimize · Grow</span>}
        </span>
      )}
      {compact && <span className="sr-only">AX Grow</span>}
    </span>
  );
}
