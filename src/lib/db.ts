import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });
}

export const prisma: PrismaClient = global.__prismaClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__prismaClient = prisma;
}
