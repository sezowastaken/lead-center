import { describe, expect, it } from "vitest";
import { isDue, todayIso } from "../api/format";
import {
  ratioView,
  secondaryFilterCount,
  suggestStage,
  websiteFilterValue,
  withWebsiteFilter,
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
