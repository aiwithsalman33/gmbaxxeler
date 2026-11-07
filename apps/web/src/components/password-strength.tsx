import { cn } from "@/lib/utils";

const LEVELS = [
  { label: "Too short", style: "bg-bad", width: "w-1/4" },
  { label: "Weak", style: "bg-warn", width: "w-2/4" },
  { label: "Good", style: "bg-primary", width: "w-3/4" },
  { label: "Strong", style: "bg-good", width: "w-full" },
];

export const MIN_PASSWORD = 10;

export function passwordLevel(password: string): number {
  if (password.length < MIN_PASSWORD) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((kind) => kind.test(password)).length;
  if (password.length >= 16 && kinds >= 3) return 3;
  return kinds >= 3 || password.length >= 14 ? 2 : 1;
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return <p className="mt-1 text-xs text-muted">At least {MIN_PASSWORD} characters</p>;
  const level = LEVELS[passwordLevel(password)]!;
  return (
    <div className="mt-2" aria-live="polite">
      <div className="h-1.5 rounded-full bg-primary-soft">
        <div className={cn("h-1.5 rounded-full transition-all", level.style, level.width)} />
      </div>
      <p className="mt-1 text-xs text-muted">{level.label}</p>
    </div>
  );
}
