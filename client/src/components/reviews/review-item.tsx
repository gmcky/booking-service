"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ReviewFormDialog } from "@/components/reviews/review-form-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { reviewApi, type Review } from "@/lib/api/reviews";
import { reviewEditWindow } from "@/lib/utils/reviews";
import { useAuthStore } from "@/lib/auth/store";

const REPLY_MAX = 2000;
const REPORT_MIN = 10;
const REPORT_MAX = 1000;

export function ReviewItem({
  review,
  propertyOwnerId,
  onChanged,
}: {
  review: Review;
  propertyOwnerId: string;
  onChanged: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [reported, setReported] = React.useState(false);

  const date = new Date(review.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const deleteMutation = useMutation({
    mutationFn: () => reviewApi.remove(review.id),
    onSuccess: () => {
      toast.success("Review deleted");
      onChanged();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const isOwn = user?.id === review.userId;
  const isPropertyOwner = user?.id === propertyOwnerId;
  const editWindow = reviewEditWindow(review.createdAt);
  const canEdit = isOwn && editWindow.eligible;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2.5">
        <Avatar className="size-[34px] shrink-0 border border-border">
          {review.user.avatarUrl ? <AvatarImage src={review.user.avatarUrl} alt="" /> : null}
          <AvatarFallback>
            {`${review.user.firstName[0] ?? ""}${review.user.lastName[0] ?? ""}`.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-sm font-medium">{review.user.firstName}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{date}</div>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 text-[13px]">
          <Star className="size-3.5 fill-current" />
          {review.rating}
        </span>
      </div>

      {review.comment ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{review.comment}</p>
      ) : null}

      {review.hostReplyText ? (
        <div className="mt-3 ml-4 border-l-2 border-border pl-3">
          <div className="text-[13px] font-medium">
            Response from {review.hostReplyBy?.firstName}
          </div>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            {review.hostReplyText}
          </p>
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center gap-3">
        {isOwn ? (
          <>
            {canEdit ? (
              <>
                <ReviewFormDialog
                  mode="edit"
                  review={review}
                  trigger={<Button variant="ghost" size="xs" />}
                >
                  Edit
                </ReviewFormDialog>
                <span className="text-xs text-muted-foreground">
                  {editWindow.daysRemaining === 1
                    ? "1 day left to edit"
                    : `${editWindow.daysRemaining} days left to edit`}
                </span>
              </>
            ) : null}
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogTrigger
                render={<Button variant="ghost" size="xs" disabled={deleteMutation.isPending} />}
              >
                {deleteMutation.isPending ? <Loader2 className="animate-spin" /> : null}
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this review?</AlertDialogTitle>
                  <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep review</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      setDeleteOpen(false);
                      deleteMutation.mutate();
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : isPropertyOwner && !review.hostReplyText ? (
          <ReplyDialog reviewId={review.id} onChanged={onChanged} />
        ) : status === "authed" && !reported ? (
          <ReportDialog reviewId={review.id} onReported={() => setReported(true)} />
        ) : null}
      </div>
    </div>
  );
}

function ReplyDialog({ reviewId, onChanged }: { reviewId: string; onChanged: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const trimmed = text.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= REPLY_MAX;

  const mutation = useMutation({
    mutationFn: () => reviewApi.reply(reviewId, trimmed),
    onSuccess: () => {
      toast.success("Reply posted");
      setOpen(false);
      setText("");
      onChanged();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="xs" />}>Reply</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reply to review</DialogTitle>
        </DialogHeader>
        <div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Thank your guest or address their feedback…"
            maxLength={REPLY_MAX}
          />
          <div className="mt-1 flex justify-end">
            <span className="font-mono text-[11px] text-muted-foreground">
              {trimmed.length}/{REPLY_MAX}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? "Posting…" : "Post reply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({
  reviewId,
  onReported,
}: {
  reviewId: string;
  onReported: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= REPORT_MIN && trimmed.length <= REPORT_MAX;

  const mutation = useMutation({
    mutationFn: () => reviewApi.report(reviewId, trimmed),
    onSuccess: () => {
      toast.success("Report submitted");
      setOpen(false);
      onReported();
    },
    onError: (err) => {
      const message = (err as Error).message;
      if (message === "You have already reported this review") {
        toast.message("You've already reported this review");
        setOpen(false);
        onReported();
        return;
      }
      toast.error(message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="xs" className="text-muted-foreground" />}>
        Report
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this review</DialogTitle>
        </DialogHeader>
        <div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Tell us what's wrong with this review (min 10 characters)…"
            maxLength={REPORT_MAX}
          />
          <div className="mt-1 flex justify-end">
            <span className="font-mono text-[11px] text-muted-foreground">
              {trimmed.length}/{REPORT_MAX}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? "Submitting…" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
