import { describe, expect, it } from "vitest";
import { isDue, todayIso } from "../api/format";
import {
  initialQueueNav,
  queueNavReducer,
  ratioView,
  secondaryFilterCount,
  suggestStage,
  websiteFilterValue,
  withWebsiteFilter,
  type QueueAction,
} from "./logic";

describe("website filter", () => {
  it("maps one control onto has_website / website_type", () => {
    expect(withWebsiteFilter({ q: "x" }, "has:false")).toMatchObject({ q: "x", has_website: "false", website_type: undefined });
    expect(withWebsiteFilter({ has_website: "false" }, "type:SOCIAL_ONLY")).toMatchObject({ website_type: "SOCIAL_ONLY", has_website: undefined });
    expect(withWebsiteFilter({ website_type: "SOCIAL_ONLY" }, "")).toMatchObject({ website_type: undefined, has_website: undefined });
    expect(websiteFilterValue({ website_type: "OWN_WEBSITE" })).toBe("type:OWN_WEBSITE");
    expect(websiteFilterValue({ has_website: "true" })).toBe("has:true");
    expect(websiteFilterValue({})).toBe("");
  });

  it("counts only secondary filters that differ from defaults", () => {
    const defaults = { state: "queue", sort: "newest" };
    expect(secondaryFilterCount({ ...defaults, q: "nail", sector_id: "1" }, defaults)).toBe(0);
    expect(secondaryFilterCount({ ...defaults, state: "REJECTED", has_phone: "true" }, defaults)).toBe(2);
  });
});

describe("ratioView", () => {
  it("always shows the raw fraction and flags small samples", () => {
    expect(ratioView({ num: 1, den: 1, pct: 100 })).toEqual({ fraction: "1 / 1", pct: "100%", lowSample: true });
    expect(ratioView({ num: 3, den: 12, pct: 25 })).toEqual({ fraction: "3 / 12", pct: "25%", lowSample: false });
    expect(ratioView({ num: 0, den: 0, pct: null }).pct).toBeNull();
  });
});

describe("suggestStage", () => {
  it("suggests the natural next CRM stage", () => {
    expect(suggestStage("OUTBOUND", "READY_TO_CONTACT")).toBe("CONTACTED");
    expect(suggestStage("INBOUND", "CONTACTED")).toBe("REPLIED");
    expect(suggestStage("INBOUND", "MEETING")).toBe("");
    expect(suggestStage("NOTE", "READY_TO_CONTACT")).toBe("");
  });
});

describe("isDue", () => {
  it("is due today or earlier", () => {
    expect(isDue(todayIso())).toBe(true);
    expect(isDue("2000-01-01")).toBe(true);
    expect(isDue("2999-01-01")).toBe(false);
    expect(isDue(null)).toBe(false);
  });
});

describe("review queue navigation", () => {
  const run = (...actions: QueueAction[]) => actions.reduce(queueNavReducer, initialQueueNav);

  it("advances past decided/skipped businesses and remembers them", () => {
    const s = run({ type: "advance", fromId: 1 }, { type: "advance", fromId: 2 });
    expect(s).toEqual({ trail: [1, 2], back: null, afterId: 2 });
  });

  it("walks back with Previous and forward with Next to the queue head", () => {
    let s = run({ type: "advance", fromId: 1 }, { type: "advance", fromId: 2 }, { type: "previous" });
    expect(s.trail[s.back!]).toBe(2);
    s = queueNavReducer(s, { type: "previous" });
    expect(s.trail[s.back!]).toBe(1);
    s = queueNavReducer(s, { type: "previous" }); // stays at the oldest
    expect(s.back).toBe(0);
    s = queueNavReducer(queueNavReducer(s, { type: "next" }), { type: "next" });
    expect(s.back).toBeNull();
    expect(s.afterId).toBe(2); // the queue head is unchanged
  });

  it("does nothing on Previous with an empty trail, and resets on filter change", () => {
    expect(run({ type: "previous" })).toEqual(initialQueueNav);
    expect(run({ type: "advance", fromId: 5 }, { type: "reset" })).toEqual(initialQueueNav);
  });
});
