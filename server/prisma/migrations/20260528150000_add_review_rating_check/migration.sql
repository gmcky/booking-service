-- The rating 1–5 CHECK was already added on "reviews" as "reviews_rating_check"
-- in 20260403121500_review_booking_uniqueness_and_rating_check. The original
-- statement here targeted a non-existent "Review" table and broke fresh migrations.
-- Keep this migration in history but make it idempotent: ensure the constraint
-- exists without duplicating it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_rating_check'
  ) THEN
    ALTER TABLE "reviews"
      ADD CONSTRAINT "reviews_rating_check" CHECK (rating >= 1 AND rating <= 5);
  END IF;
END $$;
