import { AlertCircle, BarChart3, CalendarClock, KeyRound, MessageSquareText, ShieldCheck, Undo2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import banner from "@/assets/brand/axgrow-logo.jpg";
import { Logo } from "@/components/brand";
import { Notice } from "@/components/states";
import { cn } from "@/lib/utils";

type Audience = "agency" | "client";

const PANELS: Record<Audience, { heading: string; body: string; points: { icon: LucideIcon; title: string; body: string }[] }> = {
  agency: {
    heading: "Keep every Google Business Profile busy, without the busywork.",
    body: "AX Grow runs posts, photos and review replies for all your local clients from one place.",
    points: [
      { icon: CalendarClock, title: "Posts and photos on schedule", body: "Plan once and AX Grow publishes for you." },
      { icon: MessageSquareText, title: "Reviews answered faster", body: "Draft friendly replies and approve them in a click." },
      { icon: BarChart3, title: "Results you can show clients", body: "Calls, clicks and searches for every profile." },
    ],
  },
  client: {
    heading: "Let your agency look after your Google Business Profile.",
    body: "Your agency uses AX Grow to keep your profile fresh with posts, photos and review replies.",
    points: [
      { icon: KeyRound, title: "Sign in with Google", body: "Your password is never shared with anyone." },
      { icon: ShieldCheck, title: "You stay the owner", body: "Your agency only gets the access you approve." },
      { icon: Undo2, title: "Change your mind any time", body: "Remove access from your Google account settings." },
    ],
  },
};

function BrandPanel({ audience }: { audience: Audience }) {
  const panel = PANELS[audience];
  return (
    // Pure black, like the logo file, so the banner sits on it with no visible edge.
    <aside className="relative hidden overflow-hidden rounded-[1.75rem] bg-black text-white shadow-raised lg:flex lg:flex-col">
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-[#6246ea]/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 bottom-10 size-80 rounded-full bg-[#3d8ffb]/20 blur-3xl" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]"
      />
      <img src={banner.src} alt="AX Grow: Automate, Optimize, Grow. Google Business Profile Automation" width={banner.width} height={banner.height} className="relative w-full" />
      <div className="relative mt-auto max-w-lg px-10 pb-10 xl:px-14 xl:pb-14">
        <h2 className="text-[1.75rem] leading-tight font-bold tracking-tight text-balance xl:text-[2rem]">{panel.heading}</h2>
        <p className="mt-3 text-[0.95rem] text-white/70">{panel.body}</p>
        <ul className="mt-8 space-y-4">
          {panel.points.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] ring-1 ring-white/15">
                <Icon className="size-5 text-[#a99cff]" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-sm text-white/60">{body}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-xs text-white/45">Made for agencies that manage local businesses.</p>
      </div>
    </aside>
  );
}

const TONES = {
  primary: "bg-primary-50 text-primary ring-primary-100",
  good: "bg-good-soft text-good ring-good-line",
  bad: "bg-bad-soft text-bad ring-bad-line",
  warn: "bg-warn-soft text-warn ring-warn-line",
};

/**
 * Shared layout for every signed-out screen: brand panel on the left (desktop only), form card on the right.
 * Pass `icon` for message screens such as "Check your email"; the card then centres its content.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  icon: Icon,
  tone = "primary",
  audience = "agency",
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  audience?: Audience;
}) {
  const centred = Boolean(Icon);
  return (
    <div className="min-h-dvh bg-lavender lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-4 lg:p-4">
      <BrandPanel audience={audience} />
      <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:min-h-0">
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-primary-200/40 blur-3xl lg:hidden" />
        <div className="relative w-full max-w-[26rem]">
          <Link href="/login" aria-label="AX Grow home" className="mb-8 flex justify-center rounded-xl focus-visible:shadow-focus focus-visible:outline-none lg:hidden">
            <Logo tagline />
          </Link>
          <div className="rounded-[1.25rem] border border-line bg-surface p-6 shadow-raised sm:p-8">
            <div className={cn(centred && "text-center")}>
              {Icon && (
                <div className={cn("mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl ring-8", TONES[tone])}>
                  <Icon className="size-7" aria-hidden />
                </div>
              )}
              <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
            </div>
            {children && <div className="mt-7">{children}</div>}
          </div>
          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/** A mutation error shown inside an auth form. */
export function FormError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <Notice tone="bad" icon={AlertCircle}>
      {error.message}
    </Notice>
  );
}

/** Small "or" divider between sign-in methods. */
export function OrDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs font-medium tracking-wide text-subtle uppercase" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const googleButton =
  "inline-flex h-11 w-full items-center justify-center gap-3 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink shadow-sm transition-[background-color,border-color,box-shadow] hover:border-primary-300 hover:bg-primary-50 focus-visible:shadow-focus focus-visible:outline-none";

/** "Continue with Google". A link when `href` is given, otherwise a disabled button. */
export function GoogleButton({ href, label = "Continue with Google", describedBy }: { href?: string; label?: string; describedBy?: string }) {
  if (!href) {
    return (
      <button type="button" disabled aria-describedby={describedBy} className={cn(googleButton, "cursor-not-allowed opacity-55 hover:border-line-strong hover:bg-surface")}>
        <GoogleLogo className="size-5" />
        {label}
      </button>
    );
  }
  return (
    <a href={href} className={googleButton}>
      <GoogleLogo className="size-5" />
      {label}
    </a>
  );
}

export const authLink = "rounded font-semibold text-primary hover:text-primary-dark hover:underline focus-visible:shadow-focus focus-visible:outline-none";
