import Link from "next/link";

import { listSites } from "@/features/sites/queries";
import { OperatorArea, type OperatorArea as OperatorAreaT } from "@/types/domain";

export const dynamic = "force-dynamic";

const OPERATOR_OPTIONS: ReadonlyArray<{ value: OperatorAreaT; label: string }> = [
  { value: "VBZ", label: "VBZ" },
  { value: "ZVV", label: "ZVV" },
  { value: "MIXED", label: "MIXED" },
  { value: "UNKNOWN", label: "UNKNOWN" },
];

type SearchParams = {
  q?: string;
  operatorArea?: string;
  needsReview?: string;
};

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const operatorArea = OperatorArea.safeParse(sp.operatorArea).data;
  const needsReview = sp.needsReview === "1" ? true : undefined;
  const q = sp.q?.trim() || undefined;

  const sites = await listSites({ q, operatorArea, needsReview });

  return (
    <section>
      <h1>Haltestellen</h1>
      <p>VBZ- und Verbund-Sites mit Hardware-Inventar. MVP-Default zeigt alle.</p>

      <form className="filter-form" method="get">
        <label className="field">
          <span>Suche</span>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name, Gemeinde, SLOID, ZVV-/VBZ-ID"
          />
        </label>
        <label className="field">
          <span>Betreiber-Gebiet</span>
          <select name="operatorArea" defaultValue={operatorArea ?? ""}>
            <option value="">Alle</option>
            {OPERATOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-check">
          <input
            type="checkbox"
            name="needsReview"
            value="1"
            defaultChecked={needsReview === true}
          />
          <span>Nur Review-Pflicht</span>
        </label>
        <button type="submit">Filter</button>
        <Link href="/sites" className="link-reset">
          Zurücksetzen
        </Link>
      </form>

      <p className="muted result-count">
        {sites.length} Sites
        {sites.length === 200 ? " (auf 200 begrenzt)" : ""}
      </p>

      {sites.length === 0 ? (
        <p className="muted">Keine Sites gefunden.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Gemeinde</th>
              <th>Gebiet</th>
              <th>HW-Inventar</th>
              <th>Externe IDs</th>
              <th>Aktualisiert</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => {
              const hw = site.hardwareInventory;
              const knownCount = hw
                ? [hw.dfiStandfuss, hw.dfiStrommast, hw.ticketautomat, hw.strom, hw.wartehaus].filter(
                    (v) => v !== "UNKNOWN",
                  ).length
                : 0;
              return (
                <tr key={site.id}>
                  <td>
                    <Link href={`/sites/${site.id}`}>{site.name}</Link>
                  </td>
                  <td>{site.municipality ?? <span className="muted">—</span>}</td>
                  <td>
                    <span className={`status-badge area-${site.operatorArea.toLowerCase()}`}>
                      {site.operatorArea}
                    </span>
                  </td>
                  <td>
                    {hw ? (
                      <span title="Bekannte Pflichtflags / 5">
                        {knownCount} / 5
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="ids">
                    {[site.sloid, site.zvvStopId, site.vbzStopId, site.didokNumber]
                      .filter(Boolean)
                      .map((id) => (
                        <code key={id}>{id}</code>
                      ))}
                  </td>
                  <td>{formatDate(site.updatedAt)}</td>
                  <td>
                    {site.needsReview ? (
                      <span className="status-badge status-needs-review">REVIEW</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
