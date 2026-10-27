import { Globe, Map as MapIcon, MapPinned, Search } from "lucide-react";
import { externalUrl, googleMapsUrl, googleSearchUrl } from "../api/links";
import type { Business } from "../api/types";
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
  const site = externalUrl(website ?? business.website);
  return (
    <div className="flex flex-wrap gap-1.5">
      <ButtonLink href={googleSearchUrl(business)} variant="secondary" size={size} title="Search the name + district on Google">
        <Search className="h-3.5 w-3.5" /> Google
      </ButtonLink>
      <ButtonLink href={googleMapsUrl(business)} variant="secondary" size={size} title="Open the coordinates in Google Maps">
        <MapPinned className="h-3.5 w-3.5" /> Maps
      </ButtonLink>
      {site && (
        <ButtonLink href={site} variant="secondary" size={size}>
          <Globe className="h-3.5 w-3.5" /> Website
        </ButtonLink>
      )}
      {showOsm && (
        <ButtonLink href={business.osm_url} variant="ghost" size={size} title="Open the OpenStreetMap record">
          <MapIcon className="h-3.5 w-3.5" /> OSM
        </ButtonLink>
      )}
    </div>
  );
}
