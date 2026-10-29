import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Coverage } from "../api/types";
import { translate } from "../i18n";
import { browseLink, weightHint } from "../lib/logic";
import { mockApi } from "../test/fixtures";
import CoverageTab from "./CoveragePage";
import SettingsPage from "./SettingsPage";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const coverage = (population: string): Coverage => ({
  population: population as Coverage["population"],
  browse_state: population === "waiting" ? "queue" : population === "approved" ? "APPROVED" : population,
  totals: { total: 120, waiting: 100, decided: 20, approved: 5, rejected: 12 },
  population_total: 100,
  sectors: [
    { id: 1, name: "Beauty / Aesthetics", count: 60, pct: 60, review_weight: 2, commercial_priority: "HIGH" },
    { id: 11, name: "Burger", count: 39, pct: 39, review_weight: 2, commercial_priority: "HIGH" },
    { id: null, name: "Unassigned", count: 1, pct: 1, review_weight: null, commercial_priority: null },
  ],
  locations: [
    { id: 2, name: "Kadıköy", count: 70, pct: 70, type: "DISTRICT" },
    { id: 1, name: "Istanbul", count: 29, pct: 29, type: "CITY" },
    { id: null, name: "Unassigned", count: 1, pct: 1, type: null },
  ],
  cells: [
    { sector_id: 1, location_id: 2, count: 50 },
    { sector_id: 1, location_id: 1, count: 10 },
    { sector_id: 11, location_id: 2, count: 20 },
    { sector_id: 11, location_id: 1, count: 19 },
    { sector_id: null, location_id: null, count: 1 },
  ],
});

describe("Coverage", () => {
  it("shows totals, distributions and a matrix that link into Browse", async () => {
    const calls = mockApi({ "/api/coverage": (url: string) => coverage(new URL(url, "http://x").searchParams.get("population") ?? "waiting") });
    wrap(<CoverageTab />);
    expect(await screen.findByText("Total businesses")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getAllByText(/priority ×2\.0/).length).toBe(2); // subtle review priority on sector rows

    expect(screen.getByRole("link", { name: "Beauty / Aesthetics: 60" })).toHaveAttribute("href", "/discover?sector_id=1");
    expect(screen.getAllByRole("link", { name: "Unassigned: 1" })[0]).toHaveAttribute("href", "/discover?sector_id=none");
    expect(screen.getByRole("link", { name: "Istanbul (no district): 29" })).toHaveAttribute("href", "/discover?location_id=1");
    const matrix = screen.getByRole("region", { name: /sector by location matrix/i });
    expect(within(matrix).getByRole("link", { name: "Burger in Kadıköy: 20" })).toHaveAttribute("href", "/discover?sector_id=11&location_id=2");
    expect(within(matrix).getByRole("link", { name: "Unassigned in Unassigned: 1" })).toHaveAttribute("href", "/discover?sector_id=none&location_id=none");

    await userEvent.click(screen.getByRole("radio", { name: "Approved leads" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("population=approved"))).toBe(true));
    expect(await screen.findByRole("link", { name: "Beauty / Aesthetics: 60" })).toHaveAttribute("href", "/discover?state=APPROVED&sector_id=1");
  });

  it("builds Browse links for every population", () => {
    expect(browseLink("queue", { sector: 3 })).toBe("/discover?sector_id=3");
    expect(browseLink("decided", { sector: null, location: 4 })).toBe("/discover?state=decided&sector_id=none&location_id=4");
    expect(browseLink("all", {})).toBe("/discover?state=all");
  });
});

describe("Review weights in Settings", () => {
  it("saves a sector weight when the slider is released", async () => {
    const sectors = [
      { id: 6, name: "Hairdresser / Premium Hair Studio", commercial_priority: "MIXED", osm_coverage: "EXCELLENT", osm_discovery_enabled: true, enabled: true, notes: null, match_priority: 100, review_weight: 0.6, rules: [] },
      { id: 9, name: "Interior Design", commercial_priority: "HIGH", osm_coverage: "NONE", osm_discovery_enabled: false, enabled: true, notes: null, match_priority: 100, review_weight: 1, rules: [] },
    ];
    const calls = mockApi({ "/api/sectors": sectors, "/api/review/progress": { reviewed_today: 0, target: 30 }, "/api/osm-data": { pbf: null, job: null } });
    wrap(<SettingsPage />);
    const slider = await screen.findByLabelText("Hairdresser / Premium Hair Studio");
    expect(screen.queryByLabelText("Interior Design")).not.toBeInTheDocument(); // not searchable -> not in review
    expect(slider).toHaveValue("0.6");
    fireEvent.change(slider, { target: { value: "1.2" } });
    fireEvent.pointerUp(slider);
    await waitFor(() => {
      const put = calls.find((c) => c.method === "PUT" && c.url.endsWith("/sectors/6/review-weight"));
      expect(put?.body).toEqual({ review_weight: 1.2 });
    });
    const t = (k: Parameters<typeof translate>[1], v?: Parameters<typeof translate>[2]) => translate("en", k, v);
    expect(weightHint(2, t)).toBe("much more often");
    expect(weightHint(0.6, t)).toBe("less often");
  });
});
