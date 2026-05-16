-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "YesNoUnknown" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ElementSize" AS ENUM ('S', 'M', 'L', 'XL', 'XXL');

-- CreateEnum
CREATE TYPE "HardwareIntegrationClass" AS ENUM ('A_REUSE_DFI_STANDALONE', 'B_REUSE_DFI_POLE', 'C_REUSE_TICKET_MACHINE', 'D_REUSE_SHELTER', 'E_POWER_AVAILABLE_NEW_MOUNT', 'F_NO_HARDWARE', 'G_UNKNOWN');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('GTFS_STATIC', 'HARDWARE_INVENTORY', 'POI_EVENT_LOCATIONS', 'PASSENGER_COUNTS', 'MANUAL_SITE_ATTRIBUTES', 'OTHER');

-- CreateEnum
CREATE TYPE "OperatorArea" AS ENUM ('VBZ', 'ZVV', 'MIXED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PoiRelevance" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "municipality" TEXT,
    "didokNumber" TEXT,
    "operatorArea" "OperatorArea" NOT NULL DEFAULT 'UNKNOWN',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardingPoint" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT,
    "gtfsStopId" TEXT,
    "didokNumber" TEXT,
    "direction" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransitLine" (
    "id" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "longName" TEXT,
    "mode" TEXT,
    "agencyId" TEXT,
    "gtfsRouteId" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransitLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteLineAssignment" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "weekdayDepartures" INTEGER,
    "peakHourDepartures" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteLineAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteHardwareInventory" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "dfiStandfuss" "YesNoUnknown" NOT NULL DEFAULT 'UNKNOWN',
    "dfiStrommast" "YesNoUnknown" NOT NULL DEFAULT 'UNKNOWN',
    "ticketautomat" "YesNoUnknown" NOT NULL DEFAULT 'UNKNOWN',
    "strom" "YesNoUnknown" NOT NULL DEFAULT 'UNKNOWN',
    "wartehaus" "YesNoUnknown" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3),
    "sourceImportFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteHardwareInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointOfInterest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "relevance" "PoiRelevance" NOT NULL DEFAULT 'MEDIUM',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "sourceImportFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointOfInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitePoiRelation" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "poiId" TEXT NOT NULL,
    "distanceMeters" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitePoiRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFile" (
    "id" TEXT NOT NULL,
    "importType" "ImportType" NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT,

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "rowsTotal" INTEGER,
    "rowsAccepted" INTEGER,
    "rowsRejected" INTEGER,
    "summary" JSONB,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportError" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "field" TEXT,
    "reason" TEXT NOT NULL,
    "rawValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportMapping" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceColumn" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "transform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringRun" (
    "id" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "siteCount" INTEGER,
    "triggeredBy" TEXT,
    "parameters" JSONB,

    CONSTRAINT "ScoringRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "scoringRunId" TEXT NOT NULL,
    "elementSize" "ElementSize" NOT NULL,
    "elementCount" INTEGER NOT NULL,
    "hardwareClass" "HardwareIntegrationClass" NOT NULL,
    "reasoning" TEXT[],
    "scoreBreakdown" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "inputsSnapshot" JSONB NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_didokNumber_key" ON "Site"("didokNumber");

-- CreateIndex
CREATE INDEX "Site_operatorArea_idx" ON "Site"("operatorArea");

-- CreateIndex
CREATE INDEX "Site_name_idx" ON "Site"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BoardingPoint_gtfsStopId_key" ON "BoardingPoint"("gtfsStopId");

-- CreateIndex
CREATE INDEX "BoardingPoint_siteId_idx" ON "BoardingPoint"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "TransitLine_gtfsRouteId_key" ON "TransitLine"("gtfsRouteId");

-- CreateIndex
CREATE INDEX "TransitLine_shortName_idx" ON "TransitLine"("shortName");

