import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({
      headers: new Headers(await headers()),
    });
  } catch {
    session = null;
  }

  if (!session?.user?.id) {
    redirect("/sign-in?callbackURL=/admin");
  }

  if (!isAdminEmail(session.user.email)) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}

