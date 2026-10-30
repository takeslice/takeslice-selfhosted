ALTER TABLE "coupon" ADD COLUMN "discount_percent" integer;--> statement-breakpoint
ALTER TABLE "coupon" ADD COLUMN "remote_promotion_id" text;--> statement-breakpoint
ALTER TABLE "coupon" ADD CONSTRAINT "coupon_discount_percent_check" CHECK ("coupon"."discount_percent" is null or ("coupon"."discount_percent" >= 1 and "coupon"."discount_percent" <= 100));