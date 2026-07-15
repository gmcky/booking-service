"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, MapPin } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import {
  adminApi,
  type HostCancellationRequestItem,
  type HostCancellationStatus,
} from "@/lib/api/admin";
import { formatPrice } from "@/lib/utils/money";
import { formatRange } from "@/lib/utils/dates";
import { queryKeys } from "@/lib/query/keys";

type StatusFilter = "ALL" | HostCancellationStatus;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "VOIDED", label: "Voided" },
];

function requestBadge(status: HostCancellationStatus) {
  switch (status) {
    case "PENDING":
      return { variant: "outline" as const, label: "Pending" };
    case "APPROVED":
      return { variant: "default" as const, label: "Approved" };
    case "REJECTED":
      return { variant: "destructive" as const, label: "Rejected" };
    case "VOIDED":
      return { variant: "secondary" as const, label: "Voided" };
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminHostCancellationsPage() {
  const [status, setStatus] = React.useState<StatusFilter>("PENDING");
  const queryClient = useQueryClient();

  const query = { status: status === "ALL" ? undefined : status };

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.admin.hostCancellations(query),
    queryFn: () => adminApi.hostCancellations(query),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "host-cancellations"] });

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminApi.approveHostCancellation(id),
    onSuccess: () => {
      toast.success("Cancellation approved. Guest refunded in full");
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminApi.rejectHostCancellation(id, reason),
    onSuccess: () => {
      toast.success("Request rejected");
      invalidate();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const requests = data?.data ?? [];
  const count = data?.pagination.total ?? requests.length;
  const busy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1120px] px-6 pt-10 pb-16">
        <h1 className="mb-1 text-3xl font-semibold tracking-tight">Host cancellations</h1>
        <p className="mb-6 text-[15px] text-muted-foreground">
          {isPending ? "Loading requests…" : `${count} ${count === 1 ? "request" : "requests"}`}
        </p>

        <div className="mb-6 flex gap-6 border-b border-border">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatus(t.value)}
              className={`relative py-3.5 text-sm font-medium transition-colors ${
                status === t.value
                  ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-destructive">{(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : isPending ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-[168px] animate-pulse rounded-xl border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-4">
            {requests.map((r) => (
              <RequestRow
                key={r.id}
                request={r}
                onApprove={() => approveMutation.mutate(r.id)}
                onReject={(reason) => rejectMutation.mutate({ id: r.id, reason })}
                busy={busy}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function RequestRow({
  request,
  onApprove,
  onReject,
  busy,
}: {
  request: HostCancellationRequestItem;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  busy: boolean;
}) {
  const badge = requestBadge(request.status);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(request.createdAt)}
            </span>
          </div>
          <div className="text-[17px] font-semibold tracking-tight">
            {request.booking.property.title}
          </div>
          <div className="flex flex-wrap items-center gap-3.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {request.booking.property.city}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {formatRange(request.booking.checkIn, request.booking.checkOut)}
            </span>
          </div>
          <div className="mt-0.5 text-sm">
            <span className="text-muted-foreground">Guest</span>{" "}
            <strong className="font-semibold">
              {request.booking.user.firstName} {request.booking.user.lastName}
            </strong>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">Host</span>{" "}
            <strong className="font-semibold">
              {request.requestedBy.firstName} {request.requestedBy.lastName}
            </strong>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">Total</span>{" "}
            <strong className="font-semibold">{formatPrice(request.booking.totalPrice)}</strong>
          </div>
          <p className="mt-1 max-w-[560px] text-sm text-muted-foreground">{request.reason}</p>
        </div>

        {request.status === "PENDING" ? (
          <div className="flex flex-none gap-2">
            <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
              <AlertDialogTrigger
                render={<Button variant="outline" size="sm" disabled={busy} />}
              >
                Reject
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reject this cancellation request?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The booking stays confirmed. You can optionally leave a reason for the host.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="min-h-20"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Never mind</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      setRejectOpen(false);
                      onReject(rejectReason.trim() || undefined);
                      setRejectReason("");
                    }}
                  >
                    Reject request
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
              <AlertDialogTrigger render={<Button variant="default" size="sm" disabled={busy} />}>
                Approve
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Approve this cancellation?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cancels the booking at {request.booking.property.title} and refunds the
                    guest in full. This can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Never mind</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setApproveOpen(false);
                      onApprove();
                    }}
                  >
                    Approve
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border px-6 py-18 text-center">
      <div className="mb-4 flex size-13 items-center justify-center rounded-full border border-border text-muted-foreground">
        <Calendar className="size-5" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">No requests</h2>
      <p className="mt-1.5 max-w-[320px] text-sm text-muted-foreground text-pretty">
        Host-initiated cancellation requests will show up here.
      </p>
    </div>
  );
}
