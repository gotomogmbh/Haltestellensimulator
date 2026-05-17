"use client";

import { useActionState } from "react";

import {
  triggerScoringRun,
  type ScoringActionResult,
} from "@/features/scoring/actions";

export function TriggerScoringForm() {
  const [state, formAction, pending] = useActionState<
    ScoringActionResult | null,
    FormData
  >(triggerScoringRun, null);

  return (
    <form action={formAction} className="upload-form">
      <p className="muted">
        Bereitet einen neuen <code>ScoringRun</code> über alle Sites vor.
        Läuft synchron — für ~35 000 Sites typischerweise 1–3 Minuten.
      </p>
      <button type="submit" disabled={pending}>
        {pending ? "Wird berechnet…" : "Scoring-Lauf starten"}
      </button>
      {state && (
        <div className={`msg ${state.ok ? "msg-ok" : "msg-err"}`}>
          {state.ok
            ? `Fertig. ${state.recommendationsCreated} Empfehlungen in ${(state.durationMs / 1000).toFixed(1)}s. Run ${state.scoringRunId.slice(0, 8)}…`
            : `Fehler: ${state.error}`}
        </div>
      )}
    </form>
  );
}
