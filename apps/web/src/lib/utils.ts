import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string, timeZone?: string): string {
  return new Date(value).toLocaleString("en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone });
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
