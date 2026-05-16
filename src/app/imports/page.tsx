import { listRecentImports } from "@/features/imports/queries";

import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = {
  UPLOADED: "status-uploaded",
  PROCESSING: "status-processing",
  COMPLETED: "status-completed",
  FAILED: "status-failed",
  NEEDS_REVIEW: "status-needs-review",
};

export default async function ImportsPage() {
  const recent = await listRecentImports();

  return (
    <section>
      <h1>Importe</h1>
      <p>
        Upload und Protokollierung externer Datenquellen (Hardware-Inventar
        Excel/CSV, GTFS-ZIP, POI). Verarbeitung läuft synchron für kleine
        Files; GTFS folgt später als CLI-Job.
      </p>

      <UploadForm />

      <h2 className="section-h">Verlauf</h2>
      {recent.length === 0 ? (
        <p className="muted">Noch keine Uploads.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Hochgeladen</th>
              <th>Typ</th>
              <th>Datei</th>
              <th>Grösse</th>
              <th>Status</th>
              <th>Total / ✓ / ✗</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((file) => {
              const latest = file.runs[0];
              const counts = latest
                ? `${latest.rowsTotal ?? "—"} / ${latest.rowsAccepted ?? "—"} / ${latest.rowsRejected ?? "—"}`
                : "—";
              return (
                <tr key={file.id}>
                  <td>{formatDate(file.uploadedAt)}</td>
                  <td>
                    <code>{file.importType}</code>
                  </td>
                  <td>{file.originalFilename}</td>
                  <td>{formatBytes(file.sizeBytes)}</td>
                  <td>
                    {latest ? (
                      <span
                        className={`status-badge ${STATUS_CLASS[latest.status] ?? ""}`}
                      >
                        {latest.status}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{counts}</td>
                  <td>{latest?._count.errors ?? 0}</td>
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
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
