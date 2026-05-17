import { prisma } from "@/lib/db";

import {
  RULE_VERSION,
  computeRecommendation,
  type ScoringInputs,
} from "./engine";

const SITE_FETCH_BATCH = 1000;
const RECOMMENDATION_INSERT_BATCH = 1000;

const POI_RELEVANCE_WEIGHT = {
  LOW: 0.25,
  MEDIUM: 0.5,
  HIGH: 1.0,
  CRITICAL: 2.0,
} as const;

export type RunScoringResult = {
  scoringRunId: string;
  recommendationsCreated: number;
  durationMs: number;
};

export async function runScoring(opts: {
  triggeredBy?: string;
} = {}): Promise<RunScoringResult> {
  const startedAt = Date.now();
  const run = await prisma.scoringRun.create({
    data: {
      ruleVersion: RULE_VERSION,
      triggeredBy: opts.triggeredBy ?? "manual",
      parameters: { batchSize: SITE_FETCH_BATCH },
    },
  });

  const today = new Date();
  let offset = 0;
  let totalProcessed = 0;
  let totalCreated = 0;

  // Iterate Sites in batches to keep memory low. 35k+ Sites with their
  // relations would otherwise hold hundreds of MB in one shot.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const sites = await prisma.site.findMany({
      skip: offset,
      take: SITE_FETCH_BATCH,
      orderBy: { id: "asc" },
      include: {
        hardwareInventory: {
          select: {
            dfiStandfuss: true,
            dfiStrommast: true,
            ticketautomat: true,
            strom: true,
            wartehaus: true,
          },
        },
        lineAssignments: {
          select: { weekdayDepartures: true },
        },
        poiRelations: {
          select: {
            poi: {
              select: {
                relevance: true,
                validFrom: true,
                validTo: true,
              },
            },
          },
        },
      },
    });
    if (sites.length === 0) break;

    const batchData = sites.map((site) => {
      const hardware = site.hardwareInventory;
      const inputs: ScoringInputs = {
        hardware: {
          dfiStandfuss: hardware?.dfiStandfuss ?? "UNKNOWN",
          dfiStrommast: hardware?.dfiStrommast ?? "UNKNOWN",
          ticketautomat: hardware?.ticketautomat ?? "UNKNOWN",
          strom: hardware?.strom ?? "UNKNOWN",
          wartehaus: hardware?.wartehaus ?? "UNKNOWN",
          hasInventory: Boolean(hardware),
        },
        frequency: {
          weekdayDeparturesSum: site.lineAssignments.reduce(
            (sum, la) => sum + (la.weekdayDepartures ?? 0),
            0,
          ),
          servedRoutesCount: site.lineAssignments.length,
        },
        poi: {
          relevanceSum: site.poiRelations.reduce(
            (sum, rel) => sum + POI_RELEVANCE_WEIGHT[rel.poi.relevance],
            0,
          ),
          eventsActive: site.poiRelations.some((rel) =>
            isEventActive(rel.poi.validFrom, rel.poi.validTo, today),
          ),
        },
        site: { needsReview: site.needsReview },
      };

      const r = computeRecommendation(inputs);
      return {
        siteId: site.id,
        scoringRunId: run.id,
        elementSize: r.elementSize,
        elementCount: r.elementCount,
        hardwareClass: r.hardwareClass,
        scoreBreakdown: r.scoreBreakdown,
        reasoning: r.reasoning,
        confidence: r.confidence,
        inputsSnapshot: r.inputsSnapshot,
        ruleVersion: r.ruleVersion,
      };
    });

    for (let i = 0; i < batchData.length; i += RECOMMENDATION_INSERT_BATCH) {
      const chunk = batchData.slice(i, i + RECOMMENDATION_INSERT_BATCH);
      const result = await prisma.recommendation.createMany({ data: chunk });
      totalCreated += result.count;
    }
    totalProcessed += sites.length;

    offset += sites.length;
    if (sites.length < SITE_FETCH_BATCH) break;
  }

  const durationMs = Date.now() - startedAt;

  await prisma.scoringRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      siteCount: totalProcessed,
      parameters: {
        batchSize: SITE_FETCH_BATCH,
        recommendationsCreated: totalCreated,
        durationMs,
      },
    },
  });

  return {
    scoringRunId: run.id,
    recommendationsCreated: totalCreated,
    durationMs,
  };
}

function isEventActive(
  validFrom: Date | null,
  validTo: Date | null,
  today: Date,
): boolean {
  if (!validFrom && !validTo) return false;
  if (validFrom && today < validFrom) return false;
  if (validTo && today > validTo) return false;
  return true;
}
