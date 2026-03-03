import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminSessionOrNull } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSessionOrNull();
  if (!session) redirect("/");

  return <AdminShell userLabel={session.user.email}>{children}</AdminShell>;
}

