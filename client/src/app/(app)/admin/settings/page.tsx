"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminApi } from "@/lib/api/admin";
import { queryKeys } from "@/lib/query/keys";

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.admin.settings,
    queryFn: adminApi.getSettings,
  });

  const [enabled, setEnabled] = React.useState(false);
  const [days, setDays] = React.useState(7);

  React.useEffect(() => {
    if (data) {
      setEnabled(data.hostCancelAutoApproveEnabled);
      setDays(data.hostCancelAutoApproveDays);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      adminApi.updateSettings({
        hostCancelAutoApproveEnabled: enabled,
        hostCancelAutoApproveDays: days,
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.settings });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[680px] px-6 pt-10 pb-16">
        <h1 className="mb-1 text-3xl font-semibold tracking-tight">Platform settings</h1>
        <p className="mb-8 text-[15px] text-muted-foreground">
          Configure platform-wide behavior.
        </p>

        {isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-destructive">{(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : isPending ? (
          <div className="h-[220px] animate-pulse rounded-xl bg-muted" />
        ) : (
          <Card className="p-5">
            <h2 className="mb-1 text-[17px] font-semibold tracking-tight">
              Host cancellation auto-approval
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">
              When enabled, a pending host cancellation request is automatically approved (and
              the guest fully refunded) after it has waited this many days without a manual
              admin decision. When disabled, requests wait for a manual admin decision
              indefinitely.
            </p>

            <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
              <Label htmlFor="auto-approve-enabled">Enable auto-approval</Label>
              <Switch
                id="auto-approve-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <Label htmlFor="auto-approve-days">
                Auto-approve requests left pending for this many days.
              </Label>
              <Input
                id="auto-approve-days"
                type="number"
                min={1}
                max={90}
                value={days}
                disabled={!enabled}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-20"
              />
            </div>

            <Button
              className="mt-6"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              Save changes
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}
