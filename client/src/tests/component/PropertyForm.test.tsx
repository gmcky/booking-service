import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropertyForm, type PropertyFormInitial } from "@/components/property/property-form";

vi.mock("@/lib/api/properties", () => ({
  propertyApi: {
    uploadImages: vi.fn(),
    suggestAddresses: vi.fn().mockResolvedValue([]),
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
    expect(screen.getByLabelText("Street")).toHaveValue("");
    expect(screen.getByLabelText("City")).toHaveValue("");
    expect(screen.getByLabelText("Country")).toHaveValue("");

    await userEvent.click(screen.getByRole("button", { name: /publish listing/i }));

    await waitFor(() => {
      expect(screen.getByText("Title must be at least 5 characters.")).toBeInTheDocument();
      expect(screen.getByText("Write at least 20 characters.")).toBeInTheDocument();
      expect(screen.getByText("Enter a street.")).toBeInTheDocument();
      expect(screen.getByText("Enter a city.")).toBeInTheDocument();
      expect(screen.getByText("Enter a country.")).toBeInTheDocument();
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
    await userEvent.type(screen.getByLabelText("Street"), "Lakeshore Dr");
    await userEvent.type(screen.getByLabelText("House no."), "1240");
    await userEvent.type(screen.getByLabelText("City"), "South Lake Tahoe");
    await userEvent.type(screen.getByLabelText("Country"), "United States");
    await userEvent.type(screen.getByLabelText("Max guests"), "6");
    await userEvent.type(screen.getByLabelText("Price / night"), "248");

    await userEvent.click(screen.getByRole("button", { name: /publish listing/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      title: "Pine Ridge Cabin",
      description: "A cozy cabin in the woods with a view.",
      street: "Lakeshore Dr",
      houseNumber: "1240",
      apartment: null,
      district: null,
      city: "South Lake Tahoe",
      country: "United States",
      latitude: null,
      longitude: null,
      maxGuests: 6,
      pricePerNight: 248,
      type: "HOUSE",
      petsAllowed: false,
      infantsAllowed: true,
      amenities: [],
      rawImagePaths: [],
    });
  });

  it("edit mode prefills from initial and shows the no-photo-changes note instead of an uploader", () => {
    const initial: PropertyFormInitial = {
      title: "Old Title",
      description: "An existing description that is long enough.",
      street: "Main St",
      houseNumber: "1",
      apartment: null,
      district: null,
      city: "Austin",
      country: "United States",
      maxGuests: 4,
      pricePerNight: "150",
      type: "APARTMENT",
      petsAllowed: true,
      infantsAllowed: false,
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
    expect(screen.getByLabelText("Street")).toHaveValue("Main St");
    expect(screen.getByLabelText("House no.")).toHaveValue("1");
    expect(screen.getByLabelText("City")).toHaveValue("Austin");
    expect(screen.getByLabelText("Country")).toHaveValue("United States");
    expect(screen.getByLabelText("Max guests")).toHaveValue(4);
    expect(screen.getByLabelText("Price / night")).toHaveValue(150);

    expect(
      screen.getByText("Changing photos on an existing listing isn't supported yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Click to add photos")).not.toBeInTheDocument();
  });

  it("picking a street suggestion fills the address block and pins coordinates", async () => {
    const { propertyApi } = await import("@/lib/api/properties");
    (propertyApi.suggestAddresses as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        label: "Khreshchatyk Street, Pecherskyi district, Kyiv, Ukraine",
        street: "Khreshchatyk Street",
        houseNumber: null,
        district: "Pecherskyi district",
        city: "Kyiv",
        country: "Ukraine",
        latitude: 50.4471871,
        longitude: 30.5229456,
      },
    ]);
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

    // Stale house number from before the pick must be cleared by the pick —
    // otherwise it silently mismatches the pinned coordinates.
    await userEvent.type(screen.getByLabelText("House no."), "7");

    // Cyrillic input; the suggestion arrives already normalized to English.
    await userEvent.type(screen.getByLabelText("Street"), "Хрещатик");
    const option = await screen.findByText(
      "Khreshchatyk Street, Pecherskyi district, Kyiv, Ukraine",
    );
    await userEvent.click(option);

    expect(screen.getByLabelText("Street")).toHaveValue("Khreshchatyk Street");
    expect(screen.getByLabelText("House no.")).toHaveValue("");
    expect(screen.getByLabelText("District (optional)")).toHaveValue("Pecherskyi district");
    expect(screen.getByLabelText("City")).toHaveValue("Kyiv");
    expect(screen.getByLabelText("Country")).toHaveValue("Ukraine");

    await userEvent.type(screen.getByLabelText("Title"), "Kyiv Center Flat");
    await userEvent.type(
      screen.getByLabelText("Description"),
      "A bright flat right on the main street.",
    );
    await userEvent.type(screen.getByLabelText("Max guests"), "2");
    await userEvent.type(screen.getByLabelText("Price / night"), "90");
    await userEvent.click(screen.getByRole("button", { name: /publish listing/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      street: "Khreshchatyk Street",
      city: "Kyiv",
      country: "Ukraine",
      latitude: 50.4471871,
      longitude: 30.5229456,
    });
  });

  it("editing the street after picking a suggestion un-pins the coordinates", async () => {
    const { propertyApi } = await import("@/lib/api/properties");
    (propertyApi.suggestAddresses as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        label: "Khreshchatyk Street, Kyiv, Ukraine",
        street: "Khreshchatyk Street",
        houseNumber: null,
        district: null,
        city: "Kyiv",
        country: "Ukraine",
        latitude: 50.4471871,
        longitude: 30.5229456,
      },
    ]);
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

    await userEvent.type(screen.getByLabelText("Street"), "Хрещатик");
    await userEvent.click(await screen.findByText("Khreshchatyk Street, Kyiv, Ukraine"));
    await userEvent.type(screen.getByLabelText("Street"), " edited");

    await userEvent.type(screen.getByLabelText("Title"), "Kyiv Center Flat");
    await userEvent.type(
      screen.getByLabelText("Description"),
      "A bright flat right on the main street.",
    );
    await userEvent.type(screen.getByLabelText("Max guests"), "2");
    await userEvent.type(screen.getByLabelText("Price / night"), "90");
    await userEvent.click(screen.getByRole("button", { name: /publish listing/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ latitude: null, longitude: null });
  });

  it("country suggests from the ISO list; city pick fills country and scopes the query", async () => {
    const { propertyApi } = await import("@/lib/api/properties");
    (propertyApi.suggestAddresses as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        label: "Kyiv, Ukraine",
        street: null,
        houseNumber: null,
        district: null,
        city: "Kyiv",
        country: "Ukraine",
        latitude: 50.4501,
        longitude: 30.5234,
      },
    ]);
    renderWithClient(
      <PropertyForm
        submitLabel="Publish listing"
        pendingLabel="Publishing…"
        pending={false}
        formError=""
        onSubmit={vi.fn()}
      />,
    );

    // Country: static ISO list, no API involved.
    await userEvent.type(screen.getByLabelText("Country"), "Ukr");
    await userEvent.click(await screen.findByText("Ukraine"));
    expect(screen.getByLabelText("Country")).toHaveValue("Ukraine");
    expect(propertyApi.suggestAddresses).not.toHaveBeenCalled();

    // City: global provider, scoped to the picked country.
    await userEvent.type(screen.getByLabelText("City"), "Kyi");
    await userEvent.click(await screen.findByText("Kyiv, Ukraine"));
    expect(screen.getByLabelText("City")).toHaveValue("Kyiv");
    expect(propertyApi.suggestAddresses).toHaveBeenCalledWith("Kyi", {
      kind: "city",
      country: "Ukraine",
    });
  });

  it("picking a different city after a street pick clears the stale street block", async () => {
    const { propertyApi } = await import("@/lib/api/properties");
    const streetSuggestion = {
      label: "Rynok Square 24, Lviv, Ukraine",
      street: "Rynok Square",
      houseNumber: "24",
      district: "Halytskyi",
      city: "Lviv",
      country: "Ukraine",
      latitude: 49.8419,
      longitude: 24.0315,
    };
    const citySuggestion = {
      label: "Kyiv, Ukraine",
      street: null,
      houseNumber: null,
      district: null,
      city: "Kyiv",
      country: "Ukraine",
      latitude: 50.4501,
      longitude: 30.5234,
    };
    (propertyApi.suggestAddresses as ReturnType<typeof vi.fn>).mockImplementation(
      async (_q: string, opts?: { kind?: string }) =>
        opts?.kind === "city" ? [citySuggestion] : [streetSuggestion],
    );
    renderWithClient(
      <PropertyForm
        submitLabel="Publish listing"
        pendingLabel="Publishing…"
        pending={false}
        formError=""
        onSubmit={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText("Street"), "Ринок");
    await userEvent.click(await screen.findByText("Rynok Square 24, Lviv, Ukraine"));
    expect(screen.getByLabelText("House no.")).toHaveValue("24");

    await userEvent.clear(screen.getByLabelText("City"));
    await userEvent.type(screen.getByLabelText("City"), "Kyi");
    await userEvent.click(await screen.findByText("Kyiv, Ukraine"));

    // Street block belonged to Lviv — it must not survive the city switch.
    expect(screen.getByLabelText("Street")).toHaveValue("");
    expect(screen.getByLabelText("House no.")).toHaveValue("");
    expect(screen.getByLabelText("District (optional)")).toHaveValue("");
    expect(screen.getByLabelText("City")).toHaveValue("Kyiv");
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
