import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../App";
import { business, mockApi } from "../test/fixtures";
import ReviewWorkspace from "./ReviewWorkspace";
import { Segmented } from "./ui";

function wrap(ui: ReactNode, path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function Where() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

describe("Segmented", () => {
  it("selects, and clears when the selected option is clicked again", async () => {
    function Harness() {
      const [v, setV] = useState<string | null>(null);
      return (
        <>
          <Segmented ariaLabel="Active" options={[{ value: "YES", label: "Yes" }, { value: "NO", label: "No" }]} value={v} onChange={setV} />
          <span data-testid="v">{v ?? "none"}</span>
        </>
      );
    }
    render(<Harness />);
    const yes = screen.getByRole("radio", { name: "Yes" });
    await userEvent.click(yes);
    expect(yes).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("v")).toHaveTextContent("YES");
    await userEvent.click(yes);
    expect(screen.getByTestId("v")).toHaveTextContent("none");
  });
});

describe("ReviewWorkspace", () => {
  it("shows the four guided sections, OSM unknowns, and a dominant Approve", () => {
    mockApi();
    wrap(<ReviewWorkspace business={business()} />);
    for (const title of ["Business verification", "Web presence", "Reachability & potential", "Notes & decision"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    // Missing OSM data is "unknown", never "no".
    expect(screen.getAllByText("Unknown — not in OSM").length).toBeGreaterThan(0);
    expect(screen.queryByText(/no website/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toHaveClass("btn-primary");
    expect(screen.getByRole("button", { name: /reject/i })).not.toHaveClass("btn-primary");
  });

  it("autosaves checklist answers and notes", async () => {
    const calls = mockApi({ "/api/businesses": business({ record_state: "IN_REVIEW" }) });
    wrap(<ReviewWorkspace business={business()} />);
    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Business currently active" })).getByRole("radio", { name: "Yes" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Notes" }), "Maps: active");
    await waitFor(
      () => {
        const put = calls.find((c) => c.method === "PUT" && c.url.endsWith("/businesses/7/review"));
        expect(put?.body).toMatchObject({ business_active: "YES", notes: "Maps: active" });
      },
      { timeout: 3000 },
    );
  });

  it("asks for a reason before rejecting", async () => {
    const calls = mockApi({ "/api/businesses": business({ record_state: "REJECTED", reject_reason: "WRONG_SECTOR" }) });
    wrap(<ReviewWorkspace business={business()} />);
    await userEvent.click(screen.getByRole("button", { name: /reject/i }));
    const dialog = screen.getByRole("dialog", { name: "Reject reason" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Wrong sector" }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/businesses/7/reject"))?.body).toMatchObject({ reason: "WRONG_SECTOR" }));
  });
});

describe("navigation", () => {
  it("has the six primary sections", async () => {
    mockApi();
    wrap(<App />, "/dashboard");
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0];
    const labels = within(nav)
      .getAllByRole("link")
      .map((a) => a.textContent?.replace(/\d+$/, "").trim());
    expect(labels).toEqual(["Dashboard", "Discover", "Review", "Leads", "CRM", "Settings"]);
    expect(await screen.findByText("Sandbox data — test database, not your real prospecting data")).toBeInTheDocument();
  });

  it.each([
    ["/discovery", "/discover/find"],
    ["/favorites", "/discover/favorites"],
    ["/nope", "/dashboard"],
  ])("redirects old route %s to %s", async (from, to) => {
    mockApi();
    wrap(
      <>
        <App />
        <Where />
      </>,
      from,
    );
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent(to));
  });

  it("dashboard leads with the four action cards", async () => {
    mockApi();
    wrap(<App />, "/dashboard");
    for (const label of ["Waiting for review", "Ready to contact", "Follow-ups due", "Won this month"]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /waiting for review/i })).toHaveAttribute("href", "/review");
  });
});
