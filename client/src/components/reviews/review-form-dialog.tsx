"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reviewApi, type Review } from "@/lib/api/reviews";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";
import type { ApiError } from "@/lib/api/unwrap";

const COMMENT_MIN = 10;
const COMMENT_MAX = 1000;

const CATEGORY_FIELDS = [
  ["cleanliness", "Cleanliness"],
  ["accuracy", "Accuracy"],
  ["checkIn", "Check-in"],
  ["communication", "Communication"],
  ["location", "Location"],
  ["value", "Value"],
] as const;

type CategoryKey = (typeof CATEGORY_FIELDS)[number][0];

function StarPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const [hover, setHover] = React.useState(0);
  return (
    <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          className="p-0.5 text-foreground"
          aria-label={`${label}: ${n} star${n === 1 ? "" : "s"}`}
        >
          <Star
            className={cn(
              "size-5",
              (hover || value) >= n ? "fill-current" : "text-muted-foreground",
            )}
          />
        </button>
      ))}
    </div>
  );
}

type ReviewFormDialogBaseProps = {
  trigger: React.ReactElement;
  children: React.ReactNode;
};

type ReviewFormDialogProps = ReviewFormDialogBaseProps &
  (
    | { mode: "create"; bookingId: string; propertyId: string; propertyTitle: string }
    | { mode: "edit"; review: Review }
  );

export function ReviewFormDialog(props: ReviewFormDialogProps) {
  const propertyId = props.mode === "create" ? props.propertyId : props.review.propertyId;
  const [open, setOpen] = React.useState(false);
  const [rating, setRating] = React.useState(props.mode === "edit" ? props.review.rating : 0);
  const [comment, setComment] = React.useState(
    props.mode === "edit" ? (props.review.comment ?? "") : "",
  );
  // Category values (0 = unset). Per-review payloads don't carry categories, so
  // edit starts blank; unset values are sent as undefined and left untouched.
  const [categories, setCategories] = React.useState<Partial<Record<CategoryKey, number>>>({});
  const queryClient = useQueryClient();

  const trimmed = comment.trim();
  const commentError =
    trimmed.length > 0 && (trimmed.length < COMMENT_MIN || trimmed.length > COMMENT_MAX)
      ? `Comment must be ${COMMENT_MIN}-${COMMENT_MAX} characters`
      : null;
  const canSubmit = rating >= 1 && rating <= 5 && !commentError;

  function reset() {
    setCategories({});
    if (props.mode === "edit") {
      setRating(props.review.rating);
      setComment(props.review.comment ?? "");
    } else {
      setRating(0);
      setComment("");
    }
  }

  const mutation = useMutation({
    mutationFn: () => {
      // Only send categories the guest actually set; unset ones stay undefined.
      const setCats = Object.fromEntries(
        CATEGORY_FIELDS.map(([key]) => [key, categories[key]]).filter(([, v]) => (v as number) >= 1),
      );
      const input = { rating, comment: trimmed.length > 0 ? trimmed : undefined, ...setCats };
      return props.mode === "create"
        ? reviewApi.create({ bookingId: props.bookingId, ...input })
        : reviewApi.update(props.review.id, input);
    },
    onSuccess: () => {
      toast.success(props.mode === "create" ? "Review submitted" : "Review updated");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["reviews", "list", propertyId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews.stats(propertyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.properties.detail(propertyId) });
    },
    onError: (err) => {
      const apiErr = err as ApiError;
      if (apiErr.code === "EMAIL_NOT_VERIFIED") {
        toast.error("Verify your email to continue. Check your inbox for the link.");
        return;
      }
      if (props.mode === "create" && apiErr.message === "This booking already has a review") {
        toast.error("You've already reviewed this stay");
        return;
      }
      toast.error(apiErr.message);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={props.trigger}>{props.children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {props.mode === "create" ? "Leave a review" : "Edit your review"}
          </DialogTitle>
          <DialogDescription>
            {props.mode === "create" ? props.propertyTitle : "Update your rating or comment."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label className="mb-1.5 font-mono text-[10px] tracking-wide uppercase text-muted-foreground">
              Overall rating
            </Label>
            <StarPicker value={rating} onChange={setRating} label="Overall" />
          </div>

          <div>
            <Label className="mb-1.5 font-mono text-[10px] tracking-wide uppercase text-muted-foreground">
              Categories (optional)
            </Label>
            <div className="flex flex-col gap-1.5">
              {CATEGORY_FIELDS.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <StarPicker
                    value={categories[key] ?? 0}
                    onChange={(n) => setCategories((c) => ({ ...c, [key]: n }))}
                    label={label}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label
              htmlFor="review-comment"
              className="mb-1.5 font-mono text-[10px] tracking-wide uppercase text-muted-foreground"
            >
              Comment (optional)
            </Label>
            <Textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="How was your stay?"
              aria-invalid={!!commentError}
              maxLength={COMMENT_MAX}
            />
            <div className="mt-1 flex items-center justify-between">
              {commentError ? <p className="text-sm text-destructive">{commentError}</p> : <span />}
              <span className="font-mono text-[11px] text-muted-foreground">
                {trimmed.length}/{COMMENT_MAX}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending
              ? "Saving…"
              : props.mode === "create"
                ? "Submit review"
                : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
