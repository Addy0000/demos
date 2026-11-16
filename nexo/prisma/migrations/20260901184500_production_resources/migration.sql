-- Ensure enum exists
DO $$ BEGIN
    CREATE TYPE "DirectManufacturingStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'PENDING_QC', 'COMPLETED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ensure DirectManufacturingWorkOrder table exists before altering
CREATE TABLE IF NOT EXISTS "DirectManufacturingWorkOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "DirectManufacturingStatus" NOT NULL DEFAULT 'DRAFT',
    "orderBomId" TEXT NOT NULL,
    "targetQtyKg" DECIMAL(12,3) NOT NULL,
    "actualQtyKg" DECIMAL(12,3),
    "resourceId" TEXT,
    "operatorId" TEXT,
    "shift" TEXT,
    "processLog" TEXT,
    "metrics" JSONB,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "warehouseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DirectManufacturingWorkOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DirectManufacturingWorkOrder_code_key" ON "DirectManufacturingWorkOrder"("code");

-- Ensure QualityControlPlaceholder table exists before downstream migrations alter it
CREATE TABLE IF NOT EXISTS "QualityControlPlaceholder" (
    "id" TEXT NOT NULL,
    "dmwoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verdictById" TEXT,
    "verdictAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityControlPlaceholder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "QualityControlPlaceholder_dmwoId_key" ON "QualityControlPlaceholder"("dmwoId");

-- AlterTable: DirectManufacturingWorkOrder (refactor to generic process worksheet and dynamic resource relation)
ALTER TABLE "DirectManufacturingWorkOrder" DROP COLUMN IF EXISTS "extruderLine",
DROP COLUMN IF EXISTS "tempZone1C",
DROP COLUMN IF EXISTS "tempZone2C",
DROP COLUMN IF EXISTS "tempZone3C",
DROP COLUMN IF EXISTS "rpmSpeed",
DROP COLUMN IF EXISTS "pressurePsi",
ADD COLUMN IF NOT EXISTS "resourceId" TEXT,
ADD COLUMN IF NOT EXISTS "processLog" TEXT,
ADD COLUMN IF NOT EXISTS "metrics" JSONB;

-- CreateTable: ProductionResource
CREATE TABLE IF NOT EXISTS "ProductionResource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductionResource_code_key" ON "ProductionResource"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DirectManufacturingWorkOrder_resourceId_idx" ON "DirectManufacturingWorkOrder"("resourceId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DirectManufacturingWorkOrder_resourceId_fkey'
    ) THEN
        ALTER TABLE "DirectManufacturingWorkOrder" ADD CONSTRAINT "DirectManufacturingWorkOrder_resourceId_fkey" 
        FOREIGN KEY ("resourceId") REFERENCES "ProductionResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
