-- CreateEnum
CREATE TYPE "public"."AmendmentStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."BomStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."MilestoneStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."OrderBomSource" AS ENUM ('MAKE_TO_STOCK', 'MAKE_TO_ORDER');

-- CreateEnum
CREATE TYPE "public"."PackingListStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateEnum
CREATE TYPE "public"."PlanningSource" AS ENUM ('MAKE_TO_STOCK', 'MAKE_TO_ORDER');

-- CreateEnum
CREATE TYPE "public"."PlanningStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ReturnResolution" AS ENUM ('REOPENED_ORDER', 'NEW_ORDER', 'NONE');

-- AlterTable
ALTER TABLE "public"."DirectManufacturingWorkOrder" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."SalesInvoice" ADD COLUMN     "creditedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."SalesOrder" ADD COLUMN     "originalOrderId" TEXT;

-- AlterTable
ALTER TABLE "public"."SalesOrderLine" ADD COLUMN     "reopenedKg" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."SalesReturn" ADD COLUMN     "resendOrderId" TEXT,
ADD COLUMN     "resolution" "public"."ReturnResolution",
ADD COLUMN     "resolutionNote" TEXT;

-- AlterTable
ALTER TABLE "public"."SalesReturnLine" ADD COLUMN     "resendKg" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "salesOrderLineId" TEXT;

