import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SearchPill } from "@/components/search/search-pill";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

vi.mock("@/lib/api/properties", () => ({
  propertyApi: {
    locations: vi.fn().mockResolvedValue([]),
  },
}));

function renderPill() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SearchPill />
    </QueryClientProvider>,
  );
}

/** Reads a stepper's current count from the `<span>` between its two
 * increase/decrease buttons — cheaper than adding test-only attributes. */
function stepperValue(label: string): string {
  const decrease = screen.getByRole("button", { name: `Decrease ${label.toLowerCase()}` });
  return decrease.nextElementSibling?.textContent ?? "";
}

describe("SearchPill guest stepper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sums adults + children into the guest count sent, and clamps adults to a minimum of 1 once children are added", async () => {
    renderPill();

    await userEvent.click(screen.getByRole("button", { name: /who/i }));

    expect(stepperValue("Adults")).toBe("0");
    expect(stepperValue("Children")).toBe("0");

    // Starting from 0 adults, adding a child must auto-clamp adults up to 1.
    await userEvent.click(screen.getByRole("button", { name: "Increase children" }));
    expect(stepperValue("Children")).toBe("1");
    expect(stepperValue("Adults")).toBe("1");

    await userEvent.click(screen.getByRole("button", { name: "Increase children" }));
    expect(stepperValue("Children")).toBe("2");

    // Adults can't be decremented below 1 while children are present.
    await userEvent.click(screen.getByRole("button", { name: "Decrease adults" }));
    expect(stepperValue("Adults")).toBe("1");

    await userEvent.click(screen.getByRole("button", { name: "Increase adults" }));
    expect(stepperValue("Adults")).toBe("2");

    // Guest count sent = adults + children (2 + 2 = 4).
    expect(screen.getByRole("button", { name: /who/i })).toHaveTextContent("4 guests");

    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const pushedUrl = pushMock.mock.calls[0][0] as string;
    expect(pushedUrl).toContain("maxGuests=4");
    expect(pushedUrl).not.toMatch(/infants|children|petsAllowed|infantsAllowed/);
  });

  it("caps adults + children at 16 total guests and disables further increases", async () => {
    renderPill();

    await userEvent.click(screen.getByRole("button", { name: /who/i }));

    for (let i = 0; i < 16; i++) {
      await userEvent.click(screen.getByRole("button", { name: "Increase adults" }));
    }
    expect(stepperValue("Adults")).toBe("16");
    expect(screen.getByRole("button", { name: "Increase adults" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase children" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    const pushedUrl = pushMock.mock.calls[0][0] as string;
    expect(pushedUrl).toContain("maxGuests=16");
  });

  it("toggles pets and infants switches on, sending petsAllowed=true / infantsAllowed=true", async () => {
    renderPill();

    await userEvent.click(screen.getByRole("button", { name: /who/i }));

    await userEvent.click(screen.getByRole("switch", { name: "Pets" }));
    await userEvent.click(screen.getByRole("switch", { name: "Infants" }));

    expect(screen.getByRole("button", { name: /who/i })).toHaveTextContent("pets · infants");

    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    const pushedUrl = pushMock.mock.calls[0][0] as string;
    expect(pushedUrl).toContain("petsAllowed=true");
    expect(pushedUrl).toContain("infantsAllowed=true");
  });

  it("omits petsAllowed/infantsAllowed params when the switches are left off", async () => {
    renderPill();

    await userEvent.click(screen.getByRole("button", { name: /who/i }));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    const pushedUrl = pushMock.mock.calls[0][0] as string;
    expect(pushedUrl).not.toMatch(/petsAllowed|infantsAllowed/);
  });
});
