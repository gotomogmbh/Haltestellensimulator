export default function ScoringPage() {
  return (
    <section>
      <h1>Scoring</h1>
      <p>
        Regeln und Schwellwerte der Empfehlungslogik (Grösse, Anzahl,
        Hardware-Integrationsklasse, Confidence). Siehe{" "}
        <code>docs/scoring.md</code>.
      </p>
      <div className="placeholder">
        Read-only Parameter-Übersicht und Übersicht der <code>ScoringRun</code>s
        folgt.
      </div>
    </section>
  );
}
