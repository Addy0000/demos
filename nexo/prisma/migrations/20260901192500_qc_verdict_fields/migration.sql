-- AlterTable
ALTER TABLE "QualityControlPlaceholder" 
ADD COLUMN IF NOT EXISTS "verdictById" TEXT,
ADD COLUMN IF NOT EXISTS "verdictAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "notes" TEXT,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'QualityControlPlaceholder_verdictById_fkey'
    ) THEN
        ALTER TABLE "QualityControlPlaceholder" ADD CONSTRAINT "QualityControlPlaceholder_verdictById_fkey" 
        FOREIGN KEY ("verdictById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
