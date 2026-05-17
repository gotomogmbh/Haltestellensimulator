import {
  listScoringRuns,
  recommendationSizeDistribution,
} from "@/features/scoring/queries";

import { TriggerScoringForm } from "./trigger-form";

export const dynamic = "force-dynamic";

const SIZE_ORDER = ["S", "M", "L", "XL", "XXL"] as const;
const HW_ORDER = [
  "A_REUSE_DFI_STANDALONE",
  "B_REUSE_DFI_POLE",
  "C_REUSE_TICKET_MACHINE",
  "D_REUSE_SHELTER",
  "E_POWER_AVAILABLE_NEW_MOUNT",
  "F_NO_HARDWARE",
  "G_UNKNOWN",
] as const;

export default async function ScoringPage() {
  const [runs, distribution] = await Promise.all([
    listScoringRuns(),
    recommendationSizeDistribution(),
  ]);

  return (
    <section>
      <h1>Scoring</h1>
      <p>
        Regelbasierte Empfehlungslogik (Grösse, Anzahl, Hardware-Klasse,
        Confidence) — Details in <code>docs/scoring.md</code>. Aktuelle
        Regel-Version: <code>scoring@0.3.0</code>.
      </p>

      <TriggerScoringForm />

      {distribution && (
        <>
          <h2 className="section-h">Verteilung im letzten Lauf</h2>
          <p className="muted">
            Lauf {distribution.run.id.slice(0, 8)}…{" "}
            ({distribution.run.ruleVersion}, abgeschlossen{" "}
            {formatDate(distribution.run.finishedAt)})
          </p>

          <div className="dist-grid">
            <div>
              <h3 className="section-h">Elementgrösse</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Grösse</th>
                    <th>Sites</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZE_ORDER.map((s) => (
                    <tr key={s}>
                      <td>
                        <code>{s}</code>
                      </td>
                      <td>{distribution.sizeCounts[s] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="section-h">Hardware-Klasse</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Klasse</th>
                    <th>Sites</th>
                  </tr>
                </thead>
                <tbody>
                  {HW_ORDER.map((h) => (
                    <tr key={h}>
                      <td>
                        <code>{h}</code>
                      </td>
                      <td>{distribution.hwCounts[h] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <h2 className="section-h">Verlauf</h2>
      {runs.length === 0 ? (
        <p className="muted">Noch keine Scoring-Läufe.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Gestartet</th>
              <th>Beendet</th>
              <th>Rule-Version</th>
              <th>Sites</th>
              <th>Empfehlungen</th>
              <th>Trigger</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.startedAt)}</td>
                <td>{r.finishedAt ? formatDate(r.finishedAt) : <span className="muted">läuft…</span>}</td>
                <td>
                  <code>{r.ruleVersion}</code>
                </td>
                <td>{r.siteCount ?? "—"}</td>
                <td>{r._count.recommendations}</td>
                <td>{r.triggeredBy ?? <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 19).replace("T", " ");
}
