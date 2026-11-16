-- AlterEnum
ALTER TYPE "MovementKind" ADD VALUE 'GRN_REJECT';

-- AlterTable
ALTER TABLE "GoodsReceiptLine" ADD COLUMN "rejectedBatchId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceiptLine_rejectedBatchId_key" ON "GoodsReceiptLine"("rejectedBatchId");

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_rejectedBatchId_fkey" FOREIGN KEY ("rejectedBatchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
