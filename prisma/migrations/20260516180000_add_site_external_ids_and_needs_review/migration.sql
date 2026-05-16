-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sloid" TEXT,
ADD COLUMN     "vbzStopId" TEXT,
ADD COLUMN     "zvvStopId" TEXT,
ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Site_sloid_key" ON "Site"("sloid");

-- CreateIndex
CREATE UNIQUE INDEX "Site_zvvStopId_key" ON "Site"("zvvStopId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_vbzStopId_key" ON "Site"("vbzStopId");

-- CreateIndex
CREATE INDEX "Site_needsReview_idx" ON "Site"("needsReview");

-- CreateIndex
CREATE INDEX "Site_name_municipality_idx" ON "Site"("name", "municipality");
