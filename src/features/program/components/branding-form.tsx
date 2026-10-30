"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { Alert, Card, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeLogoAction, saveBrandingAction, uploadLogoAction } from "@/features/program/actions";
import type { SettingsActionState } from "@/lib/action-state";

const initialState: SettingsActionState = {};

export function BrandingForm({
  brandColor,
  hideBranding,
  logoUrl,
  businessName,
  programName,
}: {
  brandColor: string;
  hideBranding: boolean;
  logoUrl: string | null;
  businessName: string;
  programName: string;
}) {
  const router = useRouter();
  const [saveState, saveAction, saving] = useActionState(saveBrandingAction, initialState);
  const [uploadState, uploadAction, uploading] = useActionState(uploadLogoAction, initialState);
  const [removeState, removeAction, removing] = useActionState(removeLogoAction, initialState);
  const [color, setColor] = useState(brandColor);
  const [previewHidden, setPreviewHidden] = useState(hideBranding);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saveState.ok || uploadState.ok || removeState.ok) router.refresh();
  }, [saveState.ok, uploadState.ok, removeState.ok, router]);

  useEffect(() => {
    if (uploadState.ok && fileRef.current) fileRef.current.value = "";
  }, [uploadState.ok]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-medium">Logo</h2>
            <p className="mt-1 text-sm text-muted-foreground">PNG, JPEG or WebP, up to 2 MB. It is resized and re-encoded to keep uploads safe.</p>
          </div>
          {uploadState.error && <Alert tone="error">{uploadState.error}</Alert>}
          {uploadState.ok && uploadState.message && <Alert tone="success">{uploadState.message}</Alert>}
          <form action={uploadAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Image file" htmlFor="logo" className="flex-1">
              <Input ref={fileRef} id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
            </Field>
            <Button type="submit" disabled={uploading}>
              <ImagePlus /> {uploading ? "Uploading..." : "Upload logo"}
            </Button>
          </form>
          {logoUrl && (
            <form action={removeAction} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span className="text-sm text-muted-foreground">Remove the current logo.</span>
              <Button type="submit" variant="outline" size="sm" disabled={removing}>
                <Trash2 /> {removing ? "Removing..." : "Remove"}
              </Button>
            </form>
          )}
          {removeState.error && <Alert tone="error">{removeState.error}</Alert>}
        </Card>

        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-medium">Colour and attribution</h2>
            <p className="mt-1 text-sm text-muted-foreground">The colour drives buttons and highlights on your public partner page.</p>
          </div>
          {saveState.error && <Alert tone="error">{saveState.error}</Alert>}
          {saveState.ok && saveState.message && <Alert tone="success">{saveState.message}</Alert>}
          <form action={saveAction} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
              <Field label="Colour" htmlFor="brandColorPicker">
                <Input
                  id="brandColorPicker"
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#3187ee"}
                  aria-label="Pick brand colour"
                  className="h-10 cursor-pointer p-1"
                  onChange={(event) => setColor(event.target.value)}
                />
              </Field>
              <Field label="Hex value" htmlFor="brandColor" error={saveState.fieldErrors?.brandColor} hint="Six-digit hex, for example #3187ee.">
                <Input id="brandColor" name="brandColor" value={color} onChange={(event) => setColor(event.target.value)} required pattern="#[0-9a-fA-F]{6}" />
              </Field>
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input type="checkbox" name="hideBranding" checked={previewHidden} onChange={(event) => setPreviewHidden(event.target.checked)} className="mt-0.5 size-4" />
              <span>
                <span className="font-medium">Hide “Powered by TakeSlice”</span>
                <span className="mt-0.5 block text-muted-foreground">Removes the footer credit from your public partner page.</span>
              </span>
            </label>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save branding"}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card className="flex flex-col gap-4" style={{ borderColor: color }}>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-background p-6 text-center" style={{ borderColor: `${color}55` }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded images are served through our own route
              <img src={logoUrl} alt={`${businessName} logo`} className="max-h-16 max-w-[200px] object-contain" />
            ) : (
              <span className="flex size-12 items-center justify-center rounded-xl text-lg font-semibold text-white" style={{ backgroundColor: color }}>
                {businessName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <p className="font-semibold">{programName}</p>
              <p className="text-sm text-muted-foreground">Earn with {businessName}</p>
            </div>
            <span className="mt-1 inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-white" style={{ backgroundColor: color }}>
              Apply to join
            </span>
          </div>
          {!previewHidden && <p className="text-center text-xs text-muted-foreground">Powered by TakeSlice</p>}
        </Card>
      </div>
    </div>
  );
}
