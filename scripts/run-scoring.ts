/**
 * One-shot scoring run from the CLI.
 *
 *   pnpm tsx scripts/run-scoring.ts
 */
import { prisma } from "../src/lib/db";
import { runScoring } from "../src/features/scoring/run";

async function main() {
  console.log("Starting scoring run…");
  const result = await runScoring({ triggeredBy: "cli" });
  console.log("Done.", {
    scoringRunId: result.scoringRunId,
    recommendationsCreated: result.recommendationsCreated,
    seconds: (result.durationMs / 1000).toFixed(1),
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
