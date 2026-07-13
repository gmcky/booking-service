"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { User, Lock, BarChart3, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/auth/store";
import { isDemoUser } from "@/lib/auth/demo";
import { endpoints } from "@/lib/api/endpoints";
import { userApi } from "@/lib/api/users";
import { pollForAvatarUpdate } from "@/lib/utils/avatar-poll";
import { formatRating } from "@/lib/utils/money";
import { queryKeys } from "@/lib/query/keys";

const BIO_MAX = 500;

type Section = "profile" | "security" | "stats";

const NAV: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Lock },
  { id: "stats", label: "Stats", icon: BarChart3 },
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
              <StatsSection />
            )}
          </div>
        </div>

        <footer className="mt-18 flex flex-wrap items-center justify-between gap-4 border-t border-border py-8">
          <span className="font-mono text-xs text-muted-foreground">© 2026 GMCK Booking</span>
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
  // GET /users/me only returns the slim CurrentUser shape (no phone/dob/bio);
  // these start blank and get filled in from the PATCH response once the
  // user saves — there's no endpoint that returns them on initial load.
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [bio, setBio] = React.useState("");
  const setAuth = useAuthStore((s) => s.setAuth);
  const clear = useAuthStore((s) => s.clear);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [avatarStatus, setAvatarStatus] = React.useState<"idle" | "uploading" | "processing">(
    "idle",
  );

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
    mutationFn: () =>
      userApi.updateProfile({
        firstName,
        lastName,
        phoneNumber: phoneNumber || undefined,
        dateOfBirth: dateOfBirth || undefined,
        bio: bio || undefined,
      }),
    onSuccess: (result) => {
      if (result.status !== 200 || !accessToken || !user) return;
      setAuth(accessToken, { ...user, firstName, lastName, avatarUrl: result.profile.avatarUrl });
      setPhoneNumber(result.profile.phoneNumber ?? "");
      setDateOfBirth(result.profile.dateOfBirth?.slice(0, 10) ?? "");
      setBio(result.profile.bio ?? "");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => userApi.updateProfile({ avatar: file }),
    onMutate: () => setAvatarStatus("uploading"),
    onSuccess: async (result) => {
      if (!accessToken || !user) return;
      if (result.status === 200) {
        setAuth(accessToken, { ...user, avatarUrl: result.profile.avatarUrl });
        toast.success("Photo updated");
        setAvatarStatus("idle");
        return;
      }
      toast.message("Uploading photo…");
      setAvatarStatus("processing");
      try {
        const fresh = await pollForAvatarUpdate(user.avatarUrl, endpoints.me);
        if (fresh) {
          setAuth(accessToken, fresh);
          toast.success("Photo updated");
        } else {
          setAuth(accessToken, await endpoints.me());
          toast.message("Still processing — check back in a moment");
        }
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setAvatarStatus("idle");
      }
    },
    onError: (err) => {
      setAvatarStatus("idle");
      toast.error((err as Error).message);
    },
  });

  const deleteAvatarMutation = useMutation({
    mutationFn: () => userApi.deleteAvatar(),
    onSuccess: () => {
      if (accessToken && user) setAuth(accessToken, { ...user, avatarUrl: null });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  function onAvatarFileChosen(files: FileList | null) {
    const file = files?.[0];
    if (file) avatarMutation.mutate(file);
  }

  return (
    <Card className="p-6">
      <h2 className="text-[17px] font-semibold tracking-tight">Profile</h2>
      <p className="mb-[22px] text-sm text-muted-foreground">
        This information is shown to hosts when you book.
      </p>

      <div className="mb-[22px] flex items-center gap-4 border-b border-border pb-[22px]">
        <Avatar className="size-16 text-lg">
          {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback>{initials(firstName, lastName)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarStatus !== "idle"}
            >
              {avatarStatus !== "idle" ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  {avatarStatus === "uploading" ? "Uploading…" : "Processing…"}
                </>
              ) : (
                "Change photo"
              )}
            </Button>
            {user?.avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => deleteAvatarMutation.mutate()}
                disabled={deleteAvatarMutation.isPending}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground">JPEG, PNG or WebP</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => onAvatarFileChosen(e.target.files)}
        />
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
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-50 flex-1 flex-col gap-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>
          <div className="flex min-w-50 flex-1 flex-col gap-1.5">
            <Label htmlFor="dob">Date of birth</Label>
            <Input
              id="dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell hosts a bit about yourself"
            maxLength={BIO_MAX}
          />
          <span className="self-end font-mono text-[11px] text-muted-foreground">
            {bio.length}/{BIO_MAX}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} disabled />
          {isDemoUser(email) ? (
            <p className="text-[13px] text-muted-foreground">
              The shared demo account can&apos;t change its email.
            </p>
          ) : (
            <EmailChangeDialog currentEmail={email} />
          )}
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

function EmailChangeDialog({ currentEmail }: { currentEmail: string }) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"request" | "confirm">("request");
  const [newEmail, setNewEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  function reset() {
    setStep("request");
    setNewEmail("");
    setOtp("");
  }

  const requestMutation = useMutation({
    mutationFn: () => userApi.requestEmailChange(newEmail),
    onSuccess: () => {
      toast.success("Verification code sent");
      setStep("confirm");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const confirmMutation = useMutation({
    mutationFn: () => userApi.confirmEmailChange(otp),
    onSuccess: () => {
      if (accessToken && user) setAuth(accessToken, { ...user, email: newEmail });
      toast.success("Email updated");
      setOpen(false);
      reset();
    },
    onError: (err) => {
      const message = (err as Error).message;
      toast.error(message);
      // 5 wrong attempts kills the whole OTP — no point staying on step 2.
      if (message.toLowerCase().includes("too many")) reset();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          requestMutation.reset();
          confirmMutation.reset();
        }
      }}
    >
      <DialogTrigger render={<Button variant="link" size="sm" className="h-auto w-fit p-0" />}>
        Change email
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change email</DialogTitle>
          <DialogDescription>
            {step === "request"
              ? `Currently ${currentEmail}. We'll send a code to confirm the new address.`
              : `Enter the 6-digit code sent to ${newEmail}.`}
          </DialogDescription>
        </DialogHeader>

        {step === "request" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-email">New email</Label>
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoFocus
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otp">Verification code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
            />
          </div>
        )}

        <DialogFooter>
          {step === "request" ? (
            <Button
              onClick={() => requestMutation.mutate()}
              disabled={!newEmail || requestMutation.isPending}
            >
              {requestMutation.isPending ? "Sending…" : "Send code"}
            </Button>
          ) : (
            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={otp.length !== 6 || confirmMutation.isPending}
            >
              {confirmMutation.isPending ? "Confirming…" : "Confirm"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecuritySection() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const demo = isDemoUser(useAuthStore((s) => s.user?.email));
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deletePassword, setDeletePassword] = React.useState("");

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
  });

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="text-[17px] font-semibold tracking-tight">Change password</h2>
        <p className="mb-[22px] text-sm text-muted-foreground">
          {demo
            ? "The shared demo account can't change its password."
            : "Use at least 12 characters, including upper, lower, a number and a symbol."}
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
              disabled={demo}
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
                disabled={demo}
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
                disabled={demo}
              />
            </div>
          </div>
        </div>
        <Button
          size="sm"
          className="mt-6"
          onClick={() => pwMutation.mutate()}
          disabled={demo || pwMutation.isPending || !currentPassword || !newPassword}
        >
          {pwMutation.isPending ? "Updating…" : "Update password"}
        </Button>
      </Card>

      <div className="rounded-xl border border-destructive p-6">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <h2 className="mb-1 text-base font-semibold">Delete account</h2>
            <p className="max-w-95 text-sm text-muted-foreground text-pretty">
              {demo
                ? "The shared demo account can't be deleted."
                : "Permanently remove your account, bookings, and saved places. This can't be undone."}
            </p>
          </div>
          {demo ? (
            <Button variant="destructive" size="sm" disabled>
              Delete account
            </Button>
          ) : (
          <AlertDialog
            open={deleteOpen}
            onOpenChange={(open) => {
              setDeleteOpen(open);
              if (!open) {
                setDeletePassword("");
                deleteMutation.reset();
              }
            }}
          >
            <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
              Delete account
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes your account, bookings, and saved places. This
                  can&apos;t be undone. Enter your password to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="delete-password">Password</Label>
                <Input
                  id="delete-password"
                  type="password"
                  placeholder="••••••••"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  autoFocus
                />
                {deleteMutation.isError ? (
                  <p className="text-sm text-destructive">
                    {(deleteMutation.error as Error).message}
                  </p>
                ) : null}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={!deletePassword || deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(deletePassword)}
                >
                  {deleteMutation.isPending ? "Deleting…" : "Delete account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsSection() {
  const { data, isPending } = useQuery({
    queryKey: queryKeys.users.stats,
    queryFn: () => userApi.getStats(),
  });

  const tiles = data
    ? [
        { label: "Completed stays", value: String(data.completedBookingsCount) },
        { label: "Nights stayed", value: String(data.completedNights) },
        { label: "Rating as guest", value: formatRating(data.averageRatingAsGuest) ?? "—" },
        { label: "Rating as host", value: formatRating(data.averageRatingAsHost) ?? "—" },
        { label: "Listings", value: String(data.listingsCount) },
      ]
    : [];

  return (
    <Card className="p-6">
      <h2 className="text-[17px] font-semibold tracking-tight">Stats</h2>
      <p className="mb-[22px] text-sm text-muted-foreground">
        A summary of your activity as a guest and host.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {isPending
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))
          : tiles.map((tile) => (
              <div key={tile.label} className="rounded-lg border border-border p-4">
                <div className="text-2xl font-semibold tracking-tight">{tile.value}</div>
                <div className="mt-1 text-[13px] text-muted-foreground">{tile.label}</div>
              </div>
            ))}
      </div>
    </Card>
  );
}
