import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { EMPTY_REVIEW } from "./ReviewWorkspace";
import ReviewWorkspace from "./ReviewWorkspace";
import type { Lead, Suitability } from "../api/types";
import LeadListPage from "../pages/LeadListPage";
import LeadPage from "../pages/LeadPage";
import { business, mockApi } from "../test/fixtures";

function wrap(ui: ReactNode, path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// Shapes as the backend sends them; the frontend never computes the score itself.
const demoFirst: Suitability = {
  score: 92,
  points: 92,
  band: "A",
  status: "COMPLETE",
  completeness: 100,
  recommendation: "DEMO_FIRST",
  reasons: [
    { code: "SCORE_AT_LEAST", value: 85 },
    { code: "NO_OWN_WEBSITE", value: "SOCIAL_ONLY" },
    { code: "COMMERCIAL_HIGH", value: null },
    { code: "DEMO_HIGH", value: null },
  ],
  components: [
    { key: "website", points: 32, max: 35, known: 35 },
    { key: "commercial", points: 20, max: 20, known: 20 },
    { key: "reachability", points: 13, max: 15, known: 15 },
    { key: "activity", points: 10, max: 10, known: 10 },
    { key: "customer", points: 10, max: 10, known: 10 },
    { key: "sales", points: 7, max: 10, known: 10 },
  ],
};
const provisional: Suitability = {
  ...demoFirst,
  score: 55,
  points: 55,
  band: "C",
  status: "PROVISIONAL",
  completeness: 55,
  recommendation: "STANDARD_OUTREACH",
  reasons: [{ code: "PROVISIONAL", value: 55 }],
  components: demoFirst.components.map((c) => (c.key === "website" || c.key === "commercial" ? c : { ...c, points: 0, known: 0 })),
};
const reviewWith = (s: Suitability | null) => ({ ...EMPTY_REVIEW, reviewed_at: "2026-11-01T10:00:00", updated_at: "2026-11-01T10:00:00", suitability: s });

describe("Suitability score", () => {
  it("is hidden until the review has scoring answers, then follows each save", async () => {
    const saved = business({ record_state: "IN_REVIEW", review: reviewWith(provisional) });
    const calls = mockApi({ "/api/businesses": saved });
    wrap(<ReviewWorkspace business={business()} />);
    expect(screen.queryByText("Suitability score")).not.toBeInTheDocument();

    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Demo potential" })).getByRole("radio", { name: "High" }));
    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Sales angle strength" })).getByRole("radio", { name: "Strong" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ demo_potential: "HIGH", sales_angle_strength: "STRONG" }), { timeout: 3000 });

    expect((await screen.findAllByText("55 / 100")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Provisional · 55% complete").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Standard outreach").length).toBeGreaterThan(0);
    expect(screen.getAllByText("not answered yet").length).toBeGreaterThan(0); // missing ≠ zero
  });

  it("shows the not-eligible state without a number", () => {
    const s: Suitability = { ...demoFirst, score: null, band: null, status: "NOT_ELIGIBLE", recommendation: "HOLD", reasons: [{ code: "INACTIVE", value: null }] };
    mockApi();
    wrap(<ReviewWorkspace business={business({ record_state: "IN_REVIEW", review: reviewWith(s) })} />);
    expect(screen.getAllByText("Not eligible").length).toBeGreaterThan(0);
    expect(screen.queryByText(/\/ 100/)).not.toBeInTheDocument();
  });

  it("Lead List shows score, band and approach, and sorts/filters on the server", async () => {
    const lead = {
      id: 3,
      stage: "READY_TO_CONTACT",
      display_name: "Beauty Cabin",
      business: business({ record_state: "APPROVED" }),
      suitability: { score: 92, band: "A", status: "COMPLETE", completeness: 100, recommendation: "DEMO_FIRST" },
      latest_note: null,
      personalized_angle: null,
      preferred_contact_channel: null,
      last_contact_at: null,
      next_follow_up_at: null,
    } as unknown as Lead;
    const calls = mockApi({ "/api/leads": [lead] });
    wrap(<LeadListPage />, "/leads");
    const row = (await screen.findByText("92 · A")).closest("a")!;
    expect(within(row).getByText("Demo first")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort leads" }), "score");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Score band" }), "A");
    await waitFor(() => expect(calls.some((c) => c.url.includes("sort=score") && c.url.includes("band=A"))).toBe(true));
  });

  it("lead detail explains the score and the recommendation", async () => {
    const lead = {
      id: 3,
      stage: "READY_TO_CONTACT",
      display_name: "Beauty Cabin",
      created_at: "2026-11-01T10:00:00",
      business: business({ record_state: "APPROVED" }),
      suitability: demoFirst,
      events: [],
      event_count: 0,
    };
    mockApi({ "/api/leads": lead });
    wrap(
      <Routes>
        <Route path="/leads/:id" element={<LeadPage />} />
      </Routes>,
      "/leads/3",
    );
    expect(await screen.findByText("92 / 100")).toBeInTheDocument();
    expect(screen.getByText("A · Excellent fit")).toBeInTheDocument();
    expect(screen.getByText("Build a quick demo site before reaching out.")).toBeInTheDocument();
    expect(screen.getByText("It has no website of its own (Social media only).")).toBeInTheDocument();
    expect(screen.getByText("The score is 85 or more.")).toBeInTheDocument();
    const breakdown = screen.getByRole("list", { name: "Breakdown" });
    expect(within(breakdown).getByText("Website opportunity")).toBeInTheDocument();
    expect(within(breakdown).getByText("32/35")).toBeInTheDocument();
    expect(within(breakdown).getByText("13/15")).toBeInTheDocument();
  });
});
