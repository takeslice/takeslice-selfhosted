"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function signOutAction(formData?: FormData) {
  await auth.api.signOut({ headers: await headers() });
  redirect(formData?.get("portal") === "partners" ? "/partners/login" : "/login");
}
