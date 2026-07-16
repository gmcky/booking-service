import { ResetPasswordView } from "@/components/auth/reset-password-view";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: raw } = await searchParams;
  const token = typeof raw === "string" && raw.length > 0 ? raw : null;

  return <ResetPasswordView token={token} />;
}
