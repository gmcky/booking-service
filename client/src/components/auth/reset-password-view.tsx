"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/auth/schemas";
import { endpoints } from "@/lib/api/endpoints";

type State = "form" | "success";

/** Client half of /reset-password. A missing token (no query param) is an
 *  immediate error state, mirroring VerifyEmailView. A present token renders
 *  the form; a 400 from the backend (invalid/expired token, weak password)
 *  surfaces inline as a root form error rather than a separate page state. */
export function ResetPasswordView({ token }: { token: string | null }) {
  const [state, setState] = React.useState<State>("form");

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: ResetPasswordInput) {
    if (!token) return;
    form.clearErrors("root");
    try {
      await endpoints.resetPassword(token, values.newPassword);
      setState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      form.setError("root", { type: "manual", message });
    }
  }

  if (!token) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Invalid reset link</CardTitle>
            <CardDescription>This password reset link is invalid or has expired.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <XCircle className="size-10 text-destructive" />
            <Button
              nativeButton={false}
              className="w-full"
              render={<Link href="/forgot-password" />}
            >
              Request a new link
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{state === "success" ? "Password updated" : "Set a new password"}</CardTitle>
          <CardDescription>
            {state === "success"
              ? "All your sessions have been signed out."
              : "Choose a new password for your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === "success" ? (
            <div className="flex flex-col items-center gap-4">
              <CheckCircle2 className="size-10 text-emerald-500" />
              <Button nativeButton={false} className="w-full" render={<Link href="/login" />}>
                Sign in
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {form.formState.errors.root?.message ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <p role="alert">{form.formState.errors.root.message}</p>
                    <Link href="/forgot-password" className="underline underline-offset-4">
                      Request a new link
                    </Link>
                  </div>
                ) : null}

                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Min 8 characters" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Re-enter your password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Updating…" : "Update password"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
