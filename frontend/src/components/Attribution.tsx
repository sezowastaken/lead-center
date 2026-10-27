// Required ODbL attribution wherever OSM-derived data is shown (spec §4).
export default function Attribution() {
  return (
    <p className="text-xs text-subtle">
      Business data derived from OpenStreetMap ·{" "}
      <a className="underline-offset-2 hover:text-muted hover:underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap contributors
      </a>{" "}
      · ODbL
    </p>
  );
}
