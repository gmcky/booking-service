"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  disabledDates,
  defaultMonth,
  label,
}: {
  value?: Date;
  onChange?: (date?: Date) => void;
  placeholder?: string;
  disabled?: boolean;
  disabledDates?: React.ComponentProps<typeof Calendar>["disabled"];
  defaultMonth?: Date;
  /**
   * Field name for assistive tech, e.g. "Check in". Callers wrap the picker
   * in a <label> for layout, which would make the label text the button's
   * entire accessible name and hide the selected date from screen readers —
   * aria-label wins over the native label, so composing both here keeps the
   * name and the current value audible.
   */
  label?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            disabled={disabled}
            aria-label={
              label ? `${label}, ${value ? format(value, "PP") : placeholder}` : undefined
            }
            className={cn(
              "w-full justify-start gap-2 font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon />
            {value ? format(value, "PP") : placeholder}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          disabled={disabledDates}
          defaultMonth={defaultMonth ?? value}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker };
