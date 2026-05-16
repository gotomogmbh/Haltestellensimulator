import { prisma } from "@/lib/db";

export async function listRecentImports(limit = 25) {
  return prisma.importFile.findMany({
    take: limit,
    orderBy: { uploadedAt: "desc" },
    include: {
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          _count: { select: { errors: true, mappings: true } },
        },
      },
    },
  });
}

export type RecentImport = Awaited<ReturnType<typeof listRecentImports>>[number];
