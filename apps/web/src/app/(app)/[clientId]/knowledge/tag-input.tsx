"use client";

import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

const split = (text: string) => text.split(",").map((item) => item.trim()).filter(Boolean);

/**
 * List editor shown as chips. Enter or a comma adds an item, Backspace on an empty
 * field removes the last one, pasting "a, b, c" adds all three. Unfinished text is
 * added when the field loses focus, so clicking Save never drops it.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  max = 50,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  id: string;
  value: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  max?: number;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const items = split(text).filter((item) => !value.some((existing) => existing.toLowerCase() === item.toLowerCase()));
    if (items.length) onChange([...value, ...items].slice(0, max));
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === "Enter" || event.key === ",") && draft.trim()) {
      event.preventDefault();
      commit(draft);
    } else if (event.key === "Enter") {
      event.preventDefault();
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 rounded-control border border-line-strong bg-surface px-2 py-1.5 transition-[border-color,box-shadow] hover:border-primary-300 focus-within:border-primary focus-within:shadow-focus",
        invalid && "border-bad",
      )}
      onClick={(event) => (event.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}
    >
      {value.length > 0 && (
        <ul className="contents" aria-label="Added items">
          {value.map((item, index) => (
            <li key={item} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-primary-50 py-0.5 pr-1 pl-2.5 text-sm text-primary-900 ring-1 ring-primary-100 ring-inset">
              <span className="truncate">{item}</span>
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(value.filter((_, i) => i !== index));
                }}
                className="cursor-pointer rounded-md p-0.5 text-primary-700 hover:bg-primary-200 focus-visible:shadow-focus focus-visible:outline-none"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        value={draft}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        placeholder={value.length ? "Add another" : placeholder}
        onChange={(event) => {
          const text = event.target.value;
          if (text.includes(",")) {
            const parts = text.split(",");
            commit(parts.slice(0, -1).join(","));
            setDraft(parts.at(-1)!.trimStart());
          } else setDraft(text);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && commit(draft)}
        className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm text-ink placeholder:text-subtle focus:outline-none"
      />
    </div>
  );
}
