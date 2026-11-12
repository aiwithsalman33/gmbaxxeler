"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./theme-key";

export { THEME_KEY };
export type ThemeChoice = "light" | "dark" | "system";

declare global {
  interface Window {
    /** Set by the inline script in layout.tsx; re-reads the saved choice and applies it. */
    __applyTheme?: () => void;
  }
}

const listeners = new Set<() => void>();

function read(): ThemeChoice {
  if (typeof document === "undefined") return "system";
  const choice = document.documentElement.dataset.themeChoice;
  return choice === "light" || choice === "dark" ? choice : "system";
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage can be blocked; the theme still applies for this page view.
    document.documentElement.dataset.themeChoice = choice;
  }
  window.__applyTheme?.();
  if (choice !== "system") document.documentElement.dataset.theme = choice;
  listeners.forEach((listener) => listener());
}

/** The saved choice: light, dark or system. */
export function useTheme(): ThemeChoice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => "system",
  );
}