-- CreateIndex
CREATE INDEX "SiteLineAssignment_lineId_idx" ON "SiteLineAssignment"("lineId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteLineAssignment_siteId_lineId_key" ON "SiteLineAssignment"("siteId", "lineId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteHardwareInventory_siteId_key" ON "SiteHardwareInventory"("siteId");

-- CreateIndex
CREATE INDEX "SiteHardwareInventory_dfiStandfuss_idx" ON "SiteHardwareInventory"("dfiStandfuss");

-- CreateIndex
CREATE INDEX "SiteHardwareInventory_dfiStrommast_idx" ON "SiteHardwareInventory"("dfiStrommast");

-- CreateIndex
CREATE INDEX "SiteHardwareInventory_ticketautomat_idx" ON "SiteHardwareInventory"("ticketautomat");

-- CreateIndex
CREATE INDEX "SiteHardwareInventory_strom_idx" ON "SiteHardwareInventory"("strom");

-- CreateIndex
CREATE INDEX "SiteHardwareInventory_wartehaus_idx" ON "SiteHardwareInventory"("wartehaus");

-- CreateIndex
CREATE INDEX "PointOfInterest_relevance_idx" ON "PointOfInterest"("relevance");

-- CreateIndex
CREATE INDEX "PointOfInterest_category_idx" ON "PointOfInterest"("category");

-- CreateIndex
CREATE INDEX "SitePoiRelation_poiId_idx" ON "SitePoiRelation"("poiId");

-- CreateIndex
CREATE INDEX "SitePoiRelation_distanceMeters_idx" ON "SitePoiRelation"("distanceMeters");

-- CreateIndex
CREATE UNIQUE INDEX "SitePoiRelation_siteId_poiId_key" ON "SitePoiRelation"("siteId", "poiId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_contentHash_key" ON "ImportFile"("contentHash");

-- CreateIndex
CREATE INDEX "ImportFile_importType_idx" ON "ImportFile"("importType");

-- CreateIndex
CREATE INDEX "ImportFile_uploadedAt_idx" ON "ImportFile"("uploadedAt");

-- CreateIndex
CREATE INDEX "ImportRun_fileId_idx" ON "ImportRun"("fileId");

-- CreateIndex
CREATE INDEX "ImportRun_status_idx" ON "ImportRun"("status");

-- CreateIndex
CREATE INDEX "ImportError_runId_idx" ON "ImportError"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportMapping_runId_sourceColumn_key" ON "ImportMapping"("runId", "sourceColumn");

-- CreateIndex
CREATE INDEX "ScoringRun_ruleVersion_idx" ON "ScoringRun"("ruleVersion");

-- CreateIndex
CREATE INDEX "ScoringRun_startedAt_idx" ON "ScoringRun"("startedAt");

-- CreateIndex
CREATE INDEX "Recommendation_siteId_computedAt_idx" ON "Recommendation"("siteId", "computedAt" DESC);

-- CreateIndex
CREATE INDEX "Recommendation_hardwareClass_idx" ON "Recommendation"("hardwareClass");

-- CreateIndex
CREATE INDEX "Recommendation_elementSize_idx" ON "Recommendation"("elementSize");

-- CreateIndex
CREATE INDEX "Recommendation_scoringRunId_idx" ON "Recommendation"("scoringRunId");

-- AddForeignKey
ALTER TABLE "BoardingPoint" ADD CONSTRAINT "BoardingPoint_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteLineAssignment" ADD CONSTRAINT "SiteLineAssignment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteLineAssignment" ADD CONSTRAINT "SiteLineAssignment_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "TransitLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteHardwareInventory" ADD CONSTRAINT "SiteHardwareInventory_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteHardwareInventory" ADD CONSTRAINT "SiteHardwareInventory_sourceImportFileId_fkey" FOREIGN KEY ("sourceImportFileId") REFERENCES "ImportFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfInterest" ADD CONSTRAINT "PointOfInterest_sourceImportFileId_fkey" FOREIGN KEY ("sourceImportFileId") REFERENCES "ImportFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePoiRelation" ADD CONSTRAINT "SitePoiRelation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePoiRelation" ADD CONSTRAINT "SitePoiRelation_poiId_fkey" FOREIGN KEY ("poiId") REFERENCES "PointOfInterest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRun" ADD CONSTRAINT "ImportRun_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ImportFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportError" ADD CONSTRAINT "ImportError_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportMapping" ADD CONSTRAINT "ImportMapping_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_scoringRunId_fkey" FOREIGN KEY ("scoringRunId") REFERENCES "ScoringRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
