"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { registerSchema, type RegisterInput } from "@/lib/auth/schemas";
import { useAuthStore } from "@/lib/auth/store";
import { endpoints } from "@/lib/api/endpoints";
import { safeReturnTo } from "@/lib/utils/return-to";
import { cn } from "@/lib/utils";

// Backend rejects passwords scoring below 3 on zxcvbn's 0-4 scale
// (see server/src/modules/auth/auth.validators.ts). Mirror the gate here so
// users get feedback before submitting instead of a generic 400.
const MIN_PASSWORD_SCORE = 3;
const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_BAR_COLORS = [
  "bg-destructive",
  "bg-destructive",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-emerald-500",
];
const STRENGTH_TEXT_COLORS = [
  "text-destructive",
  "text-destructive",
  "text-amber-600",
  "text-emerald-600",
  "text-emerald-600",
];

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [score, setScore] = useState<number | null>(null);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
  });

  const password = form.watch("password");

  // Debounced, lazily-loaded scoring: zxcvbn's word lists are ~800kb, so it's
  // dynamically imported instead of bundled into the initial page load.
  useEffect(() => {
    if (!password) {
      setScore(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      import("zxcvbn").then(({ default: zxcvbn }) => {
        if (!cancelled) setScore(zxcvbn(password).score);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [password]);

  async function onSubmit(values: RegisterInput) {
    form.clearErrors("root");

    // Re-check synchronously at submit time rather than trusting the
    // debounced display state, which may be stale if the user submits fast.
    const { default: zxcvbn } = await import("zxcvbn");
    const finalScore = zxcvbn(values.password).score;
    setScore(finalScore);
    if (finalScore < MIN_PASSWORD_SCORE) {
      form.setError("password", {
        type: "manual",
        message: "Password is too weak or common. Please use a stronger password.",
      });
      return;
    }

    try {
      const { accessToken, user } = await endpoints.register(values);
      setAuth(accessToken, user);
      router.replace(safeReturnTo(searchParams.get("returnTo")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      form.setError("root", { type: "manual", message });
      toast.error(message);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {form.formState.errors.root?.message ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {form.formState.errors.root.message}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First name</FormLabel>
                <FormControl>
                  <Input placeholder="Jane" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last name</FormLabel>
                <FormControl>
                  <Input placeholder="Smith" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Min 8 characters" {...field} />
              </FormControl>
              <div className="mt-1.5 flex gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full bg-muted transition-colors",
                      score !== null && score > i && STRENGTH_BAR_COLORS[score],
                    )}
                  />
                ))}
              </div>
              {score !== null && password ? (
                <p className={cn("text-xs", STRENGTH_TEXT_COLORS[score])}>
                  {STRENGTH_LABELS[score]}
                </p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </Form>
  );
}
