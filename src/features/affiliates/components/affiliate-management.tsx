"use client";

import { useActionState, useState } from "react";
import { Alert, Card, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  reactivateAffiliateAction,
  saveAffiliateAction,
  saveOverrideAction,
  suspendAffiliateAction,
  type ManageActionState,
} from "@/features/affiliates/actions";

const initial: ManageActionState = {};

interface Props {
  affiliate: {
    id: string;
    displayName: string;
    websiteUrl: string | null;
    country: string | null;
    notes: string | null;
    status: "pending" | "approved" | "rejected" | "suspended";
    commissionOverrideBps: number | null;
    suspensionReason: string | null;
  };
}

export function AffiliateManagement({ affiliate }: Props) {
  const [profileState, saveProfile, savingProfile] = useActionState(saveAffiliateAction, initial);
  const [overrideState, saveOverride, savingOverride] = useActionState(saveOverrideAction, initial);
  const [suspendState, suspend, suspending] = useActionState(suspendAffiliateAction, initial);
  const [reactivateState, reactivate, reactivating] = useActionState(reactivateAffiliateAction, initial);
  const [showSuspend, setShowSuspend] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-medium">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">Details the affiliate can see. Internal notes stay admin-only.</p>
        {profileState.error && (
          <div className="mt-3">
            <Alert tone="error">{profileState.error}</Alert>
          </div>
        )}
        {profileState.ok && profileState.message && (
          <div className="mt-3">
            <Alert tone="success">{profileState.message}</Alert>
          </div>
        )}
        <form action={saveProfile} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={affiliate.id} />
          <Field label="Display name" htmlFor="displayName" error={profileState.fieldErrors?.displayName}>
            <Input id="displayName" name="displayName" defaultValue={affiliate.displayName} required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Website" htmlFor="websiteUrl" error={profileState.fieldErrors?.websiteUrl}>
              <Input id="websiteUrl" name="websiteUrl" type="url" defaultValue={affiliate.websiteUrl ?? ""} />
            </Field>
            <Field label="Country" htmlFor="country" error={profileState.fieldErrors?.country}>
              <Input id="country" name="country" defaultValue={affiliate.country ?? ""} />
            </Field>
          </div>
          <Field label="Internal notes" htmlFor="notes" error={profileState.fieldErrors?.notes}>
            <Textarea id="notes" name="notes" className="min-h-20" defaultValue={affiliate.notes ?? ""} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="outline" disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="font-medium">Commission override</h2>
        <p className="mt-1 text-sm text-muted-foreground">Leave empty to use the program rate. A percentage here applies to this affiliate only.</p>
        {overrideState.error && (
          <div className="mt-3">
            <Alert tone="error">{overrideState.error}</Alert>
          </div>
        )}
        {overrideState.ok && overrideState.message && (
          <div className="mt-3">
            <Alert tone="success">{overrideState.message}</Alert>
          </div>
        )}
        <form action={saveOverride} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={affiliate.id} />
          <Field label="Override percent" htmlFor="overridePercent" error={overrideState.fieldErrors?.overridePercent} className="max-w-40">
            <Input
              id="overridePercent"
              name="overridePercent"
              inputMode="decimal"
              placeholder="Program rate"
              defaultValue={affiliate.commissionOverrideBps !== null ? String(affiliate.commissionOverrideBps / 100) : ""}
            />
          </Field>
          <Button type="submit" variant="outline" disabled={savingOverride}>
            {savingOverride ? "Saving..." : "Save override"}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-medium">Account status</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {affiliate.status === "approved"
            ? "Suspending stops their links from earning. Their history is kept."
            : affiliate.status === "suspended"
              ? "Reactivating restores their links and dashboard access."
              : "This affiliate is not active. Approve their application from the applications queue."}
        </p>
        {affiliate.status === "suspended" && affiliate.suspensionReason && (
          <p className="mt-2 rounded-lg border bg-muted/40 p-3 text-sm">Suspended: {affiliate.suspensionReason}</p>
        )}
        {suspendState.error && (
          <div className="mt-3">
            <Alert tone="error">{suspendState.error}</Alert>
          </div>
        )}
        {suspendState.ok && suspendState.message && (
          <div className="mt-3">
            <Alert tone="success">{suspendState.message}</Alert>
          </div>
        )}
        {reactivateState.error && (
          <div className="mt-3">
            <Alert tone="error">{reactivateState.error}</Alert>
          </div>
        )}
        {reactivateState.ok && reactivateState.message && (
          <div className="mt-3">
            <Alert tone="success">{reactivateState.message}</Alert>
          </div>
        )}

        {affiliate.status === "approved" && (
          <div className="mt-4">
            {!showSuspend ? (
              <Button type="button" variant="outline" onClick={() => setShowSuspend(true)}>
                Suspend affiliate
              </Button>
            ) : (
              <form action={suspend} className="space-y-3">
                <input type="hidden" name="id" value={affiliate.id} />
                <Field label="Reason" htmlFor="suspend-reason" error={suspendState.fieldErrors?.reason}>
                  <Textarea id="suspend-reason" name="reason" className="min-h-20" placeholder="Why is this affiliate suspended?" required />
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" variant="destructive" disabled={suspending}>
                    {suspending ? "Suspending..." : "Suspend affiliate"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowSuspend(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {affiliate.status === "suspended" && (
          <form action={reactivate} className="mt-4">
            <input type="hidden" name="id" value={affiliate.id} />
            <Button type="submit" disabled={reactivating}>
              {reactivating ? "Reactivating..." : "Reactivate affiliate"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
