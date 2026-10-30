import type { AffiliateStatus } from "./constants";

/** Valid affiliate status moves. Application decisions and admin actions go through this map. */
const TRANSITIONS: Record<AffiliateStatus, readonly AffiliateStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["suspended"],
  rejected: ["pending", "approved"],
  suspended: ["approved"],
};

export function canTransitionAffiliate(from: AffiliateStatus, to: AffiliateStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
