import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import type { ReviewSessionView } from "../api/types";
import OsmDataCard from "../components/OsmDataCard";
import { business, mockApi } from "../test/fixtures";
import ReviewQueuePage from "./ReviewQueuePage";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const DECK = [11, 12, 13];
const names: Record<number, string> = { 11: "Moda Ink", 12: "Beauty Cabin", 13: "Şişli Veteriner" };

function sessionAt(cursor: number, over: Partial<ReviewSessionView> = {}): ReviewSessionView {
  const id = DECK[cursor];
  return {
    id: 5,
    status: cursor >= DECK.length ? "COMPLETED" : "ACTIVE",
    created_at: "2026-10-29T08:00:00",
    filters: {},
    total: DECK.length,
    cursor,
    position: Math.min(cursor + 1, DECK.length),
    decided: 0,
    pending: DECK.length,
    current_business_id: id ?? null,
    at_start: cursor === 0,
    at_end: cursor >= DECK.length,
    business: id ? business({ id, name: names[id] }) : null,
    ...over,
  };
}

/** A tiny in-memory server for the session endpoints: Previous/Next only move the cursor. */
function sessionServer(initial: ReviewSessionView | null) {
  let cursor = initial ? initial.cursor : 0;
  let exists = !!initial;
  const extra = initial ? { decided: initial.decided, pending: initial.pending } : {};
  return mockApi({
    "/api/review/progress": { reviewed_today: 12, target: 30 },
    "/api/review-sessions/eligible": { count: 3, by_sector: [{ sector: "Tattoo", count: 1 }, { sector: "Beauty / Aesthetics", count: 1 }, { sector: "Veterinary", count: 1 }] },
    "/api/review-sessions/current": () => ({ session: exists ? sessionAt(cursor, extra) : null }),
    "/api/review-sessions": (url: string, init?: RequestInit) => {
      const action = init?.body ? JSON.parse(String(init.body)).action : undefined;
      if (url.endsWith("/move")) {
        if (action === "previous") cursor = Math.max(0, cursor - 1);
        else cursor = Math.min(DECK.length, cursor + 1);
      } else {
        exists = true;
        cursor = 0;
      }
      return sessionAt(cursor);
    },
    "/api/businesses": business({ record_state: "REJECTED" }),
  });
}

beforeEach(() => sessionStorage.clear());

describe("Review sessions", () => {
  it("starts a shuffled session and walks it like browser history", async () => {
    const calls = sessionServer(null);
    wrap(<ReviewQueuePage />);
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText(/reviewed today/)).toHaveTextContent("12 / 30 reviewed today");
    expect(await screen.findByText(/^waiting for review/)).toHaveTextContent("3 waiting for review");

    await userEvent.click(screen.getByRole("button", { name: /start shuffled session/i }));
    expect(await screen.findByRole("heading", { name: "Moda Ink" })).toBeInTheDocument();
    expect(screen.getByText(/1 of 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(await screen.findByRole("heading", { name: "Beauty Cabin" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(await screen.findByRole("heading", { name: "Moda Ink" })).toBeInTheDocument();

    const moves = calls.filter((c) => c.url.endsWith("/move")).map((c) => (c.body as { action: string }).action);
    expect(moves).toEqual(["next", "previous"]);
    expect(sessionStorage.getItem("lead-center.review-session")).toBe("5");
  });

  it("offers Resume or a new shuffled session when a session already exists", async () => {
    sessionServer(sessionAt(1, { decided: 1, pending: 2 }));
    wrap(<ReviewQueuePage />);
    expect(await screen.findByText(/continue where you left off/i)).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 decided/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /resume review session/i }));
    expect(await screen.findByRole("heading", { name: "Beauty Cabin" })).toBeInTheDocument();
  });

  it("resumes directly after a refresh in the same tab", async () => {
    sessionStorage.setItem("lead-center.review-session", "5");
    sessionServer(sessionAt(2));
    wrap(<ReviewQueuePage />);
    expect(await screen.findByRole("heading", { name: "Şişli Veteriner" })).toBeInTheDocument();
    expect(screen.queryByText(/continue where you left off/i)).not.toBeInTheDocument();
  });

  it("advances in the same deck after a decision", async () => {
    sessionStorage.setItem("lead-center.review-session", "5");
    const calls = sessionServer(sessionAt(0));
    wrap(<ReviewQueuePage />);
    await screen.findByRole("heading", { name: "Moda Ink" });
    await userEvent.click(screen.getByRole("button", { name: /reject/i }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Reject reason" })).getByRole("button", { name: "Other" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/move") && (c.body as { action: string }).action === "advance")).toBe(true));
    expect(await screen.findByRole("heading", { name: "Beauty Cabin" })).toBeInTheDocument();
  });
});

describe("OpenStreetMap data card", () => {
  const empty = { source_url: "x", file_name: "turkey-latest.osm.pbf", pbf: null, job: null, last_check: null, last_download: null, last_update: null, last_import: null };

  it("asks before downloading hundreds of megabytes", async () => {
    const calls = mockApi({ "/api/osm-data": empty });
    wrap(<OsmDataCard />);
    await userEvent.click(await screen.findByRole("button", { name: /download latest data/i }));
    expect(screen.getByText(/this downloads about/i)).toHaveTextContent("650 MB");
    expect(calls.some((c) => c.url.endsWith("/osm-data/download"))).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: /start download/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/osm-data/download"))).toBe(true));
  });

  it("shows download progress with a cancel button", async () => {
    const running = {
      ...empty,
      job: { kind: "download", status: "running", phase: "Downloading", done: 300 * 1024 ** 2, total: 600 * 1024 ** 2, message: null, result: {}, started_at: "2026-10-29T08:00:00", finished_at: null },
    };
    const calls = mockApi({ "/api/osm-data": running });
    wrap(<OsmDataCard />);
    expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText(/300 MB of 600 MB/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/osm-data/cancel"))).toBe(true));
  });

  it("shows the local file, freshness and import actions", async () => {
    mockApi({
      "/api/osm-data": {
        ...empty,
        pbf: { path: "x", size_bytes: 651919591, file_modified_at: "2026-10-29T03:00:00", data_timestamp: "2026-10-28T21:21:02Z", replication_sequence: 4954, replication_url: "u" },
        last_check: { checked_at: "2026-10-29T09:00:00", behind_by: 2, remote: { url: "u", size_bytes: 651919591, last_modified: null, latest_timestamp: "2026-10-28T21:21:02Z", latest_sequence: 4956 } },
      },
    });
    wrap(<OsmDataCard />);
    expect((await screen.findAllByText(/622 MB/)).length).toBe(2); // local file + latest on Geofabrik
    expect(screen.getByText("2 updates behind")).toBeInTheDocument();
    for (const name of [/import into lead center/i, /check for updates/i, /update data/i, /download fresh copy/i]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
  });
});
