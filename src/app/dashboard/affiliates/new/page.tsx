import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { NewAffiliateForm } from "@/features/affiliates/components/new-affiliate-form";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Add affiliate" };

export default async function NewAffiliatePage() {
  await requireAdmin();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <Link href="/dashboard/affiliates" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Affiliates
      </Link>
      <PageHeader title="Add affiliate" description="Create an approved partner without an application. A temporary password is shown once." />
      <NewAffiliateForm />
    </div>
  );
}
