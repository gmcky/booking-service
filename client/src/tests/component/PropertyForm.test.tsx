import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropertyForm, type PropertyFormInitial } from "@/components/property/property-form";

vi.mock("@/lib/api/properties", () => ({
  propertyApi: {
    uploadImages: vi.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("PropertyForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("create mode renders empty fields; invalid submit shows errors and does not call onSubmit", async () => {
    const onSubmit = vi.fn();
    renderWithClient(
      <PropertyForm
        submitLabel="Publish listing"
        pendingLabel="Publishing…"
        pending={false}
        formError=""
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Street address")).toHaveValue("");
    expect(screen.getByLabelText("City")).toHaveValue("");

    await userEvent.click(screen.getByRole("button", { name: /publish listing/i }));

    await waitFor(() => {
      expect(screen.getByText("Title must be at least 5 characters.")).toBeInTheDocument();
      expect(screen.getByText("Write at least 20 characters.")).toBeInTheDocument();
      expect(screen.getByText("Enter a street address.")).toBeInTheDocument();
      expect(screen.getByText("Enter a city.")).toBeInTheDocument();
      expect(screen.getByText("Set max guests.")).toBeInTheDocument();
      expect(screen.getByText("Set a nightly price.")).toBeInTheDocument();
      expect(screen.getByText("Fix the highlighted fields before saving.")).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("filling valid values calls onSubmit with parsed values (numbers as numbers)", async () => {
    const onSubmit = vi.fn();
    renderWithClient(
      <PropertyForm
        submitLabel="Publish listing"
        pendingLabel="Publishing…"
        pending={false}
        formError=""
        onSubmit={onSubmit}
      />,
    );

    await userEvent.type(screen.getByLabelText("Title"), "Pine Ridge Cabin");
    await userEvent.type(
      screen.getByLabelText("Description"),
      "A cozy cabin in the woods with a view.",
    );
    await userEvent.type(screen.getByLabelText("Street address"), "1240 Lakeshore Dr");
    await userEvent.type(screen.getByLabelText("City"), "South Lake Tahoe");
    await userEvent.type(screen.getByLabelText("Max guests"), "6");
    await userEvent.type(screen.getByLabelText("Price / night"), "248");

    await userEvent.click(screen.getByRole("button", { name: /publish listing/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      title: "Pine Ridge Cabin",
      description: "A cozy cabin in the woods with a view.",
      address: "1240 Lakeshore Dr",
      city: "South Lake Tahoe",
      maxGuests: 6,
      pricePerNight: 248,
      type: "HOUSE",
      amenities: [],
      rawImagePaths: [],
    });
  });

  it("edit mode prefills from initial and shows the no-photo-changes note instead of an uploader", () => {
    const initial: PropertyFormInitial = {
      title: "Old Title",
      description: "An existing description that is long enough.",
      address: "1 Main St",
      city: "Austin",
      maxGuests: 4,
      pricePerNight: "150",
      type: "APARTMENT",
      amenities: ["WIFI"],
      images: ["uploads/properties/a.jpg"],
    };
    renderWithClient(
      <PropertyForm
        initial={initial}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        pending={false}
        formError=""
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Title")).toHaveValue("Old Title");
    expect(screen.getByLabelText("Street address")).toHaveValue("1 Main St");
    expect(screen.getByLabelText("City")).toHaveValue("Austin");
    expect(screen.getByLabelText("Max guests")).toHaveValue(4);
    expect(screen.getByLabelText("Price / night")).toHaveValue(150);

    expect(
      screen.getByText("Changing photos on an existing listing isn't supported yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Click to add photos")).not.toBeInTheDocument();
  });

  it("uploading a photo shows a preview once the upload resolves", async () => {
    const { propertyApi } = await import("@/lib/api/properties");
    (propertyApi.uploadImages as ReturnType<typeof vi.fn>).mockResolvedValue({
      paths: ["uploads/properties/new.jpg"],
    });
    // jsdom has no object-URL implementation; stub it for the preview flow.
    global.URL.createObjectURL = vi.fn(() => "blob:mock-preview");
    global.URL.revokeObjectURL = vi.fn();

    const { container } = renderWithClient(
      <PropertyForm
        submitLabel="Publish listing"
        pendingLabel="Publishing…"
        pending={false}
        formError=""
        onSubmit={vi.fn()}
      />,
    );

    const file = new File(["binary"], "photo.jpg", { type: "image/jpeg" });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Remove photo" })).toBeInTheDocument();
    });
    expect(propertyApi.uploadImages).toHaveBeenCalledWith([file]);
  });
});
