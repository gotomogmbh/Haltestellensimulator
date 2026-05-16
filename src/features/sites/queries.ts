import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { OperatorArea } from "@/types/domain";

export type SiteListParams = {
  q?: string;
  operatorArea?: OperatorArea;
  needsReview?: boolean;
  take?: number;
};

export async function listSites(params: SiteListParams = {}) {
  const { q, operatorArea, needsReview, take = 200 } = params;

  const where: Prisma.SiteWhereInput = {};
  if (q && q.trim().length > 0) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { municipality: { contains: q, mode: "insensitive" } },
      { sloid: { contains: q, mode: "insensitive" } },
      { zvvStopId: { contains: q, mode: "insensitive" } },
      { vbzStopId: { contains: q, mode: "insensitive" } },
    ];
  }
  if (operatorArea) where.operatorArea = operatorArea;
  if (needsReview !== undefined) where.needsReview = needsReview;

  return prisma.site.findMany({
    where,
    take,
    orderBy: [{ needsReview: "desc" }, { updatedAt: "desc" }],
    include: {
      hardwareInventory: {
        select: {
          dfiStandfuss: true,
          dfiStrommast: true,
          ticketautomat: true,
          strom: true,
          wartehaus: true,
          updatedAt: true,
        },
      },
    },
  });
}

export async function countSitesByOperatorArea() {
  const groups = await prisma.site.groupBy({
    by: ["operatorArea"],
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const g of groups) map.set(g.operatorArea, g._count._all);
  return map;
}

export async function getSite(id: string) {
  return prisma.site.findUnique({
    where: { id },
    include: {
      hardwareInventory: {
        include: {
          sourceImportFile: {
            select: {
              id: true,
              originalFilename: true,
              uploadedAt: true,
              contentHash: true,
            },
          },
        },
      },
      boardingPoints: {
        orderBy: { name: "asc" },
      },
      lineAssignments: {
        include: { line: true },
        orderBy: { line: { shortName: "asc" } },
      },
      recommendations: {
        orderBy: { computedAt: "desc" },
        take: 1,
      },
    },
  });
}

export type SiteListItem = Awaited<ReturnType<typeof listSites>>[number];
export type SiteDetail = NonNullable<Awaited<ReturnType<typeof getSite>>>;
