import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({
      headers: new Headers(await headers()),
    });
  } catch {
    session = null;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-sm text-slate-600">
        Signed in as {session?.user?.email}. Quiz management, API keys, and history will live here.
      </p>
    </main>
  );
}
