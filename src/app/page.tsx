import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSetupComplete } from "@/features/setup/server/setup-token";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await connection();
  redirect((await isSetupComplete()) ? "/partners" : "/setup");
}
