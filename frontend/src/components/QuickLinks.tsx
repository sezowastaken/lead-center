import { Globe, Map as MapIcon, MapPinned, Search } from "lucide-react";
import { externalUrl, googleMapsUrl, googleSearchUrl } from "../api/links";
import type { Business } from "../api/types";
import { useI18n } from "../i18n";
import { ButtonLink } from "./ui";

/** Manual research shortcuts (spec §23). They only open new tabs. */
export default function QuickLinks({
  business,
  website,
  showOsm = false,
  size = "sm",
}: {
  business: Business;
  website?: string | null;
  showOsm?: boolean;
  size?: "sm" | "md";
}) {
  const { t } = useI18n();
  const site = externalUrl(website ?? business.website);
  return (
    <div className="flex flex-wrap gap-1.5">
      <ButtonLink href={googleSearchUrl(business)} variant="secondary" size={size} title={t("links.googleTitle")}>
        <Search className="h-3.5 w-3.5" /> Google
      </ButtonLink>
      <ButtonLink href={googleMapsUrl(business)} variant="secondary" size={size} title={t("links.mapsTitle")}>
        <MapPinned className="h-3.5 w-3.5" /> Maps
      </ButtonLink>
      {site && (
        <ButtonLink href={site} variant="secondary" size={size}>
          <Globe className="h-3.5 w-3.5" /> {t("links.website")}
        </ButtonLink>
      )}
      {showOsm && (
        <ButtonLink href={business.osm_url} variant="ghost" size={size} title={t("links.osmTitle")}>
          <MapIcon className="h-3.5 w-3.5" /> OSM
        </ButtonLink>
      )}
    </div>
  );
}
