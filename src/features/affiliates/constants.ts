export const CHANNELS = ["YouTube", "TikTok", "Instagram", "X", "Newsletter", "Podcast", "Website", "Other"] as const;
export type Channel = (typeof CHANNELS)[number];

export const AFFILIATE_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
export type AffiliateStatus = (typeof AFFILIATE_STATUSES)[number];

export const APPLICATION_STATUSES = ["pending", "approved", "rejected", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const AFFILIATE_STATUS_LABELS: Record<AffiliateStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Not approved",
  suspended: "Suspended",
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
};

/** A rejected applicant may apply again after this cooldown. */
export const REAPPLY_COOLDOWN_DAYS = 30;

export const MAX_PROMOTION_PLAN_LENGTH = 2000;
