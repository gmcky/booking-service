"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function GuestStepper({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = Infinity,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-1 last:pb-1">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <div className="flex items-center overflow-hidden rounded-full border border-border">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex size-7 items-center justify-center disabled:opacity-40"
        >
          <Minus className="size-[13px]" />
        </button>
        <span className="min-w-6 text-center font-mono text-sm">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex size-7 items-center justify-center disabled:opacity-40"
        >
          <Plus className="size-[13px]" />
        </button>
      </div>
    </div>
  );
}

export function GuestToggle({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-1 last:pb-1">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}
