"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
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
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/auth/schemas";
import { endpoints } from "@/lib/api/endpoints";

type State = "form" | "success";

/** Client half of /forgot-password. The backend always responds 204 to avoid
 *  disclosing account existence, so a successful submit always flips to the
 *  success state; only a genuine network/server failure surfaces a toast and
 *  leaves the form in place for retry. */
export function ForgotPasswordView() {
  const [state, setState] = React.useState<State>("form");

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    try {
      await endpoints.forgotPassword(values.email);
      setState("success");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{state === "success" ? "Check your email" : "Reset your password"}</CardTitle>
          <CardDescription>
            {state === "success"
              ? "If an account exists for that email, a reset link is on its way. The link expires in 1 hour."
              : "Enter your email and we'll send you a link to reset your password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === "success" ? (
            <div className="flex flex-col items-center gap-4">
              <MailCheck className="size-10 text-emerald-500" />
              <Button nativeButton={false} className="w-full" render={<Link href="/login" />}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
