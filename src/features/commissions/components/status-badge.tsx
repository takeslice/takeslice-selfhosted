import { Badge } from "@/components/ui/badge";
import type { CommissionStatus } from "@/features/commissions/server/queries";

const LABELS: Record<CommissionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  available: "Available",
  paid: "Paid",
  declined: "Declined",
  reversed: "Reversed",
};

const TONES = {
  pending: "warning",
  approved: "info",
  available: "success",
  paid: "success",
  declined: "neutral",
  reversed: "danger",
} as const;

export function CommissionStatusBadge({ status }: { status: CommissionStatus }) {
  return <Badge tone={TONES[status]}>{LABELS[status]}</Badge>;
}
