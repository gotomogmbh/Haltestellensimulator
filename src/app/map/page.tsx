export default function MapPage() {
  return (
    <section>
      <h1>Karte</h1>
      <p>
        OSM-basierte Karte mit Haltestellen-Layer (Farbe nach
        Hardware-Integrationsklasse, Opacity nach Confidence) und POI-Layer.
      </p>
      <div className="placeholder">
        MapLibre GL + OpenFreeMap (Vector Tiles) folgt. Komponente wird
        client-side gerendert (<code>ssr: false</code>).
      </div>
    </section>
  );
}
