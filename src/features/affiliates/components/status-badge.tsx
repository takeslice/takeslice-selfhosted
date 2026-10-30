import { Badge } from "@/components/ui/badge";
import { APPLICATION_STATUS_LABELS, AFFILIATE_STATUS_LABELS, type ApplicationStatus, type AffiliateStatus } from "../constants";

const AFFILIATE_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  suspended: "danger",
} as const satisfies Record<AffiliateStatus, "warning" | "success" | "danger">;

const APPLICATION_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  withdrawn: "neutral",
} as const satisfies Record<ApplicationStatus, "warning" | "success" | "danger" | "neutral">;

export function AffiliateStatusBadge({ status }: { status: AffiliateStatus }) {
  return <Badge tone={AFFILIATE_TONE[status]}>{AFFILIATE_STATUS_LABELS[status]}</Badge>;
}

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge tone={APPLICATION_TONE[status]}>{APPLICATION_STATUS_LABELS[status]}</Badge>;
}
