"use client";

import { useActionState } from "react";
import { Alert, Card, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { createCouponAction } from "@/features/coupons/actions";
import type { SettingsActionState } from "@/lib/action-state";

const initialState: SettingsActionState = {};

export function CouponForm({ affiliates }: { affiliates: { id: string; name: string; email: string }[] }) {
  const [state, formAction, pending] = useActionState(createCouponAction, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">Add a coupon code</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            TakeSlice records the code for attribution. Add a discount percentage to create a matching Stripe promotion code automatically when Stripe is connected in live mode.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Affiliate" htmlFor="affiliateId" error={errors.affiliateId}>
            <Select id="affiliateId" name="affiliateId" defaultValue="">
              <option value="" disabled>
                Choose an affiliate
              </option>
              {affiliates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {person.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Code" htmlFor="code" error={errors.code} hint="Letters, numbers, dashes and underscores. Saved in uppercase.">
            <Input id="code" name="code" maxLength={64} required placeholder="PAT20" autoCapitalize="characters" />
          </Field>
          <Field
            label="Discount percentage"
            htmlFor="discountPercent"
            error={errors.discountPercent}
            hint="Optional. 1–100. Used to create the Stripe promotion code."
          >
            <Input id="discountPercent" name="discountPercent" type="number" min={1} max={100} inputMode="numeric" placeholder="20" />
          </Field>
          <Field label="Discount note" htmlFor="discountText" error={errors.discountText} hint="Shown in your dashboard only.">
            <Input id="discountText" name="discountText" maxLength={80} placeholder="20% off first year" />
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding coupon..." : "Add coupon"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
