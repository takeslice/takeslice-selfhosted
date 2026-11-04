export function normaliseEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

/** True when the buyer's email is the affiliate's own sign-in or contact email. */
export function isSelfReferralEmail(buyerEmail: string | null | undefined, affiliateEmails: Array<string | null | undefined>): boolean {
  const buyer = normaliseEmail(buyerEmail);
  if (!buyer) return false;
  return affiliateEmails.some((candidate) => normaliseEmail(candidate) === buyer);
}
