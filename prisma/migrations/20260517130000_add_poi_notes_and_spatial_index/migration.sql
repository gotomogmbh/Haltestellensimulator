-- AlterTable
ALTER TABLE "PointOfInterest" ADD COLUMN     "notes" TEXT;

-- CreateIndex
CREATE INDEX "PointOfInterest_latitude_longitude_idx" ON "PointOfInterest"("latitude", "longitude");
