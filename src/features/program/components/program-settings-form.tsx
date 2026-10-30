"use client";

import { useActionState, useState } from "react";
import { Alert, Card, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { CURRENCIES } from "@/lib/money";
import { saveProgramSettingsAction } from "@/features/program/actions";
import type { SettingsActionState } from "@/lib/action-state";

export interface ProgramFormValues {
  businessName: string;
  websiteUrl: string;
  programName: string;
  programSlug: string;
  description: string;
  terms: string;
  supportEmail: string | null;
  currency: string;
  rateType: "percent" | "fixed";
  commissionBps: number;
  commissionFixedMinor: number | null;
  attributionDays: number;
  validationDays: number;
  holdingDays: number;
  recurringMode: "first_payment" | "months" | "lifetime";
  recurringMonths: number | null;
  approvalMode: "manual" | "auto";
  couponMode: "disabled" | "manual";
  attributionConflict: "click" | "coupon";
  minimumPayoutMinor: number;
}

const initialState: SettingsActionState = {};

function amount(minor: number | null) {
  return minor === null ? "" : (minor / 100).toFixed(2);
}

export function ProgramSettingsForm({ values }: { values: ProgramFormValues }) {
  const [state, formAction, pending] = useActionState(saveProgramSettingsAction, initialState);
  const [rateType, setRateType] = useState(values.rateType);
  const [recurringMode, setRecurringMode] = useState(values.recurringMode);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">Business and program</h2>
          <p className="mt-1 text-sm text-muted-foreground">These details appear on your public partner page and in email.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" htmlFor="businessName" error={errors.businessName}>
            <Input id="businessName" name="businessName" defaultValue={values.businessName} required />
          </Field>
          <Field label="Website" htmlFor="websiteUrl" error={errors.websiteUrl} hint="Traffic is sent here.">
            <Input id="websiteUrl" name="websiteUrl" type="url" defaultValue={values.websiteUrl} required />
          </Field>
          <Field label="Program name" htmlFor="programName" error={errors.programName}>
            <Input id="programName" name="programName" defaultValue={values.programName} required />
          </Field>
          <Field label="Program URL" htmlFor="programSlug" error={errors.programSlug} hint="Used in the public partner page address.">
            <Input id="programSlug" name="programSlug" defaultValue={values.programSlug} required />
          </Field>
        </div>
        <Field label="Description" htmlFor="description" error={errors.description} hint="A short pitch shown to potential partners.">
          <Textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={values.description} />
        </Field>
        <Field label="Support email" htmlFor="supportEmail" error={errors.supportEmail} hint="Where partner questions go.">
          <Input id="supportEmail" name="supportEmail" type="email" defaultValue={values.supportEmail ?? ""} />
        </Field>
        <Field label="Terms" htmlFor="terms" error={errors.terms} hint="Shown on the application and stored with each acceptance. Markdown is displayed as plain text in v1.">
          <Textarea id="terms" name="terms" rows={6} maxLength={20_000} defaultValue={values.terms} />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">Commission</h2>
          <p className="mt-1 text-sm text-muted-foreground">The publisher keeps the full commission. TakeSlice does not take a cut of it.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency" htmlFor="currency" error={errors.currency}>
            <Select id="currency" name="currency" defaultValue={values.currency}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Commission type" htmlFor="rateType" error={errors.rateType}>
            <Select id="rateType" name="rateType" value={rateType} onChange={(event) => setRateType(event.target.value as "percent" | "fixed")}>
              <option value="percent">Percentage of sale</option>
              <option value="fixed">Fixed amount per sale</option>
            </Select>
          </Field>
          {rateType === "percent" ? (
            <Field label="Commission (%)" htmlFor="commissionPercent" error={errors.commissionPercent} hint="Between 0 and 100. Rounded to the nearest cent.">
              <Input id="commissionPercent" name="commissionPercent" type="number" min={0} max={100} step="0.01" defaultValue={(values.commissionBps / 100).toString()} />
            </Field>
          ) : (
            <Field label="Fixed commission" htmlFor="commissionFixed" error={errors.commissionFixed} hint="Paid per sale, never more than the sale itself.">
              <Input id="commissionFixed" name="commissionFixed" inputMode="decimal" defaultValue={amount(values.commissionFixedMinor)} />
            </Field>
          )}
          <Field label="Minimum payout" htmlFor="minimumPayout" error={errors.minimumPayout} hint="Affiliates can request a payout once their available balance reaches this.">
            <Input id="minimumPayout" name="minimumPayout" inputMode="decimal" defaultValue={amount(values.minimumPayoutMinor)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Recurring commissions" htmlFor="recurringMode" error={errors.recurringMode}>
            <Select id="recurringMode" name="recurringMode" value={recurringMode} onChange={(event) => setRecurringMode(event.target.value as ProgramFormValues["recurringMode"])}>
              <option value="first_payment">First payment only</option>
              <option value="months">Limited number of renewals</option>
              <option value="lifetime">Every renewal, for life</option>
            </Select>
          </Field>
          {recurringMode === "months" && (
            <Field label="Renewal months" htmlFor="recurringMonths" error={errors.recurringMonths}>
              <Input id="recurringMonths" name="recurringMonths" type="number" min={1} max={60} defaultValue={values.recurringMonths ?? 12} />
            </Field>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">Attribution and approval</h2>
          <p className="mt-1 text-sm text-muted-foreground">How long a click counts, when a commission matures and how applications are reviewed.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Attribution (days)" htmlFor="attributionDays" error={errors.attributionDays}>
            <Input id="attributionDays" name="attributionDays" type="number" min={1} max={365} defaultValue={values.attributionDays} />
          </Field>
          <Field label="Validation (days)" htmlFor="validationDays" error={errors.validationDays} hint="Refund window plus 7 days, 67 max.">
            <Input id="validationDays" name="validationDays" type="number" min={0} max={67} defaultValue={values.validationDays} />
          </Field>
          <Field label="Holding (days)" htmlFor="holdingDays" error={errors.holdingDays} hint="Extra wait before funds become available.">
            <Input id="holdingDays" name="holdingDays" type="number" min={0} max={365} defaultValue={values.holdingDays} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Applications" htmlFor="approvalMode" error={errors.approvalMode} hint="Manual review is recommended.">
            <Select id="approvalMode" name="approvalMode" defaultValue={values.approvalMode}>
              <option value="manual">Review each application</option>
              <option value="auto">Approve automatically</option>
            </Select>
          </Field>
          <Field label="Coupons" htmlFor="couponMode" error={errors.couponMode} hint="Codes are shown to approved affiliates after an admin creates them.">
            <Select id="couponMode" name="couponMode" defaultValue={values.couponMode}>
              <option value="disabled">Off</option>
              <option value="manual">Affiliate requests, admin creates</option>
            </Select>
          </Field>
          <Field
            label="When both match"
            htmlFor="attributionConflict"
            error={errors.attributionConflict}
            hint="A sale can carry a click and a coupon from different partners."
          >
            <Select id="attributionConflict" name="attributionConflict" defaultValue={values.attributionConflict}>
              <option value="click">Credit the last valid click</option>
              <option value="coupon">Credit the coupon owner</option>
            </Select>
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
