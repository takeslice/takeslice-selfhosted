-- Affiliates approved before referral links shipped still need their default link.
INSERT INTO "referral_link" ("id", "affiliate_id", "code", "destination_url", "is_default")
SELECT 'lnk_' || replace(gen_random_uuid()::text, '-', ''), a."id", a."referral_code", p."website_url", true
FROM "affiliate" a
CROSS JOIN "program_settings" p
WHERE a."status" = 'approved'
  AND a."referral_code" IS NOT NULL
  AND p."id" = 'default'
  AND NOT EXISTS (
    SELECT 1 FROM "referral_link" l WHERE l."affiliate_id" = a."id" AND l."is_default"
  )
ON CONFLICT ("code") DO NOTHING;
