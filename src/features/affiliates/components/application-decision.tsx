"use client";

import { useActionState } from "react";
import { Alert, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { approveApplicationAction, rejectApplicationAction } from "@/features/applications/actions";
import type { SettingsActionState } from "@/lib/action-state";

const initial: SettingsActionState = {};

export function ApplicationDecision({ applicationId }: { applicationId: string }) {
  const [approveState, approve, approving] = useActionState(approveApplicationAction, initial);
  const [rejectState, reject, rejecting] = useActionState(rejectApplicationAction, initial);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border p-5">
        <h2 className="font-medium">Approve</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This creates the affiliate&apos;s referral code, updates their dashboard and emails them the decision.
        </p>
        {approveState.error && (
          <div className="mt-3">
            <Alert tone="error">{approveState.error}</Alert>
          </div>
        )}
        {approveState.ok && approveState.message && (
          <div className="mt-3">
            <Alert tone="success">{approveState.message}</Alert>
          </div>
        )}
        <form action={approve} className="mt-4">
          <input type="hidden" name="id" value={applicationId} />
          <Button type="submit" disabled={approving}>
            {approving ? "Approving..." : "Approve application"}
          </Button>
        </form>
      </div>

      <div className="rounded-xl border p-5">
        <h2 className="font-medium">Not a fit</h2>
        <p className="mt-1 text-sm text-muted-foreground">The applicant sees this reason. They can apply again after 30 days.</p>
        {rejectState.error && (
          <div className="mt-3">
            <Alert tone="error">{rejectState.error}</Alert>
          </div>
        )}
        {rejectState.ok && rejectState.message && (
          <div className="mt-3">
            <Alert tone="success">{rejectState.message}</Alert>
          </div>
        )}
        <form action={reject} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="id" value={applicationId} />
          <Field label="Reason" htmlFor="reject-reason" error={rejectState.fieldErrors?.reason}>
            <Textarea id="reject-reason" name="reason" className="min-h-20" placeholder="Explain what was missing or why this is not a fit." required />
          </Field>
          <Button type="submit" variant="outline" disabled={rejecting}>
            {rejecting ? "Rejecting..." : "Reject application"}
          </Button>
        </form>
      </div>
    </div>
  );
}
