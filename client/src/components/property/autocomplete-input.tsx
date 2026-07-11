"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Free-text input with a suggestion dropdown. The parent owns the value and
 * the suggestion list (fetching, filtering); this component owns the
 * open/highlight state, keyboard navigation, and the beat-the-blur pick.
 * Typing is never constrained to the suggestions.
 */
export function AutocompleteInput<T extends { label: string }>({
  id,
  value,
  placeholder,
  invalid,
  suggestions,
  onValueChange,
  onPick,
}: {
  id: string;
  value: string;
  placeholder?: string;
  invalid?: boolean;
  suggestions: T[];
  onValueChange: (value: string) => void;
  onPick: (suggestion: T) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);

  // New list — old highlight index points at something else entirely.
  React.useEffect(() => setActive(-1), [suggestions]);

  const visible = open && suggestions.length > 0;

  function pick(suggestion: T) {
    onPick(suggestion);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!visible) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={visible}
        aria-controls={`${id}-suggestions`}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        aria-invalid={invalid}
      />
      {visible ? (
        <ul
          id={`${id}-suggestions`}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-md"
        >
          {suggestions.map((s, i) => (
            <li key={s.label} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                // mousedown so the pick lands before the input's blur
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "w-full truncate px-3 py-2 text-left text-sm",
                  i === active ? "bg-muted" : "hover:bg-muted",
                )}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
