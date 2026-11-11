"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const LEVELS = [
  { label: "Too short", bar: "bg-bad", text: "text-bad" },
  { label: "Weak", bar: "bg-warn", text: "text-warn" },
  { label: "Good", bar: "bg-primary", text: "text-primary" },
  { label: "Strong", bar: "bg-good", text: "text-good" },
];

export const MIN_PASSWORD = 10;

export function passwordLevel(password: string): number {
  if (password.length < MIN_PASSWORD) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((kind) => kind.test(password)).length;
  if (password.length >= 16 && kinds >= 3) return 3;
  return kinds >= 3 || password.length >= 14 ? 2 : 1;
}

/** Four-segment meter under a new-password field. Give it an `id` and point the input's aria-describedby at it. */
export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const index = passwordLevel(password);
  const level = LEVELS[index]!;
  return (
    <div id={id} className="mt-2.5">
      <div className="grid grid-cols-4 gap-1.5" aria-hidden>
        {LEVELS.map((_, i) => (
          <span key={i} className={cn("h-1.5 rounded-full transition-colors duration-300", password && i <= index ? level.bar : "bg-primary-100")} />
        ))}
      </div>
      <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-muted" aria-live="polite">
        {password ? (
          <>
            <span>
              Strength: <span className={cn("font-semibold", level.text)}>{level.label}</span>
            </span>
            {index < 3 && <span>{index === 0 ? `At least ${MIN_PASSWORD} characters` : "Longer, with numbers and symbols, is stronger"}</span>}
          </>
        ) : (
          <span>At least {MIN_PASSWORD} characters</span>
        )}
      </p>
    </div>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-11", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-subtle transition-colors hover:bg-primary-50 hover:text-primary focus-visible:shadow-focus focus-visible:outline-none"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
