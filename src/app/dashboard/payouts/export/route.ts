import { payableBalancesCsv } from "@/features/payouts/server/export";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await requireAdmin();
  const csv = await payableBalancesCsv();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="takeslice-payable-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