-- CreateTable
CREATE TABLE "public"."BomAmendment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "public"."AmendmentStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "orderBomId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BomAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BomAmendmentLine" (
    "id" TEXT NOT NULL,
    "amendmentId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "BomAmendmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrderBom" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "public"."BomStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "public"."OrderBomSource" NOT NULL,
    "standardBomId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderBom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrderBomLine" (
    "id" TEXT NOT NULL,
    "orderBomId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "OrderBomLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PackingList" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "public"."PackingListStatus" NOT NULL DEFAULT 'DRAFT',
    "challanId" TEXT NOT NULL,
    "remark" TEXT,
    "createdById" TEXT NOT NULL,
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PackingPackage" (
    "id" TEXT NOT NULL,
    "packingListId" TEXT NOT NULL,
    "packageNo" INTEGER NOT NULL,
    "packageType" TEXT,
    "grossKg" DECIMAL(12,3) NOT NULL,
    "tareKg" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "PackingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PackingPackageLine" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "challanLineId" TEXT NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "PackingPackageLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlanningAllocation" (
    "id" TEXT NOT NULL,
    "pwoId" TEXT,
    "materialId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlanningMilestone" (
    "id" TEXT NOT NULL,
    "pwoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlanningShortage" (
    "id" TEXT NOT NULL,
    "pwoId" TEXT,
    "materialId" TEXT NOT NULL,
    "requiredQtyKg" DECIMAL(12,3) NOT NULL,
    "allocatedQtyKg" DECIMAL(12,3) NOT NULL,
    "shortageQtyKg" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningShortage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlanningWorkOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "public"."PlanningStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "public"."PlanningSource" NOT NULL,
    "referenceNo" TEXT,
    "materialId" TEXT NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "orderBomId" TEXT,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductionWorkOrderPlaceholder" (
    "id" TEXT NOT NULL,
    "pwoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionWorkOrderPlaceholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PurchaseRequisitionPlaceholder" (
    "id" TEXT NOT NULL,
    "pwoId" TEXT,
    "materialId" TEXT NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseRequisitionPlaceholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StandardBom" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "public"."BomStatus" NOT NULL DEFAULT 'DRAFT',
    "materialId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandardBom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StandardBomLine" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "StandardBomLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StoreIssueSlipPlaceholder" (
    "id" TEXT NOT NULL,
    "pwoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreIssueSlipPlaceholder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BomAmendment_code_key" ON "public"."BomAmendment"("code" ASC);

-- CreateIndex
CREATE INDEX "BomAmendment_orderBomId_idx" ON "public"."BomAmendment"("orderBomId" ASC);

-- CreateIndex
CREATE INDEX "BomAmendment_status_idx" ON "public"."BomAmendment"("status" ASC);

-- CreateIndex
CREATE INDEX "BomAmendmentLine_amendmentId_idx" ON "public"."BomAmendmentLine"("amendmentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrderBom_code_key" ON "public"."OrderBom"("code" ASC);

-- CreateIndex
CREATE INDEX "OrderBom_status_idx" ON "public"."OrderBom"("status" ASC);

-- CreateIndex
CREATE INDEX "OrderBomLine_orderBomId_idx" ON "public"."OrderBomLine"("orderBomId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PackingList_challanId_key" ON "public"."PackingList"("challanId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PackingList_code_key" ON "public"."PackingList"("code" ASC);

-- CreateIndex
CREATE INDEX "PackingList_status_idx" ON "public"."PackingList"("status" ASC);

-- CreateIndex
CREATE INDEX "PackingPackage_packingListId_idx" ON "public"."PackingPackage"("packingListId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PackingPackage_packingListId_packageNo_key" ON "public"."PackingPackage"("packingListId" ASC, "packageNo" ASC);

-- CreateIndex
CREATE INDEX "PackingPackageLine_challanLineId_idx" ON "public"."PackingPackageLine"("challanLineId" ASC);

-- CreateIndex
CREATE INDEX "PackingPackageLine_packageId_idx" ON "public"."PackingPackageLine"("packageId" ASC);

-- CreateIndex
CREATE INDEX "PlanningAllocation_batchId_idx" ON "public"."PlanningAllocation"("batchId" ASC);

-- CreateIndex
CREATE INDEX "PlanningAllocation_materialId_idx" ON "public"."PlanningAllocation"("materialId" ASC);

-- CreateIndex
CREATE INDEX "PlanningAllocation_pwoId_idx" ON "public"."PlanningAllocation"("pwoId" ASC);

-- CreateIndex
CREATE INDEX "PlanningMilestone_pwoId_idx" ON "public"."PlanningMilestone"("pwoId" ASC);

-- CreateIndex
CREATE INDEX "PlanningShortage_materialId_idx" ON "public"."PlanningShortage"("materialId" ASC);

-- CreateIndex
CREATE INDEX "PlanningShortage_pwoId_idx" ON "public"."PlanningShortage"("pwoId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PlanningWorkOrder_code_key" ON "public"."PlanningWorkOrder"("code" ASC);

-- CreateIndex
CREATE INDEX "PlanningWorkOrder_materialId_idx" ON "public"."PlanningWorkOrder"("materialId" ASC);

-- CreateIndex
CREATE INDEX "PlanningWorkOrder_status_idx" ON "public"."PlanningWorkOrder"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionWorkOrderPlaceholder_pwoId_key" ON "public"."ProductionWorkOrderPlaceholder"("pwoId" ASC);

-- CreateIndex
CREATE INDEX "PurchaseRequisitionPlaceholder_pwoId_idx" ON "public"."PurchaseRequisitionPlaceholder"("pwoId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StandardBom_code_key" ON "public"."StandardBom"("code" ASC);

-- CreateIndex
CREATE INDEX "StandardBom_materialId_idx" ON "public"."StandardBom"("materialId" ASC);

-- CreateIndex
CREATE INDEX "StandardBom_status_idx" ON "public"."StandardBom"("status" ASC);

-- CreateIndex
CREATE INDEX "StandardBomLine_bomId_idx" ON "public"."StandardBomLine"("bomId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StoreIssueSlipPlaceholder_pwoId_key" ON "public"."StoreIssueSlipPlaceholder"("pwoId" ASC);

-- CreateIndex
CREATE INDEX "DirectManufacturingWorkOrder_orderBomId_idx" ON "public"."DirectManufacturingWorkOrder"("orderBomId" ASC);

-- CreateIndex
CREATE INDEX "DirectManufacturingWorkOrder_status_idx" ON "public"."DirectManufacturingWorkOrder"("status" ASC);

-- CreateIndex
CREATE INDEX "DirectManufacturingWorkOrder_warehouseId_idx" ON "public"."DirectManufacturingWorkOrder"("warehouseId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturn_resendOrderId_key" ON "public"."SalesReturn"("resendOrderId" ASC);

-- AddForeignKey
ALTER TABLE "public"."BomAmendment" ADD CONSTRAINT "BomAmendment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BomAmendment" ADD CONSTRAINT "BomAmendment_orderBomId_fkey" FOREIGN KEY ("orderBomId") REFERENCES "public"."OrderBom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BomAmendment" ADD CONSTRAINT "BomAmendment_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BomAmendmentLine" ADD CONSTRAINT "BomAmendmentLine_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "public"."BomAmendment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BomAmendmentLine" ADD CONSTRAINT "BomAmendmentLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DirectManufacturingWorkOrder" ADD CONSTRAINT "DirectManufacturingWorkOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DirectManufacturingWorkOrder" ADD CONSTRAINT "DirectManufacturingWorkOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DirectManufacturingWorkOrder" ADD CONSTRAINT "DirectManufacturingWorkOrder_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DirectManufacturingWorkOrder" ADD CONSTRAINT "DirectManufacturingWorkOrder_orderBomId_fkey" FOREIGN KEY ("orderBomId") REFERENCES "public"."OrderBom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DirectManufacturingWorkOrder" ADD CONSTRAINT "DirectManufacturingWorkOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderBom" ADD CONSTRAINT "OrderBom_standardBomId_fkey" FOREIGN KEY ("standardBomId") REFERENCES "public"."StandardBom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderBomLine" ADD CONSTRAINT "OrderBomLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderBomLine" ADD CONSTRAINT "OrderBomLine_orderBomId_fkey" FOREIGN KEY ("orderBomId") REFERENCES "public"."OrderBom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PackingList" ADD CONSTRAINT "PackingList_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "public"."DeliveryChallan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PackingPackage" ADD CONSTRAINT "PackingPackage_packingListId_fkey" FOREIGN KEY ("packingListId") REFERENCES "public"."PackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PackingPackageLine" ADD CONSTRAINT "PackingPackageLine_challanLineId_fkey" FOREIGN KEY ("challanLineId") REFERENCES "public"."DeliveryChallanLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PackingPackageLine" ADD CONSTRAINT "PackingPackageLine_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."PackingPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanningAllocation" ADD CONSTRAINT "PlanningAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanningAllocation" ADD CONSTRAINT "PlanningAllocation_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanningAllocation" ADD CONSTRAINT "PlanningAllocation_pwoId_fkey" FOREIGN KEY ("pwoId") REFERENCES "public"."PlanningWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanningMilestone" ADD CONSTRAINT "PlanningMilestone_pwoId_fkey" FOREIGN KEY ("pwoId") REFERENCES "public"."PlanningWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanningShortage" ADD CONSTRAINT "PlanningShortage_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanningShortage" ADD CONSTRAINT "PlanningShortage_pwoId_fkey" FOREIGN KEY ("pwoId") REFERENCES "public"."PlanningWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanningWorkOrder" ADD CONSTRAINT "PlanningWorkOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanningWorkOrder" ADD CONSTRAINT "PlanningWorkOrder_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanningWorkOrder" ADD CONSTRAINT "PlanningWorkOrder_orderBomId_fkey" FOREIGN KEY ("orderBomId") REFERENCES "public"."OrderBom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlanningWorkOrder" ADD CONSTRAINT "PlanningWorkOrder_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionWorkOrderPlaceholder" ADD CONSTRAINT "ProductionWorkOrderPlaceholder_pwoId_fkey" FOREIGN KEY ("pwoId") REFERENCES "public"."PlanningWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseRequisitionPlaceholder" ADD CONSTRAINT "PurchaseRequisitionPlaceholder_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseRequisitionPlaceholder" ADD CONSTRAINT "PurchaseRequisitionPlaceholder_pwoId_fkey" FOREIGN KEY ("pwoId") REFERENCES "public"."PlanningWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QualityControlPlaceholder" ADD CONSTRAINT "QualityControlPlaceholder_dmwoId_fkey" FOREIGN KEY ("dmwoId") REFERENCES "public"."DirectManufacturingWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalesOrder" ADD CONSTRAINT "SalesOrder_originalOrderId_fkey" FOREIGN KEY ("originalOrderId") REFERENCES "public"."SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalesReturn" ADD CONSTRAINT "SalesReturn_resendOrderId_fkey" FOREIGN KEY ("resendOrderId") REFERENCES "public"."SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "public"."SalesOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StandardBom" ADD CONSTRAINT "StandardBom_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StandardBom" ADD CONSTRAINT "StandardBom_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StandardBom" ADD CONSTRAINT "StandardBom_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StandardBomLine" ADD CONSTRAINT "StandardBomLine_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "public"."StandardBom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StandardBomLine" ADD CONSTRAINT "StandardBomLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreIssueSlipPlaceholder" ADD CONSTRAINT "StoreIssueSlipPlaceholder_pwoId_fkey" FOREIGN KEY ("pwoId") REFERENCES "public"."PlanningWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

