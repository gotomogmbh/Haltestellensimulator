import Link from "next/link";
import { notFound } from "next/navigation";

import { getSite } from "@/features/sites/queries";
import type { YesNoUnknown } from "@/types/domain";

export const dynamic = "force-dynamic";

const FLAG_LABELS: ReadonlyArray<{
  field: "dfiStandfuss" | "dfiStrommast" | "ticketautomat" | "strom" | "wartehaus";
  label: string;
}> = [
  { field: "dfiStandfuss", label: "DFI mit Standfuss" },
  { field: "dfiStrommast", label: "DFI am Strommast" },
  { field: "ticketautomat", label: "Ticketautomat" },
  { field: "strom", label: "Strom" },
  { field: "wartehaus", label: "Wartehaus" },
];

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await getSite(id);
  if (!site) notFound();

  const hw = site.hardwareInventory;
  const recommendation = site.recommendations[0];

  return (
    <section>
      <div className="breadcrumb">
        <Link href="/sites">← Haltestellen</Link>
      </div>
      <h1>
        {site.name}
        {site.needsReview && (
          <span className="status-badge status-needs-review header-badge">
            REVIEW
          </span>
        )}
      </h1>
      <p className="muted">
        {site.municipality ?? "— ohne Gemeinde —"} ·{" "}
        <span className={`status-badge area-${site.operatorArea.toLowerCase()}`}>
          {site.operatorArea}
        </span>
      </p>

      <h2 className="section-h">Hardware-Inventar</h2>
      {hw ? (
        <div className="detail-grid">
          {FLAG_LABELS.map(({ field, label }) => (
            <div key={field} className="detail-row">
              <span className="detail-label">{label}</span>
              <FlagBadge value={hw[field]} />
            </div>
          ))}
          {hw.notes && (
            <div className="detail-row detail-row-wide">
              <span className="detail-label">Notizen</span>
              <span>{hw.notes}</span>
            </div>
          )}
          <div className="detail-row detail-row-wide">
            <span className="detail-label">Quelle</span>
            {hw.sourceImportFile ? (
              <span>
                <code>{hw.sourceImportFile.originalFilename}</code>
                <span className="muted">
                  {" "}
                  · {hw.sourceImportFile.uploadedAt.toISOString().slice(0, 10)} ·{" "}
                  {hw.sourceImportFile.contentHash.slice(0, 18)}…
                </span>
              </span>
            ) : (
              <span className="muted">—</span>
            )}
          </div>
        </div>
      ) : (
        <p className="muted">Noch kein Hardware-Inventar erfasst.</p>
      )}

      <h2 className="section-h">Stammdaten</h2>
      <div className="detail-grid">
        <DetailRow label="SLOID" value={site.sloid} mono />
        <DetailRow label="ZVV Stop ID" value={site.zvvStopId} mono />
        <DetailRow label="VBZ Stop ID" value={site.vbzStopId} mono />
        <DetailRow label="DiDok" value={site.didokNumber} mono />
        <DetailRow
          label="Koordinaten"
          value={
            site.latitude != null && site.longitude != null
              ? `${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}`
              : null
          }
        />
        {site.notes && (
          <div className="detail-row detail-row-wide">
            <span className="detail-label">Notizen</span>
            <span>{site.notes}</span>
          </div>
        )}
      </div>

      <h2 className="section-h">Linien</h2>
      {site.lineAssignments.length === 0 ? (
        <p className="muted">Noch keine Linien-Zuordnungen (kommen mit GTFS-Import).</p>
      ) : (
        <ul className="line-list">
          {site.lineAssignments.map((la) => (
            <li key={la.id}>
              <span className="line-badge">{la.line.shortName}</span>
              {la.line.longName && (
                <span className="muted"> {la.line.longName}</span>
              )}
              {la.weekdayDepartures != null && (
                <span className="muted">
                  {" "}
                  · {la.weekdayDepartures} Abfahrten / Werktag
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-h">Steige</h2>
      {site.boardingPoints.length === 0 ? (
        <p className="muted">Noch keine Steige erfasst (kommen mit GTFS-Import).</p>
      ) : (
        <ul className="line-list">
          {site.boardingPoints.map((bp) => (
            <li key={bp.id}>
              {bp.name ?? "Unbenannt"}{" "}
              <span className="muted">
                {bp.gtfsStopId ? `(${bp.gtfsStopId})` : ""}
                {bp.direction ? ` · ${bp.direction}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-h">Empfehlung</h2>
      {recommendation ? (
        <div className="detail-grid">
          <DetailRow label="Grösse" value={recommendation.elementSize} />
          <DetailRow label="Anzahl" value={String(recommendation.elementCount)} />
          <DetailRow label="HW-Klasse" value={recommendation.hardwareClass} mono />
          <DetailRow
            label="Confidence"
            value={recommendation.confidence.toFixed(2)}
          />
          <DetailRow label="Rule-Version" value={recommendation.ruleVersion} mono />
        </div>
      ) : (
        <p className="muted">Noch keine Empfehlung berechnet.</p>
      )}
    </section>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      {value ? (
        mono ? <code>{value}</code> : <span>{value}</span>
      ) : (
        <span className="muted">—</span>
      )}
    </div>
  );
}

function FlagBadge({ value }: { value: YesNoUnknown }) {
  const label = value === "YES" ? "Ja" : value === "NO" ? "Nein" : "Unbekannt";
  const cls =
    value === "YES" ? "flag-yes" : value === "NO" ? "flag-no" : "flag-unknown";
  return <span className={`flag-badge ${cls}`}>{label}</span>;
}
