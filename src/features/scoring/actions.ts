"use server";

import { revalidatePath } from "next/cache";

import { runScoring } from "./run";

export type ScoringActionResult =
  | {
      ok: true;
      scoringRunId: string;
      recommendationsCreated: number;
      durationMs: number;
    }
  | { ok: false; error: string };

export async function triggerScoringRun(
  _prev: ScoringActionResult | null,
  _formData: FormData,
): Promise<ScoringActionResult> {
  try {
    const result = await runScoring({ triggeredBy: "ui" });
    revalidatePath("/scoring");
    revalidatePath("/sites");
    return {
      ok: true,
      scoringRunId: result.scoringRunId,
      recommendationsCreated: result.recommendationsCreated,
      durationMs: result.durationMs,
    };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 500) };
  }
}
