"use client";

import * as React from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils/money";
import { calculateRefundPreview } from "@/lib/utils/refund";
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

interface CancelBookingDialogProps {
  propertyTitle: string;
  checkIn: string;
  totalPrice: string | number;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  onConfirm: () => void;
  cancelling: boolean;
  triggerClassName?: string;
}

export function CancelBookingDialog({
  propertyTitle,
  checkIn,
  totalPrice,
  status,
  onConfirm,
  cancelling,
  triggerClassName,
}: CancelBookingDialogProps) {
  const [open, setOpen] = React.useState(false);
  const preview = status === "CONFIRMED" ? calculateRefundPreview(checkIn, totalPrice) : null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="destructive"
            size="sm"
            className={triggerClassName ?? "w-[100px]"}
            disabled={cancelling}
          />
        }
      >
        {cancelling ? <Loader2 className="animate-spin" /> : <X />}
        Cancel
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
          <AlertDialogDescription>
            This will cancel your reservation at {propertyTitle}. This can&apos;t be undone.
            {preview ? (
              <>
                {" "}
                {preview.refundPercent > 0
                  ? `You'll receive a ${preview.refundPercent}% refund (${formatPrice(preview.refundAmount)}).`
                  : "This is within 24 hours of check-in, so no refund applies."}
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep booking</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              // AlertDialogAction is a plain Button (no Close): close
              // explicitly so a pending mutation can't be double-fired.
              setOpen(false);
              onConfirm();
            }}
          >
            Cancel booking
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
