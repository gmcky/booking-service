ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK (rating >= 1 AND rating <= 5);
