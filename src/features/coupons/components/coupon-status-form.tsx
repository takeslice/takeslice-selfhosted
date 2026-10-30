"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { syncCouponAction, toggleCouponAction } from "@/features/coupons/actions";
import type { SettingsActionState } from "@/lib/action-state";

const initialState: SettingsActionState = {};

export function CouponStatusForm({
  id,
  status,
  canSync,
  synced,
}: {
  id: string;
  status: "active" | "inactive";
  canSync: boolean;
  synced: boolean;
}) {
  const [toggleState, toggleAction, toggling] = useActionState(toggleCouponAction, initialState);
  const [syncState, syncAction, syncing] = useActionState(syncCouponAction, initialState);
  const nextStatus = status === "active" ? "inactive" : "active";
  const message = toggleState.error ?? syncState.error;
  const success = toggleState.ok ? toggleState.message : syncState.ok ? syncState.message : null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex justify-end gap-2">
        {canSync && !synced && (
          <form action={syncAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="outline" size="sm" disabled={syncing}>
              {syncing ? "Syncing…" : "Sync to Stripe"}
            </Button>
          </form>
        )}
        <form action={toggleAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={nextStatus} />
          <Button type="submit" variant="outline" size="sm" disabled={toggling}>
            {toggling ? "Saving…" : status === "active" ? "Deactivate" : "Activate"}
          </Button>
        </form>
      </div>
      {message && (
        <p role="alert" className="max-w-64 text-right text-xs text-destructive">
          {message}
        </p>
      )}
      {success && (
        <p role="status" className="max-w-64 text-right text-xs text-muted-foreground">
          {success}
        </p>
      )}
    </div>
  );
}
