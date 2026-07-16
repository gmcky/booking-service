import { VerifyEmailView } from "@/components/auth/verify-email-view";

export const metadata = { title: "Verify email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: raw } = await searchParams;
  const token = typeof raw === "string" && raw.length > 0 ? raw : null;

  return <VerifyEmailView token={token} />;
}
