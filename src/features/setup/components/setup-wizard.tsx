"use client";

import { useActionState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { Alert, Card, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { submitSetupAction, type SetupActionState } from "@/features/setup/actions";
import { CURRENCIES } from "@/lib/money";

const STEPS = ["Business", "Admin", "Program", "Email"] as const;
const initialState: SetupActionState = {};

export function SetupWizard({ appUrl }: { appUrl: string }) {
  const [step, setStep] = useState(0);
  const [state, formAction, pending] = useActionState(submitSetupAction, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <Card className="w-full max-w-2xl">
      <ol className="mb-6 flex gap-2" aria-label="Setup progress">
        {STEPS.map((label, index) => (
          <li key={label} className="flex-1">
            <span
              className={`mb-1 block h-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`}
              aria-hidden="true"
            />
            <span className={`text-xs ${index === step ? "font-semibold" : "text-muted-foreground"}`}>
              {index + 1}. {label}
              {index < step && <Check className="ml-1 inline size-3" aria-label="completed" />}
            </span>
          </li>
        ))}
      </ol>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <form action={formAction} className="mt-4 flex flex-col gap-4" noValidate>
        <fieldset hidden={step !== 0} className="flex flex-col gap-4">
          <legend className="mb-2 text-lg font-semibold">Your business</legend>
          <Field label="Business name" htmlFor="businessName" error={errors.businessName}>
            <Input id="businessName" name="businessName" autoComplete="organization" required aria-invalid={Boolean(errors.businessName)} />
          </Field>
          <Field label="Website" htmlFor="websiteUrl" error={errors.websiteUrl} hint="Affiliates send traffic here. Include https://">
            <Input id="websiteUrl" name="websiteUrl" type="url" placeholder="https://example.com" required aria-invalid={Boolean(errors.websiteUrl)} />
          </Field>
          <Field label="Program name" htmlFor="programName" error={errors.programName} hint="Shown on the public partner page.">
            <Input id="programName" name="programName" required aria-invalid={Boolean(errors.programName)} />
          </Field>
          <Field label="Program handle" htmlFor="programSlug" error={errors.programSlug} hint={`Identifies your program. Your public partner page is ${appUrl}/partners.`}>
            <Input id="programSlug" name="programSlug" placeholder="acme" required aria-invalid={Boolean(errors.programSlug)} />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description} hint="A short pitch for your program. Optional.">
            <Textarea id="description" name="description" rows={3} maxLength={2000} />
          </Field>
          <Field label="Support email" htmlFor="supportEmail" error={errors.supportEmail} hint="Where partner questions go. Optional.">
            <Input id="supportEmail" name="supportEmail" type="email" autoComplete="email" />
          </Field>
        </fieldset>

        <fieldset hidden={step !== 1} className="flex flex-col gap-4">
          <legend className="mb-2 text-lg font-semibold">Your admin account</legend>
          <Field label="Your name" htmlFor="adminName" error={errors.adminName}>
            <Input id="adminName" name="adminName" autoComplete="name" required aria-invalid={Boolean(errors.adminName)} />
          </Field>
          <Field label="Email" htmlFor="adminEmail" error={errors.adminEmail}>
            <Input id="adminEmail" name="adminEmail" type="email" autoComplete="email" required aria-invalid={Boolean(errors.adminEmail)} />
          </Field>
          <Field label="Password" htmlFor="adminPassword" error={errors.adminPassword} hint="At least 10 characters, with a letter and a number.">
            <Input id="adminPassword" name="adminPassword" type="password" autoComplete="new-password" required aria-invalid={Boolean(errors.adminPassword)} />
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword}>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required aria-invalid={Boolean(errors.confirmPassword)} />
          </Field>
          <p className="text-sm text-muted-foreground">This creates the only account with admin access. Keep its credentials safe.</p>
        </fieldset>

        <fieldset hidden={step !== 2} className="flex flex-col gap-4">
          <legend className="mb-2 text-lg font-semibold">Program rules</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency" htmlFor="currency" error={errors.currency}>
              <Select id="currency" name="currency" defaultValue="EUR">
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Approval" htmlFor="approvalMode" error={errors.approvalMode} hint="Manual review is recommended.">
              <Select id="approvalMode" name="approvalMode" defaultValue="manual">
                <option value="manual">Review each application</option>
                <option value="auto">Approve automatically</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Commission type" htmlFor="rateType" error={errors.rateType}>
              <Select id="rateType" name="rateType" defaultValue="percent">
                <option value="percent">Percentage of sale</option>
                <option value="fixed">Fixed amount per sale</option>
              </Select>
            </Field>
            <Field label="Commission (%)" htmlFor="commissionPercent" error={errors.commissionPercent}>
              <Input id="commissionPercent" name="commissionPercent" type="number" min={0} max={100} step="0.1" defaultValue={20} />
            </Field>
            <Field label="Fixed commission" htmlFor="commissionFixed" error={errors.commissionFixed} hint="Used when the type is fixed.">
              <Input id="commissionFixed" name="commissionFixed" inputMode="decimal" placeholder="10.00" />
            </Field>
            <Field label="Minimum payout" htmlFor="minimumPayout" error={errors.minimumPayout}>
              <Input id="minimumPayout" name="minimumPayout" inputMode="decimal" defaultValue="50" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Attribution (days)" htmlFor="attributionDays" error={errors.attributionDays}>
              <Input id="attributionDays" name="attributionDays" type="number" min={1} max={365} defaultValue={30} />
            </Field>
            <Field label="Validation (days)" htmlFor="validationDays" error={errors.validationDays}>
              <Input id="validationDays" name="validationDays" type="number" min={0} max={67} defaultValue={30} />
            </Field>
            <Field label="Holding (days)" htmlFor="holdingDays" error={errors.holdingDays} hint="Extra wait before payout.">
              <Input id="holdingDays" name="holdingDays" type="number" min={0} max={365} defaultValue={0} />
            </Field>
          </div>
        </fieldset>

        <fieldset hidden={step !== 3} className="flex flex-col gap-4">
          <legend className="mb-2 text-lg font-semibold">Email (recommended)</legend>
          <p className="text-sm text-muted-foreground">
            Required for partner sign-up verification, password resets and notifications. Without SMTP, partners cannot verify
            their email or sign in. You can add it later under Settings, Email.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SMTP host" htmlFor="smtpHost" error={errors.smtpHost}>
              <Input id="smtpHost" name="smtpHost" placeholder="smtp.example.com" />
            </Field>
            <Field label="Port" htmlFor="smtpPort" error={errors.smtpPort}>
              <Input id="smtpPort" name="smtpPort" type="number" defaultValue={465} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username" htmlFor="smtpUser" error={errors.smtpUser}>
              <Input id="smtpUser" name="smtpUser" autoComplete="username" />
            </Field>
            <Field label="Password" htmlFor="smtpPassword" error={errors.smtpPassword}>
              <Input id="smtpPassword" name="smtpPassword" type="password" autoComplete="current-password" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sender name" htmlFor="smtpFromName" error={errors.smtpFromName}>
              <Input id="smtpFromName" name="smtpFromName" defaultValue="TakeSlice" />
            </Field>
            <Field label="Sender address" htmlFor="smtpFromEmail" error={errors.smtpFromEmail}>
              <Input id="smtpFromEmail" name="smtpFromEmail" type="email" placeholder="partners@example.com" />
            </Field>
          </div>
          <Field label="Connection" htmlFor="smtpSecure" error={errors.smtpSecure}>
            <Select id="smtpSecure" name="smtpSecure" defaultValue="true">
              <option value="true">TLS on connect (port 465)</option>
              <option value="false">STARTTLS (port 587)</option>
            </Select>
          </Field>
        </fieldset>

        <div className="mt-2 flex justify-between gap-3">
          <Button variant="outline" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || pending} type="button">
            <ArrowLeft /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button key="next" onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))} type="button">
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button key="submit" type="submit" disabled={pending}>
              {pending ? "Setting up..." : "Finish setup"}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
