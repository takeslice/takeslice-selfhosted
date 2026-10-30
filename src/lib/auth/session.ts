import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "@/lib/auth";

export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireAdmin(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/partners/dashboard");
  return session;
}

export async function requireAffiliate(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/partners/login");
  if (session.user.role !== "affiliate") redirect("/dashboard");
  return session;
}
