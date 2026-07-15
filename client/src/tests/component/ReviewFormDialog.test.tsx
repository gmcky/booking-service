import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewFormDialog } from "@/components/reviews/review-form-dialog";
import type { Review } from "@/lib/api/reviews";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api/reviews", () => ({
  reviewApi: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const baseReview: Review = {
  id: "review-1",
  bookingId: "booking-1",
  userId: "user-1",
  propertyId: "prop-1",
  rating: 4,
  comment: "Nice place",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  hostReplyText: null,
  hostReplyById: null,
  hostReplyCreatedAt: null,
  user: { firstName: "Jane", lastName: "Doe" },
  hostReplyBy: null,
};

describe("ReviewFormDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens via trigger and the star picker sets the rating", async () => {
    renderWithClient(
      <ReviewFormDialog
        mode="create"
        bookingId="booking-1"
        propertyId="prop-1"
        propertyTitle="Pine Ridge Cabin"
        trigger={<button type="button" />}
      >
        Leave a review
      </ReviewFormDialog>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Leave a review" }));

    const submit = await screen.findByRole("button", { name: "Submit review" });
    expect(submit).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Overall: 3 stars" }));
    expect(submit).not.toBeDisabled();

    const threeStarIcon = screen.getByRole("button", { name: "Overall: 3 stars" }).querySelector("svg");
    expect(threeStarIcon).toHaveClass("fill-current");
  });

  it("create mode allows submitting with rating only (comment optional)", async () => {
    const { reviewApi } = await import("@/lib/api/reviews");
    (reviewApi.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseReview);

    renderWithClient(
      <ReviewFormDialog
        mode="create"
        bookingId="booking-1"
        propertyId="prop-1"
        propertyTitle="Pine Ridge Cabin"
        trigger={<button type="button" />}
      >
        Leave a review
      </ReviewFormDialog>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Leave a review" }));
    await userEvent.click(screen.getByRole("button", { name: "Overall: 3 stars" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit review" }));

    await waitFor(() => {
      expect(reviewApi.create).toHaveBeenCalledWith({
        bookingId: "booking-1",
        rating: 3,
        comment: undefined,
      });
    });
  });

  it("blocks submit and shows an error when the comment is shorter than 10 characters", async () => {
    const { reviewApi } = await import("@/lib/api/reviews");

    renderWithClient(
      <ReviewFormDialog
        mode="create"
        bookingId="booking-1"
        propertyId="prop-1"
        propertyTitle="Pine Ridge Cabin"
        trigger={<button type="button" />}
      >
        Leave a review
      </ReviewFormDialog>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Leave a review" }));
    await userEvent.click(screen.getByRole("button", { name: "Overall: 4 stars" }));
    await userEvent.type(screen.getByLabelText("Comment (optional)"), "short");

    await waitFor(() => {
      expect(screen.getByText("Comment must be 10-1000 characters")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Submit review" })).toBeDisabled();
    expect(reviewApi.create).not.toHaveBeenCalled();
  });

  it("successful create calls reviewApi.create with bookingId/rating/comment", async () => {
    const { reviewApi } = await import("@/lib/api/reviews");
    (reviewApi.create as ReturnType<typeof vi.fn>).mockResolvedValue(baseReview);

    renderWithClient(
      <ReviewFormDialog
        mode="create"
        bookingId="booking-1"
        propertyId="prop-1"
        propertyTitle="Pine Ridge Cabin"
        trigger={<button type="button" />}
      >
        Leave a review
      </ReviewFormDialog>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Leave a review" }));
    await userEvent.click(screen.getByRole("button", { name: "Overall: 5 stars" }));
    await userEvent.type(screen.getByLabelText("Comment (optional)"), "Great stay here");
    await userEvent.click(screen.getByRole("button", { name: "Submit review" }));

    await waitFor(() => {
      // Note: the component's contract sends bookingId/rating/comment only —
      // propertyId is used purely for local query invalidation, never sent to the API.
      expect(reviewApi.create).toHaveBeenCalledWith({
        bookingId: "booking-1",
        rating: 5,
        comment: "Great stay here",
      });
    });
  });

  it("edit mode prefills the rating and comment", async () => {
    renderWithClient(
      <ReviewFormDialog mode="edit" review={baseReview} trigger={<button type="button" />}>
        Edit review
      </ReviewFormDialog>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit review" }));

    expect(await screen.findByLabelText("Comment (optional)")).toHaveValue("Nice place");
    const fourthStarIcon = screen.getByRole("button", { name: "Overall: 4 stars" }).querySelector("svg");
    expect(fourthStarIcon).toHaveClass("fill-current");
    const fifthStarIcon = screen.getByRole("button", { name: "Overall: 5 stars" }).querySelector("svg");
    expect(fifthStarIcon).not.toHaveClass("fill-current");
  });
});
