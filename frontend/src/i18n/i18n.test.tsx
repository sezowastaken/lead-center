import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageSwitch } from "../components/Layout";
import SettingsPage from "../pages/SettingsPage";
import { mockApi } from "../test/fixtures";
import en, { type MessageKey } from "./en";
import { I18nProvider, placeName, sectorName, translate, translateServerText, useI18n } from "./index";
import tr from "./tr";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("dictionaries", () => {
  it("Turkish has exactly the English keys, all non-empty", () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(tr)) expect(value.trim(), key).not.toBe("");
  });

  it("Turkish keeps every placeholder and code span of the English string", () => {
    for (const key of Object.keys(en) as MessageKey[]) {
      expect([...new Set(placeholders(tr[key]))], key).toEqual([...new Set(placeholders(en[key]))]);
      expect(tr[key].split("`").length, key).toBe(en[key].split("`").length);
      expect(tr[key], key).not.toContain("|"); // no plural forms in Turkish
    }
  });
});

describe("translate", () => {
  it("interpolates and picks English plural forms by count", () => {
    expect(translate("en", "discover.count", { count: 1 })).toBe("1 business");
    expect(translate("en", "discover.count", { count: 3 })).toBe("3 businesses");
    expect(translate("tr", "discover.count", { count: 3 })).toBe("3 işletme");
    expect(translate("tr", "session.position", { position: 4, total: 30 })).toBe("4 / 30");
  });

  it("writes numbers the local way", () => {
    expect(translate("en", "discover.count", { count: 16652 })).toBe("16,652 businesses");
    expect(translate("tr", "discover.count", { count: 16652 })).toBe("16.652 işletme");
    expect(placeName("Istanbul", "tr")).toBe("İstanbul");
    expect(placeName("Istanbul", "en")).toBe("Istanbul");
  });

  it("translates sector names and known server messages, leaving unknown text alone", () => {
    expect(sectorName("Beauty / Aesthetics", "tr")).toBe("Güzellik / Estetik");
    expect(sectorName("Something new", "tr")).toBe("Something new");
    const t = (k: MessageKey, v?: Record<string, string | number>) => translate("tr", k, v);
    expect(translateServerText("12 new businesses added to the review queue · 16606 already known.", t)).toBe(
      "İnceleme kuyruğuna eklendi: 12 yeni · 16.606 zaten kayıtlı.",
    );
    expect(translateServerText("Locating businesses", t)).toBe("İşletmelerin konumu bulunuyor");
    expect(translateServerText("disk full", t)).toBe("disk full");
  });
});

function Nav() {
  const { t } = useI18n();
  return <h1>{t("nav.discover")}</h1>;
}

describe("switching language", () => {
  afterEach(() => localStorage.clear());

  it("re-renders in Turkish and remembers the choice", async () => {
    render(
      <I18nProvider initial="en">
        <Nav />
        <LanguageSwitch />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Discover");
    await userEvent.click(screen.getByRole("button", { name: "Türkçe" }));
    expect(screen.getByRole("heading")).toHaveTextContent("Keşfet");
    expect(screen.getByRole("button", { name: "Türkçe" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("lead-center.lang")).toBe("tr");
    expect(document.documentElement.lang).toBe("tr");
  });

  it("Settings offers the language choice and translates its sections", async () => {
    mockApi({ "/api/review/progress": { reviewed_today: 0, target: 30 }, "/api/osm-data": { pbf: null, job: null } });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = (ui: ReactNode) => (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    );
    render(wrap(<I18nProvider initial="en"><SettingsPage /></I18nProvider>));
    await userEvent.click(await screen.findByRole("radio", { name: "Türkçe" }));
    expect(screen.getByRole("heading", { name: "Ayarlar" })).toBeInTheDocument();
    expect(screen.getByText("Günlük inceleme hedefi")).toBeInTheDocument();
    expect(screen.getByText("Yedekler")).toBeInTheDocument();
  });
});
