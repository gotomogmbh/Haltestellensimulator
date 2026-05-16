"use client";

import { useActionState } from "react";

import {
  uploadImportFile,
  type UploadResult,
} from "@/features/imports/actions";
import { IMPORT_TYPE_OPTIONS } from "@/features/imports/import-types";

export function UploadForm() {
  const [state, formAction, pending] = useActionState<
    UploadResult | null,
    FormData
  >(uploadImportFile, null);

  return (
    <form action={formAction} className="upload-form">
      <label className="field">
        <span>Import-Typ</span>
        <select name="importType" required defaultValue="HARDWARE_INVENTORY">
          {IMPORT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Datei</span>
        <input type="file" name="file" required />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Wird hochgeladen…" : "Hochladen"}
      </button>
      {state && (
        <div className={`msg ${state.ok ? "msg-ok" : "msg-err"}`}>
          {state.ok
            ? state.duplicate
              ? "Datei bereits bekannt (gleicher contentHash) — neuer Import-Run angelegt, kein Re-Process."
              : `Upload erfolgreich. Run-ID ${state.runId.slice(0, 8)}…`
            : `Fehler: ${state.error}`}
        </div>
      )}
    </form>
  );
}
