"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth/store";
import { endpoints } from "@/lib/api/endpoints";

export default function ProfilePage() {
  const { user, clear } = useAuthStore();
  const router = useRouter();

  async function handleLogout() {
    try {
      await endpoints.logout();
    } catch {
      // cookie cleared on server regardless
    }
    clear();
    router.push("/login");
  }

  if (!user) return null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Name: </span>
              {user.name}
            </p>
            <p>
              <span className="text-muted-foreground">Email: </span>
              {user.email}
            </p>
            <p>
              <span className="text-muted-foreground">Role: </span>
              {user.role}
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
