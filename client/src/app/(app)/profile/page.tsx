"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { User, Lock, CreditCard, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/auth/store";
import { endpoints } from "@/lib/api/endpoints";
import { userApi } from "@/lib/api/users";

type Section = "profile" | "security" | "payments";

const NAV: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Lock },
  { id: "payments", label: "Payments", icon: CreditCard },
];

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "U";
}

export default function AccountPage() {
  const [section, setSection] = React.useState<Section>("profile");
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1040px] px-6 pt-10">
        <h1 className="mb-7 text-[28px] font-semibold tracking-tight">Account</h1>

        <div className="grid items-start gap-12 lg:grid-cols-[212px_1fr]">
          <nav className="flex gap-0.5 lg:sticky lg:top-22 lg:flex-col">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  section === id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 max-w-[640px]">
            {section === "profile" ? (
              <ProfileSection
                firstNameInit={user.firstName}
                lastNameInit={user.lastName}
                email={user.email}
              />
            ) : section === "security" ? (
              <SecuritySection />
            ) : (
              <PaymentsSection />
            )}
          </div>
        </div>

        <footer className="mt-18 flex flex-wrap items-center justify-between gap-4 border-t border-border py-8">
          <span className="font-mono text-xs text-muted-foreground">© 2026 Perch</span>
          <nav className="flex gap-5 text-[13px] text-muted-foreground">
            <a href="#">Support</a>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </nav>
        </footer>
      </main>
    </div>
  );
}

function ProfileSection({
  firstNameInit,
  lastNameInit,
  email,
}: {
  firstNameInit: string;
  lastNameInit: string;
  email: string;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = React.useState(firstNameInit);
  const [lastName, setLastName] = React.useState(lastNameInit);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clear = useAuthStore((s) => s.clear);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  async function handleLogout() {
    try {
      await endpoints.logout();
    } catch {
      // cookie cleared on server regardless
    }
    clear();
    router.push("/login");
  }

  const mutation = useMutation({
    mutationFn: () => userApi.updateProfile({ firstName, lastName }),
    onSuccess: () => {
      if (accessToken && user) {
        setAuth(accessToken, { ...user, firstName, lastName });
      }
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <Card className="p-6">
      <h2 className="text-[17px] font-semibold tracking-tight">Profile</h2>
      <p className="mb-[22px] text-sm text-muted-foreground">
        This information is shown to hosts when you book.
      </p>

      <div className="mb-[22px] flex items-center gap-4 border-b border-border pb-[22px]">
        <Avatar className="size-16 text-lg">
          <AvatarFallback>{initials(firstName, lastName)}</AvatarFallback>
        </Avatar>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-50 flex-1 flex-col gap-1.5">
            <Label htmlFor="first">First name</Label>
            <Input id="first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="flex min-w-50 flex-1 flex-col gap-1.5">
            <Label htmlFor="last">Last name</Label>
            <Input id="last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} disabled />
          <span className="text-xs text-muted-foreground">
            Email changes require verification — managed separately.
          </span>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-1.5 animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
        {mutation.isSuccess ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Check className="size-[15px]" />
            Saved
          </span>
        ) : null}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={handleLogout}>
          Sign out
        </Button>
      </div>
    </Card>
  );
}

function SecuritySection() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  const pwMutation = useMutation({
    mutationFn: () => userApi.changePassword({ currentPassword, newPassword, confirmPassword }),
    onSuccess: () => {
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (password: string) => userApi.deleteAccount(password),
    onSuccess: () => {
      clear();
      router.push("/");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="text-[17px] font-semibold tracking-tight">Change password</h2>
        <p className="mb-[22px] text-sm text-muted-foreground">
          Use at least 12 characters, including upper, lower, a number and a symbol.
        </p>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cur">Current password</Label>
            <Input
              id="cur"
              type="password"
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex min-w-50 flex-1 flex-col gap-1.5">
              <Label htmlFor="new">New password</Label>
              <Input
                id="new"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex min-w-50 flex-1 flex-col gap-1.5">
              <Label htmlFor="conf">Confirm new</Label>
              <Input
                id="conf"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        </div>
        <Button
          size="sm"
          className="mt-6"
          onClick={() => pwMutation.mutate()}
          disabled={pwMutation.isPending || !currentPassword || !newPassword}
        >
          {pwMutation.isPending ? "Updating…" : "Update password"}
        </Button>
      </Card>

      <div className="rounded-xl border border-destructive p-6">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <h2 className="mb-1 text-base font-semibold">Delete account</h2>
            <p className="max-w-95 text-sm text-muted-foreground text-pretty">
              Permanently remove your account, bookings, and saved places. This can&apos;t be undone.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleteMutation.isPending}
            onClick={() => {
              const password = prompt("Enter your password to confirm deletion:");
              if (password) deleteMutation.mutate(password);
            }}
          >
            Delete account
          </Button>
        </div>
      </div>
    </div>
  );
}

function PaymentsSection() {
  const cards = [
    { brand: "Visa", last4: "4242", exp: "08 / 27", isDefault: true },
    { brand: "Mastercard", last4: "8801", exp: "01 / 26", isDefault: false },
  ];
  return (
    <Card className="p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">Payment methods</h2>
          <p className="text-sm text-muted-foreground">Cards used for bookings and payouts.</p>
        </div>
        <Button variant="outline" size="sm">
          Add card
        </Button>
      </div>
      <div className="flex flex-col gap-2.5">
        {cards.map((c) => (
          <div
            key={c.last4}
            className="flex items-center gap-3.5 rounded-lg border border-border p-3.5"
          >
            <CreditCard className="size-[22px] text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium">
                {c.brand} ending {c.last4}
              </div>
              <div className="font-mono text-xs text-muted-foreground">Expires {c.exp}</div>
            </div>
            {c.isDefault ? <Badge variant="secondary">Default</Badge> : null}
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
