import MapView from "./map-view";

export const dynamic = "force-dynamic";

export default function MapPage() {
  const styleUrl =
    process.env.MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";
  const attribution =
    process.env.MAP_ATTRIBUTION ??
    "© OpenStreetMap contributors, © OpenFreeMap";

  return (
    <section className="map-section">
      <h1>Karte</h1>
      <p className="muted">
        Sites gefärbt nach <code>hardwareClass</code>, Opazität ∝
        <code> confidence</code>. Klick auf einen Stop für Detail.
      </p>
      <MapView styleUrl={styleUrl} attribution={attribution} />
    </section>
  );
}
