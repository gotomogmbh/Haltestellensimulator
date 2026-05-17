import { prisma } from "@/lib/db";

export async function listScoringRuns(limit = 25) {
  return prisma.scoringRun.findMany({
    take: limit,
    orderBy: { startedAt: "desc" },
    include: {
      _count: { select: { recommendations: true } },
    },
  });
}

export async function recommendationSizeDistribution() {
  const latestRun = await prisma.scoringRun.findFirst({
    orderBy: { startedAt: "desc" },
    where: { finishedAt: { not: null } },
    select: { id: true, ruleVersion: true, finishedAt: true },
  });
  if (!latestRun) return null;

  const groups = await prisma.recommendation.groupBy({
    by: ["elementSize"],
    where: { scoringRunId: latestRun.id },
    _count: { _all: true },
  });
  const sizeCounts: Record<string, number> = {};
  for (const g of groups) sizeCounts[g.elementSize] = g._count._all;

  const hwGroups = await prisma.recommendation.groupBy({
    by: ["hardwareClass"],
    where: { scoringRunId: latestRun.id },
    _count: { _all: true },
  });
  const hwCounts: Record<string, number> = {};
  for (const g of hwGroups) hwCounts[g.hardwareClass] = g._count._all;

  return {
    run: latestRun,
    sizeCounts,
    hwCounts,
  };
}

export type ScoringRunListItem = Awaited<ReturnType<typeof listScoringRuns>>[number];
