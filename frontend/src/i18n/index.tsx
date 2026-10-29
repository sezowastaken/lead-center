/**
 * Minimal i18n: English is the source dictionary, Turkish must provide exactly the same keys
 * (enforced by the type of tr.ts). Strings use {name} placeholders; "one|other" picks a plural
 * form by {count} (Turkish strings simply have no "|").
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en, { type MessageKey } from "./en";
import tr from "./tr";

export type Lang = "en" | "tr";
export type { MessageKey };
export type Vars = Record<string, string | number>;
export type T = (key: MessageKey, vars?: Vars) => string;

export const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "tr", label: "Türkçe" },
];

const DICTS: Record<Lang, Record<MessageKey, string>> = { en, tr };
const LOCALES: Record<Lang, string> = { en: "en-GB", tr: "tr-TR" };
const STORAGE_KEY = "lead-center.lang";

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "tr") return saved;
  } catch {
    /* storage unavailable: fall back to the browser language */
  }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en";
}

// Module-level copy so non-React helpers (date/number formatting) follow the selected language.
let currentLang: Lang = detect();

export function getLang(): Lang {
  return currentLang;
}

export function getLocale(): string {
  return LOCALES[currentLang];
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  let text: string = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  if (text.includes("|") && vars && typeof vars.count === "number") {
    const [one, other] = text.split("|");
    text = vars.count === 1 ? one : other;
  }
  // numbers are written the local way ("16,652" / "16.652"); pass a string to keep a value verbatim
  const show = (v: string | number) => (typeof v === "number" ? v.toLocaleString(LOCALES[lang]) : v);
  return vars ? text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? show(vars[name]) : m)) : text;
}

interface I18n {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
  t: T;
}

const I18nContext = createContext<I18n>({
  lang: currentLang,
  locale: LOCALES[currentLang],
  setLang: () => {},
  t: (key, vars) => translate(currentLang, key, vars),
});

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initial ?? currentLang);
  currentLang = lang;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    currentLang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* not persisted; the choice still applies to this visit */
    }
    setLangState(next);
  }, []);

  const value = useMemo<I18n>(() => ({ lang, locale: LOCALES[lang], setLang, t: (key, vars) => translate(lang, key, vars) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}

/* ---------- Data that comes from the database in English ---------- */

const SECTOR_TR: Record<string, string> = {
  "Beauty / Aesthetics": "Güzellik / Estetik",
  Veterinary: "Veteriner",
  Tattoo: "Dövme",
  "Furniture / Custom Furniture": "Mobilya / Özel Mobilya",
  Photography: "Fotoğrafçılık",
  "Hairdresser / Premium Hair Studio": "Kuaför / Premium Saç Stüdyosu",
  "Pilates / Reformer": "Pilates / Reformer",
  "Auto Care / Detailing": "Oto Bakım / Detailing",
  "Interior Design": "İç Mimarlık",
  "Pet Grooming": "Evcil Hayvan Bakımı",
  Burger: "Burger",
  "Fast Food": "Fast Food",
  Restaurants: "Restoranlar",
  Cafes: "Kafeler",
};

/** Display name of a sector (sector names are stored in English in sectors.json). */
export function sectorName(name: string | null | undefined, lang: Lang = currentLang): string {
  if (!name) return "";
  return lang === "tr" ? (SECTOR_TR[name] ?? name) : name;
}

export function useSectorName(): (name: string | null | undefined) => string {
  const { lang } = useI18n();
  return useCallback((name) => sectorName(name, lang), [lang]);
}

// Location names are stored as in locations.json; only the city's English spelling differs.
const PLACE_TR: Record<string, string> = { Istanbul: "İstanbul" };

export function placeName(name: string | null | undefined, lang: Lang = currentLang): string {
  if (!name) return "";
  return lang === "tr" ? (PLACE_TR[name] ?? name) : name;
}

export function usePlaceName(): (name: string | null | undefined) => string {
  const { lang } = useI18n();
  return useCallback((name) => placeName(name, lang), [lang]);
}

/**
 * Messages produced by the backend (job phases, import summaries) are English; translate the known
 * ones for display. Anything unknown (e.g. a raw error) is shown as sent.
 */
const SERVER_TEXT: [RegExp, MessageKey][] = [
  [/^Starting$/, "server.starting"],
  [/^Downloading$/, "server.downloading"],
  [/^Applying OpenStreetMap changes$/, "server.applyingChanges"],
  [/^Backing up your database$/, "server.backingUp"],
  [/^Scanning OpenStreetMap data$/, "server.scanning"],
  [/^Locating businesses$/, "server.locating"],
  [/^Saving businesses$/, "server.saving"],
  [/^Done$/, "server.done"],
  [/^Cancelled$/, "server.cancelled"],
  [/^Not available$/, "server.notAvailable"],
  [/^Failed$/, "server.failed"],
  [/^Download complete and verified\.$/, "server.downloadComplete"],
  [/^Updated to the latest data\.$/, "server.updated"],
  [/^Already up to date\.$/, "server.alreadyUpToDate"],
  [/^Some updates were applied; more are available/, "server.partialUpdate"],
  [/^This file has no replication information/, "server.noReplication"],
  [/^Incremental update failed \(exit (?<code>\d+)\)/, "server.incrementalFailed"],
  [/^(?<new>\d+) new business(?:es)? added to the review queue · (?<known>\d+) already known\.$/, "server.importSummary"],
  [/^Download cancelled$/, "server.downloadCancelled"],
  [/^Update cancelled$/, "server.updateCancelled"],
  [/^Import cancelled$/, "server.importCancelled"],
];

export function translateServerText(text: string | null | undefined, t: T): string {
  if (!text) return "";
  for (const [pattern, key] of SERVER_TEXT) {
    const m = text.match(pattern);
    if (m) return t(key, Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, Number(v)])));
  }
  return text;
}
