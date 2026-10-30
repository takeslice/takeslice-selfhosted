export const MAX_ACTIVE_LINKS_PER_AFFILIATE = 25;

export const UTM_FIELDS = ["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm"] as const;
export type UtmField = (typeof UTM_FIELDS)[number];

export const UTM_PARAM_NAMES: Record<UtmField, string> = {
  utmSource: "utm_source",
  utmMedium: "utm_medium",
  utmCampaign: "utm_campaign",
  utmContent: "utm_content",
  utmTerm: "utm_term",
};
