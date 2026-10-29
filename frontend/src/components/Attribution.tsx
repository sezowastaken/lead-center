import { useI18n } from "../i18n";

// Required ODbL attribution wherever OSM-derived data is shown (spec §4). The credit line itself stays
// in its standard English form in every language.
export default function Attribution() {
  const { t } = useI18n();
  return (
    <p className="text-xs text-subtle">
      {t("attribution.prefix")} ·{" "}
      <a className="underline-offset-2 hover:text-muted hover:underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap contributors
      </a>{" "}
      · ODbL
    </p>
  );
}
