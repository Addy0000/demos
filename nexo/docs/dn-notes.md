# Task Reconnaissance Notes: Debit Note (Purchase Side)

These reconnaissance notes document the codebase state for introducing first-class Debit Note documents on the purchase/procurement side (mirroring the Credit Note built for sales returns in F3).

---

### a) How GRN Rejection Works & Where Rejected Value is Computed

- **GRN Rejection Models & Schema Fields**:
  - `prisma/schema.prisma` (lines 800–829):
    - `GoodsReceiptLine` contains:
      - `receivedQtyKg` (Decimal(12, 3)): weighed inward quantity.
      - `acceptedQtyKg` (Decimal(12, 3)): quantity passing inspection.
      - `rejectedQtyKg` (Decimal(12, 3), default 0): quantity failing inspection.
      - `qcResult` (`QcResult` enum: `PENDING`, `PASS`, `FAIL`, `CONDITIONAL`).
      - `qcRemark` (String?): explanation of failure/condition.
      - `batchId` (String?, `@unique`): links to accepted batch (`InventoryBatch`) in Main Store (`WarehouseKind.STORE`).
      - `rejectedBatchId` (String?, `@unique`): links to rejected batch (`InventoryBatch`) in Rejection warehouse (`WarehouseKind.REJECTION`).
  - `prisma/schema.prisma` (lines 840–878):
    - `InventoryBatch` for rejected material:
      - `warehouseId`: points to `Warehouse` where `kind = WarehouseKind.REJECTION` (`WH-REJ`).
      - `status`: `BatchStatus.REJECTED`.
      - `receivedQtyKg`: equals `rejectedQtyKg`.
      - `availableQtyKg`: equals `rejectedQtyKg`.
      - `ratePerKg`: snapshot of `purchaseOrderLine.ratePerKg`.
  - `prisma/schema.prisma` (lines 1214–1270):
    - `VendorRejectionNote` (`VRN`): created against `goodsReceiptId` and `vendorId` with `status: VrnStatus` (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `DISPATCHED`, `CLOSED`, `CANCELLED`).
    - `VendorRejectionNoteLine`: lines snapshot `grnLineId`, `materialId`, `lineNo`, `quantityKg` (`rejectedQtyKg`), `ratePerKg` (`purchaseOrderLine.ratePerKg`), and `reason` (`qcRemark`).

- **Where QC Inspection & Rejection is Executed**:
  - `src/app/(app)/procurement/actions.ts` inside `postGoodsReceipt` (lines 423–608):
    - **Line 457**: Resolves active `rejectionWh` (`prisma.warehouse.findFirst({ where: { kind: WarehouseKind.REJECTION, isActive: true } })`).
    - **Lines 470–474**: Validates `acceptedQtyKg + rejectedQtyKg <= receivedQtyKg`.
    - **Lines 538–567**: When `rejected > 0`, atomically creates an `InventoryBatch` in `rejectionWh` with `BatchStatus.REJECTED` and logs a `StockMovement` of `kind: MovementKind.GRN_REJECT`.
    - **Lines 569–579**: Updates `GoodsReceiptLine` setting `acceptedQtyKg`, `rejectedQtyKg`, `qcResult`, `qcRemark`, `rejectedBatchId`.
    - **Lines 581–588**: Updates `purchaseOrderLine.receivedKg` with `increment: delta` based **strictly on `accepted`** quantity (`delta = accepted - previouslyCounted`). Rejected quantity does NOT advance PO received progress.
    - **Lines 591–600**: Sets `GoodsReceipt.status` to `GrnStatus.QC_FAILED` (if any fail), `PARTIALLY_ACCEPTED` (if any conditional), or `POSTED`.
  - `src/app/(app)/procurement/sourcing-actions.ts` inside `raiseRejectionNote` (lines 1003–1066):
    - Creates `VendorRejectionNote` from lines where `rejectedQtyKg > 0`.
  - `src/app/(app)/procurement/sourcing-actions.ts` inside `dispatchRejectionNote` (lines 1117–1195):
    - Decrements `availableQtyKg` on the rejected batch in `rejectionWh` and logs a `StockMovement` of `kind: MovementKind.VRN_DISPATCH`.

- **Where Rejected Value is Computed**:
  - `src/app/(app)/metrics.ts` (lines 72–81, 95):
    ```sql
    SELECT COUNT(DISTINCT g.id)::int AS n,
           COALESCE(SUM(gl."rejectedQtyKg" * pl."ratePerKg"), 0)::float AS v,
           MIN(g."receivedOn") AS oldest
    FROM "GoodsReceipt" g
    JOIN "GoodsReceiptLine" gl ON gl."goodsReceiptId" = g.id
    JOIN "PurchaseOrderLine" pl ON pl.id = gl."purchaseOrderLineId"
    WHERE gl."rejectedQtyKg" > 0
      AND NOT EXISTS (SELECT 1 FROM "VendorRejectionNote" r WHERE r."goodsReceiptId" = g.id AND r.status <> 'CANCELLED')
    ```
    Surfaced on line 95 as: `{ key: "unreturned", label: "Rejected, no debit note", value: j.v, owner: "Purchase" }`.
  - `src/app/(app)/procurement/sourcing-actions.ts` (lines 1040–1047):
    Line amount is `quantityKg * ratePerKg` (`rejectedQtyKg * purchaseOrderLine.ratePerKg`). Note: Tax is not currently computed on `VendorRejectionNoteLine`.

---

### b) Vendor Bill Model

- **Model Definition & Relations**:
  - `prisma/schema.prisma` (lines 2019–2056):
    ```prisma
    model VendorBill {
      id              String           @id @default(cuid())
      code            String           @unique // AP-0001
      status          VendorBillStatus @default(DRAFT)
      basis           VendorBillBasis  // PO | GRN | MANUAL
      vendorId        String
      vendor          Vendor           @relation(fields: [vendorId], references: [id], onDelete: Restrict)
      purchaseOrderId String?
      purchaseOrder   PurchaseOrder?   @relation(fields: [purchaseOrderId], references: [id], onDelete: SetNull)
      goodsReceiptId  String?
      goodsReceipt    GoodsReceipt?    @relation(fields: [goodsReceiptId], references: [id], onDelete: SetNull)
      billNo          String?          // Vendor's invoice number
      billDate        DateTime         @default(now())
      dueOn           DateTime?
      subtotal        Decimal          @default(0) @db.Decimal(14, 2)
      taxAmount       Decimal          @default(0) @db.Decimal(14, 2)
      totalValue      Decimal          @default(0) @db.Decimal(14, 2)
      paidAmount      Decimal          @default(0) @db.Decimal(14, 2)
      createdById     String?
      createdBy       User?            @relation("BillCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
      remark          String?
      postings        LedgerPosting[]
      createdAt       DateTime         @default(now())
      updatedAt       DateTime         @updatedAt
    }
    ```
- **How it links to GRN / PO**:
  - Direct foreign keys: `purchaseOrderId` and `goodsReceiptId` (both nullable).
  - Selected by `basis`: `VendorBillBasis` enum (`PO`, `GRN`, `MANUAL`) defined in `prisma/schema.prisma` lines 1954–1958.
  - Resolved in `src/app/api/finance/vendor-bills/route.ts` (lines 121–158): resolves `purchaseOrderId` if `basis === "PO"`, resolves `goodsReceiptId` if `basis === "GRN"`.
- **Tax Storage (Per Line or Aggregate)**:
  - **Header aggregate only**. Fields: `subtotal`, `taxAmount`, `totalValue` on `VendorBill`.
  - **There is NO `VendorBillLine` table in the database.** Line-level details and per-line tax rates do not exist on the bill itself; they exist upstream on `PurchaseOrderLine` (`ratePerKg`, `taxPct`).
- **Paid and Outstanding Fields**:
  - `paidAmount Decimal @default(0)` exists on `VendorBill`.
  - There is NO `creditedAmount`, `debitedAmount`, or `outstandingAmt` column on `VendorBill`.
  - Outstanding balance is computed dynamically as `totalValue - paidAmount` (`src/app/api/finance/payable/[billId]/pay/route.ts` line 80).
- **Status Values**:
  - `VendorBillStatus` enum (`prisma/schema.prisma` lines 1960–1967):
    `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `PAID`, `PARTIALLY_PAID`, `VOID`.
  - Newly created bills via API route `POST /api/finance/vendor-bills` default directly to `VendorBillStatus.APPROVED` (line 195).
- **How Payments are Applied**:
  - Endpoint: `POST /api/finance/payable/[billId]/pay` (`src/app/api/finance/payable/[billId]/pay/route.ts` lines 37–126).
  - Enforces `bill.status === APPROVED || PARTIALLY_PAID`.
  - Validates `amount <= (totalValue - paidAmount) + 0.01`.
  - Updates `paidAmount += amount`.
  - Updates `status` to `PAID` (if `newPaidAmount >= totalValue - 0.01`) or `PARTIALLY_PAID`.
  - Posts bank disbursement using `postBankTransaction` (`src/lib/postBankTransaction.ts` lines 26–90):
    - Debit Account `2000` (Accounts Payable).
    - Credit Account `1000` (Bank / Cash).
    - `sourceType: PostingSourceType.PAYMENT`, `sourceId: billId`, `vendorBillId: billId`.
- **Whether Bill Amount is Based on Received or Accepted Quantity**:
  - In `src/app/api/finance/vendor-bills/route.ts` lines 106–118 and UI `src/app/(app)/finance/payable/page.tsx` lines 106–111, the bill `amount` and `taxAmount` are **entered manually by the user**.
  - In practice, vendors invoice for the full quantity dispatched/delivered (received quantity) before the buyer inspects. When entered against a GRN, the bill reflects the vendor's invoice (received quantity). However, the dashboard metric in `src/app/(app)/metrics.ts` line 64 assumes clean matching against `acceptedQtyKg * ratePerKg`.

---

### c) Order of Events: Rejection vs Bill Timing

1. **Path 1: Rejection recorded BEFORE Bill exists (Standard Store-First Flow)**
   - Goods physically arrive at store; Store raises `GoodsReceipt` (`status: PENDING_QC`).
   - Store / QC inspects goods via `postGoodsReceipt` (`procurement/actions.ts` line 423).
   - Rejection is recorded (`rejectedQtyKg > 0`); rejected stock goes into Rejection warehouse (`status: REJECTED`), accepted stock goes to Main Store.
   - Store raises `VendorRejectionNote` (`VRN`) to return material to vendor.
   - Subsequently, Finance receives the vendor's commercial invoice and enters a `VendorBill` at `/finance/payable`:
     - If the vendor billed for the full delivery (common in India / manufacturing), the `VendorBill` is registered for the gross received amount. A Debit Note is immediately required to offset the rejected quantity.
     - If the vendor already issued a revised bill for accepted quantity only, the bill is net and no debit note is necessary.

2. **Path 2: Bill exists BEFORE QC / GRN Rejection (Commercial-First / Advance Flow)**
   - Finance enters `VendorBill` based on PO (advance/proforma) or when lorry arrives with invoice before QC inspection completes.
   - `VendorBill` is created in `APPROVED` status, immediately posting:
     - Debit `5000 Purchases` (total invoice value).
     - Credit `2000 Accounts Payable` (total invoice value).
   - Later, Stores performs QC in `postGoodsReceipt`:
     - Material fails inspection and is rejected.
     - Inventory accepts only the passing material.
   - At this point, Accounts Payable is over-stated because the bill was already booked for 100% of the material.
   - A Debit Note must be created against this pre-existing `VendorBill` to debit Accounts Payable (`2000`) and credit Purchases (`5000`) / Tax.

---

### d) Ledger Posting for Vendor Bills

- **Current Implementation**:
  - `src/app/api/finance/vendor-bills/route.ts` (lines 200–223):
    - **Debit**: Purchase Account (`purchaseAccountCode`, default `5000` Purchases) for `totalValue` (`amount + taxAmount`).
    - **Credit**: Payable Account (`code: "2000"`, Accounts Payable) for `totalValue`.
    - `sourceType`: `PostingSourceType.VENDOR_BILL`.
    - `sourceId`: `newBill.id`.
    - `vendorBillId`: `newBill.id`.
- **Chart of Accounts**:
  - `2000`: Accounts Payable (`type: AccountType.LIABILITY`) — `prisma/seedFin.ts` line 11.
  - `5000`: Purchases (`type: AccountType.EXPENSE`) — `prisma/seedFin.ts` line 14.
  - `1000`: Inventory Asset (`type: AccountType.ASSET`) — also used as default Bank account in `postBankTransaction.ts` line 30.
  - `2100`: Output GST Payable (`type: AccountType.LIABILITY`) — sales tax only.
  - **Note on Input Tax**: There is currently NO dedicated Input GST / Input Tax account seeded in `seedFin.ts`. Current vendor bill registration dumps both subtotal and `taxAmount` into the debit to `5000 Purchases`.
- **PostingSourceType Values**:
  - `prisma/schema.prisma` (lines 1974–1981):
    ```prisma
    enum PostingSourceType {
      VENDOR_BILL
      SALES_INVOICE
      PAYMENT
      JOURNAL_ENTRY
      STOCK_MOVEMENT
      CREDIT_NOTE
    }
    ```
  - `DEBIT_NOTE` does not yet exist in the enum.

---

### e) Double-Reversal Risk

- **Does anything currently reduce Payable or Bill on rejection?**
  - **NO.** When a rejection occurs in `postGoodsReceipt` or `dispatchRejectionNote`:
    - Material quantities move between warehouses (`MovementKind.GRN_REJECT`, `VRN_DISPATCH`).
    - PO `receivedKg` only increments by `acceptedQtyKg`.
    - Zero ledger postings are made.
    - Zero updates are made to `VendorBill`, `paidAmount`, or Accounts Payable (`2000`).
- **What could a Debit Note duplicate?**
  1. **Net-billed bills**: If an accountant already entered the `VendorBill` manually using only the accepted quantity (`acceptedQtyKg * rate`), issuing a Debit Note for the rejected goods against that bill would double-deduct the rejection.
  2. **Manual credit adjustments / Journal Entries**: If an accountant posts a manual Journal Entry debiting `2000 AP` and crediting `5000 Purchases`.
  3. **Duplicate notes**: If a Debit Note is created both at GRN QC inspection and again upon VRN approval or despatch.
  - **Protection Required**:
    - Debit notes must link uniquely to `(goodsReceiptId, vendorBillId)` or `(vendorRejectionNoteId, vendorBillId)`.
    - Validate that the Debit Note total does not exceed the bill's remaining debited/unpaid balance.

---

### f) What Should Happen When the Bill is Already Paid (Options)

1. **Option 1 (Unapplied Vendor Credit Balance / Advance)**:
   Issue the Debit Note linked to the paid bill for accounting audit history, but post the debit to Accounts Payable (`2000`) or a "Vendor Advance / Credit" sub-ledger, creating a negative payable balance that automatically offsets against subsequent vendor bills from the same vendor.
2. **Option 2 (Vendor Refund Receivable)**:
   Issue the Debit Note and post to a "Vendor Refund Receivable" asset account pending cash/bank recovery from the vendor.
3. **Option 3 (Disallow / Guard against Paid Bills)**:
   Prevent creating a Debit Note if `paidAmount >= totalValue`, requiring the user to link the debit note to another open/unpaid bill of the same vendor or handle via manual adjustment.
4. **Option 4 (Automatic / Prompted Bank Refund Transaction)**:
   Allow the Debit Note, and immediately record (or prompt for) a reverse payment / bank receipt transaction (`DR 1000 Bank`, `CR 2000 Accounts Payable`) when the vendor refunds the cash.
5. **Option 5 (Bill Status Reopening / Overpaid Tracking)**:
   Add `debitedAmount` to `VendorBill` (matching `creditedAmount` on `SalesInvoice`). If `paidAmount + debitedAmount > totalValue`, flag the bill as `OVERPAID` / `REFUND_DUE`.

---

### g) Number Generator in Purchase Module vs Shared `nextSeq`

- **Procurement Module Generator (`nextCode`)**:
  - `src/app/(app)/procurement/sourcing-actions.ts` (lines 30–53):
    ```ts
    async function nextCode(prefix: string, table: "pr" | "pi" | "pq" | "vrn"): Promise<string>
    ```
    - Hardcoded union: `"pr" | "pi" | "pq" | "vrn"`.
    - Queries `purchaseRequisition`, `purchaseInquiry`, `purchaseQuotation`, `vendorRejectionNote`.
    - Format: `${prefix}-${year}-${String(nextNum).padStart(4, "0")}`.
    - **Does not accept new models** without updating the union and `findMany` mapping.
- **Sales Module Generator (`nextSeq`)**:
  - `src/app/(app)/sales/sales-core.ts` (lines 27–59):
    ```ts
    async function nextSeq(
      prefix: string,
      model: "salesOrder" | "deliveryChallan" | "salesInvoice" | "salesReturn" | "salesInquiry" | "costSheet" | "salesQuotation" | "packingList" | "creditNote",
      field: "code" | "number" = "code",
      client: any = prisma,
    ): Promise<string>
    ```
    - Dynamic property access `client[model]`.
    - **Does not accept `"debitNote"`** without adding it to the TypeScript model union.
- **Vendor Bill Number Generator**:
  - `src/app/api/finance/vendor-bills/route.ts` (lines 176–177):
    - Uses `prisma.vendorBill.count()` with pattern `AP-0001` (no calendar year, collision risk).
- **Recommendation**:
  Extend `nextCode` in `sourcing-actions.ts` or `nextSeq` in a shared location to accept `"debitNote"` producing format `DN-YYYY-NNNN` (e.g. `DN-2026-0001`), mirroring `CN-YYYY-NNNN`.

---

### h) Permissions, Nav, and Endpoints

- **Permissions** (`src/lib/rbac.ts` lines 12–38):
  - Purchase / Procurement:
    - `po:read`, `po:write`, `po:approve`
    - `grn:read`, `grn:write`, `grn:qc`
    - `vrn:read`, `vrn:write`, `vrn:approve`
    - `vendor:read`, `vendor:write`
  - Finance:
    - `invoice:read`, `invoice:write` (currently controls vendor bills and sales invoices)
    - `payment:receive` (receivables)
  - Debit note permission: Can reuse `invoice:write` (Finance) or `vrn:write` / `po:write` (Procurement), or introduce `debitnote:read` / `debitnote:write`.
- **Navigation File** (`src/lib/nav.ts`):
  - Finance group (line 97):
    `{ label: "Accounts payable", href: "/finance/payable", permission: "invoice:read" }`
  - Procurement group (lines 110–112):
    `{ label: "Purchase orders", href: "/procurement/orders", permission: "po:read" }`
    `{ label: "Goods receipts", href: "/procurement/grn", permission: "grn:read", badge: "pendingGrn" }`
    `{ label: "Rejection notes", href: "/procurement/rejections", permission: "vrn:read", badge: "heldRejections" }`
  - Debit notes entry should sit in Finance under Accounts payable or in Procurement next to Rejection notes.
- **Vendor Bill Pages**:
  - List / Registration page: `src/app/(app)/finance/payable/page.tsx` (client component rendering form + bills table + pay modal).
  - Detail page: **Does not exist**. There is no `/finance/payable/[id]`.
- **Vendor Bill Payment Endpoint**:
  - `POST /api/finance/payable/[billId]/pay` (`src/app/api/finance/payable/[billId]/pay/route.ts`).

---

### i) Existing Test Scripts & Teardown Hierarchy

- **Existing Test Scripts Involving Vendors, POs, GRNs, Bills**:
  - `prisma/test-ap.ts`: creates `Vendor`, tests `POST /api/finance/vendor-bills`, verifies `LedgerPosting` (DR 5000, CR 2000).
  - `prisma/test-close-po.ts`: creates `Vendor`, `RawMaterial`, `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt`, `GoodsReceiptLine`, `InventoryBatch`, `VendorRejectionNote`.
  - `prisma/test-po-reopen.ts`: tests PO lines and receipts.
  - `prisma/test-convert-po-concurrency.ts`: tests PR-to-PO conversion and approvals.
  - `prisma/test-double-source-guard.ts`: tests ledger posting source guard idempotency.
- **Foreign Key Teardown Hierarchy**:
  When `DebitNote` and `DebitNoteLine` are created, they link to `VendorBill`, `GoodsReceipt` / `VendorRejectionNote`, and `Vendor`. Deleting parents without deleting debit notes will cause FK constraint violations (`P2003`).
  **Exact teardown sequence required**:
  1. `prisma.debitNoteLine.deleteMany(...)`
  2. `prisma.debitNote.deleteMany(...)`
  3. `prisma.ledgerPosting.deleteMany(...)` (sourceType: `DEBIT_NOTE` or `sourceId` in debit note / bill IDs)
  4. `prisma.vendorBill.deleteMany(...)`
  5. `prisma.vendorRejectionNoteLine.deleteMany(...)`
  6. `prisma.vendorRejectionNote.deleteMany(...)`
  7. `prisma.stockMovement.deleteMany(...)`
  8. `prisma.inventoryBatch.deleteMany(...)`
  9. `prisma.goodsReceiptLine.deleteMany(...)`
  10. `prisma.goodsReceipt.deleteMany(...)`
  11. `prisma.purchaseOrderLine.deleteMany(...)`
  12. `prisma.purchaseOrder.deleteMany(...)`
  13. `prisma.rawMaterial.deleteMany(...)`
  14. `prisma.vendor.deleteMany(...)`

---

## Proposed Schema

```prisma
enum DebitNoteStatus {
  ISSUED
  CANCELLED
}

model DebitNote {
  id                   String           @id @default(cuid())
  number               String           @unique // DN-2026-0001
  date                 DateTime         @default(now())
  
  vendorBillId         String
  vendorBill           VendorBill       @relation(fields: [vendorBillId], references: [id], onDelete: Restrict)
  
  goodsReceiptId       String?
  goodsReceipt         GoodsReceipt?    @relation(fields: [goodsReceiptId], references: [id], onDelete: SetNull)
  
  vendorRejectionNoteId String?
  vendorRejectionNote  VendorRejectionNote? @relation(fields: [vendorRejectionNoteId], references: [id], onDelete: SetNull)
  
  vendorId             String
  vendor               Vendor           @relation(fields: [vendorId], references: [id], onDelete: Restrict)
  
  reason               String?
  taxableValue         Decimal          @default(0) @db.Decimal(14, 2)
  taxAmount            Decimal          @default(0) @db.Decimal(14, 2)
  totalValue           Decimal          @default(0) @db.Decimal(14, 2)
  status               DebitNoteStatus  @default(ISSUED)
  
  createdById          String?
  createdBy            User?            @relation("DnCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  
  lines                DebitNoteLine[]
  
  createdAt            DateTime         @default(now())
  updatedAt            DateTime         @updatedAt

  @@unique([goodsReceiptId, vendorBillId])
  @@index([vendorId])
  @@index([vendorBillId])
}

model DebitNoteLine {
  id               String           @id @default(cuid())
  debitNoteId      String
  debitNote        DebitNote        @relation(fields: [debitNoteId], references: [id], onDelete: Cascade)
  
  grnLineId        String?
  grnLine          GoodsReceiptLine? @relation(fields: [grnLineId], references: [id], onDelete: SetNull)
  
  materialId       String
  material         RawMaterial      @relation(fields: [materialId], references: [id], onDelete: Restrict)
  
  description      String
  quantity         Decimal          @db.Decimal(12, 3)
  unit             String           @default("KG")
  rate             Decimal          @db.Decimal(14, 2)
  taxPct           Decimal          @default(18) @db.Decimal(5, 2)
  taxableValue     Decimal          @db.Decimal(14, 2)
  taxAmount        Decimal          @db.Decimal(14, 2)
  totalValue       Decimal          @db.Decimal(14, 2)
  
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@index([debitNoteId])
  @@index([materialId])
}
```

### Necessary Changes to Existing Models:
1. `VendorBill`:
   - Add `debitedAmount Decimal @default(0) @db.Decimal(14, 2)` (mirrors `creditedAmount` on `SalesInvoice`).
   - Add `debitNotes DebitNote[]`.
2. `PostingSourceType` enum:
   - Add `DEBIT_NOTE`.
3. `User`:
   - Add relation `createdDebitNotes DebitNote[] @relation("DnCreatedBy")`.

---

## Trigger Points

1. **Trigger Point A (Automatic at QC Posting)**:
   In `postGoodsReceipt` (`src/app/(app)/procurement/actions.ts`):
   When `lines` contain `rejectedQtyKg > 0`, query if an approved/open `VendorBill` exists for `goodsReceiptId: grn.id` or `purchaseOrderId: grn.purchaseOrderId`. If found, generate `DebitNote` for the rejected line(s).
2. **Trigger Point B (Automatic at Vendor Rejection Note Approval)**:
   In `decideRejectionNote` (`src/app/(app)/procurement/sourcing-actions.ts`):
   When a VRN is approved (`approve === true`), find the linked `VendorBill` and issue the `DebitNote`. (Matches the two-eyes approval principle in VRN).
3. **Trigger Point C (Manual / Post-Bill Match in Finance)**:
   In `src/app/(app)/finance/payable/page.tsx` or new Debit Notes page:
   When a `VendorBill` is created or viewed against a GRN that had rejections, provide an action to "Issue Debit Note" for the uncredited rejections.

---

## Open Questions for Manager

1. **Trigger Lifecycle**: Should Debit Notes be generated immediately at GRN QC inspection (`postGoodsReceipt`), when a `VendorRejectionNote` is approved (`decideRejectionNote`), or manually by Finance from Accounts Payable?
2. **Timing when Bill is not yet created**: In manufacturing, GRN QC rejections often occur *before* Finance registers the Vendor Bill. When a rejection occurs with no bill yet present, should:
   - A draft/pending Debit Note be queued and auto-applied when the bill is created?
   - Or should debit notes only be created when a bill already exists?
3. **Line-Level Tax Source**: Vendor bills have aggregate tax only (no line items). Should Debit Note lines derive their tax percentage from `PurchaseOrderLine.taxPct` (defaults to 18%) corresponding to each rejected material?
4. **Accounting Posting for Debit Note**:
   - Debit: `2000 Accounts Payable` (reducing liability to vendor).
   - Credit: `5000 Purchases` (reducing purchase expense).
   - What account should be credited for the tax portion? Currently, `seedFin.ts` has `2100 Output GST Payable` (liability) but no `1500 Input GST` account. Should tax credit `5000 Purchases` (matching how the bill was booked) or credit an input/output GST account?
5. **Handling Paid Bills**: If the vendor bill is already `PAID` (or `paidAmount + debitTotal > totalValue`), which of the 5 options in section (f) should be implemented (e.g. create unapplied vendor credit, prevent creation, or require refund entry)?

---

## Migration Record

- **Migration Name**: `add_debit_note`
- **Migration Folder**: `prisma/migrations/20261026154557_add_debit_note`
- **Migration SQL File**: [migration.sql](file:///c:/Users/Gaurav/erp-crash/prisma/migrations/20261026154557_add_debit_note/migration.sql)
- **Entities Added**:
  - `DebitNoteStatus` enum (`ISSUED`, `CANCELLED`)
  - `DebitNote` model with `number` (unique), `vendorBillId`, `goodsReceiptId`, `vendorId`, `status`, `taxableValue`, `taxAmount`, `totalValue`, `createdById`
  - `DebitNoteLine` model with `debitNoteId`, `grnLineId`, `materialId`, `quantity`, `rate`, `taxPct`, `taxableValue`, `taxAmount`, `totalValue`
  - Added `debitedAmount` (`Decimal(14, 2) DEFAULT 0`) to `VendorBill`
  - Added `DEBIT_NOTE` to `PostingSourceType` enum
  - Unique constraint `DebitNote_goodsReceiptId_vendorBillId_key` on `[goodsReceiptId, vendorBillId]`
  - Indexes on `DebitNote(vendorId)` and `DebitNote(vendorBillId)`
- **Verification Results**:
  - `npx prisma migrate dev --name add_debit_note`: Applied cleanly.
  - `npx prisma generate`: Generated Prisma Client v6.19.3.
  - `npx tsc --noEmit`: Clean pass (0 errors).
  - `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "postgresql://postgres:2005@localhost:5432/erp_shadow" --exit-code`: Returned 0 ("No difference detected.").

---

## Real Bugs Found in Part 2 & Fixes

1. **Bug: Idempotency Guard Returned `success` Instead of Rejecting Duplicate Debits**
   - **Location**: `src/app/(app)/procurement/sourcing-actions.ts` in `raiseDebitNoteCore`.
   - **Symptom**: When `raiseDebitNoteCore` was called again with the same GRN lines or for an already debited bill-GRN pair, it returned `{ success: "Debit note ... already issued..." }`.
   - **Fix**: Re-raising the same lines is now strictly rejected with an explicit error: `{ error: "Debit note ${existingDn.number} already issued for this bill and goods receipt." }`.

2. **Bug: Debit Note Postings Did Not Separate Input Tax Reversal**
   - **Location**: `src/app/(app)/procurement/sourcing-actions.ts` in `raiseDebitNoteCore`.
   - **Symptom**: Part 2 credited the entire `headerTotalValue` to `5000 Purchases`. On mixed-rate bills (e.g. 18% and 5% lines), debiting the 18% line calculated line/header tax correctly (e.g. ₹720.00), but posted zero input tax reversal to the ledger.
   - **Fix**: When `headerTaxAmount > 0`, `raiseDebitNoteCore` resolves the tax account (`2100 Output GST Payable` / `1500 Input GST`) and creates:
     - Credit: `5000 Purchases` for `headerTaxableValue` (e.g. ₹4,000.00)
     - Credit: Tax Account for `headerTaxAmount` (e.g. ₹720.00, matching posted input tax)
     - Debit: `2000 Accounts Payable` for `headerTotalValue` (e.g. ₹4,720.00)
     - Postings are double-entry balanced and carry `sourceType: DEBIT_NOTE`.

---

## Part 3: Test Suite & Verification Results

### Test Script: `prisma/test-debit-note.ts`
All 7 test cases implemented and verified:
1. **One rejected line gives one note, lines sum to header**:
   - 20 kg rejected on 18% line (@ 200/kg) creates exactly 1 note (taxable ₹4,000, tax ₹720, total ₹4,720).
   - Lines sum exactly to header values. Line taxable + tax = line totalValue. Status `ISSUED`.
2. **Mixed-rate bill (18% and 5% lines) debiting 18% line**:
   - Debit 18% line gives exact tax ₹720.00 (not flawed effective tax ratio).
   - Header tax matches the posted input tax on Account `2100` (Credit ₹720.00).
   - Postings balanced: DR 2000 AP (₹4,720) = CR 5000 Purchases (₹4,000) + CR 2100 Tax (₹720).
3. **Re-raising the same lines is rejected, no second note**:
   - Duplicate invocation returns `{ error: ... }`.
   - Total debit note count remains strictly 1.
4. **Debit above open balance is rejected or handled per notes**:
   - 4A (Zero open balance): Fully paid bill returns error stating no remaining balance; logs `UNAPPLIED_DEBIT` AuditEvent; no note created.
   - 4B (Partial open balance): Debit exceeding remaining balance is capped at open balance (₹1,000.00); excess (₹1,360.00) logged to `UNAPPLIED_DEBIT` AuditEvent; bill transitions to `PAID`.
5. **Debit then payment: payment above total - paid - debited is rejected**:
   - Bill total ₹11,800, debited ₹2,360 → open balance ₹9,440.
   - Payment request of ₹9,441 rejected with HTTP 400.
   - Payment request of exact balance ₹9,440 succeeds with HTTP 200; bill transitions to `PAID`.
6. **Postings carry DEBIT_NOTE and balance**:
   - All postings carry `sourceType: DEBIT_NOTE`.
   - Posting remarks reference debit note number `DN-YYYY-NNNN`.
   - Total Debits === Total Credits.
7. **Number uniqueness**:
   - All generated notes match pattern `DN-YYYY-NNNN`.
   - Numbers are strictly unique with zero collisions.

### Teardown
- Clean teardown implemented in `test-debit-note.ts` executing in strict foreign-key dependency order:
  `debitNoteLine` → `debitNote` → `ledgerPosting` (DEBIT_NOTE) → `vendorBill` → `goodsReceiptLine` → `goodsReceipt` → `purchaseOrderLine` → `purchaseOrder` → `rawMaterial` → `vendor`.

### Verification Suite Execution Results
- `npx tsx prisma/test-debit-note.ts` → **PASS** (all 7 tests passed)
- `npx tsx prisma/test-ap.ts` → **PASS** (AP postings balanced, unauth rejected)
- `npx tsx prisma/test-close-po.ts` → **PASS** (all concurrency & isolation tests passed)
- `npx tsx prisma/test-po-reopen.ts` → **PASS** (all 4 DB verification tests passed)
- `npx tsx prisma/test-convert-po-concurrency.ts` → **PASS** (concurrency conversion passed)
- `npx tsx prisma/test-double-source-guard.ts` → **PASS** (double sourcing guard passed)
- `npx tsx prisma/test-ar.ts` → **PASS** (AR system verification passed)
- `npx tsx prisma/test-credit-note.ts` → **PASS** (all credit note tests passed)
- `npx tsx prisma/test-invoice-overdue.ts` → **PASS** (overdue logic tests passed)
- `npx tsx prisma/test-raise-invoice-flow.ts` → **PASS** (invoice raising flow passed)
- `npx tsc --noEmit` → **PASS** (0 errors)

---

## Part 4: UI Implementation & Pages

### 1. Permission Pattern
- Uses the standard purchase page permission pattern `po:read` across `/purchase/debit-notes`, `/purchase/debit-notes/[id]`, and navigation links.

### 2. `/purchase/debit-notes` List Grid
- Copied from sales `credit-notes-grid.tsx` with columns:
  - `number`: Debit Note number link to `/purchase/debit-notes/[id]`
  - `date`: Issue date formatted cleanly
  - `vendor`: Vendor name and code
  - `vendor bill`: Linked bill reference code (`bill.code`)
  - `GRN`: Goods receipt reference (`grn.code`)
  - `total`: Formatted currency total (`totalValue`)
  - `status`: Chip tone (`ISSUED` = success, `CANCELLED` = neutral)
- Includes search by number/vendor/bill/GRN, status filtering, column sorting, and aggregate count + debited total footer.
- Added `/procurement/debit-notes` redirect page pointing to `/purchase/debit-notes`.

### 3. `/purchase/debit-notes/[id]` Printable Document
- Modeled directly on `sales/credit-notes/[id]/page.tsx`:
  - Title: "Debit Note"
  - Vendor name and GSTIN, vendor address
  - Original bill number and date
  - GRN reference number
  - Reason for debit note
  - Line items breakdown (Item / Material description, code, quantity in kg, unit rate, tax %, taxable value, tax amount, line total)
  - Tax summary (taxable value, GST amount, grand total)
  - Signature block for Authorized Signatory
  - Reuses all print classes (`print:hidden`, `print:border-none`, `print:p-0`, `print:shadow-none`, `@media print`) with Ctrl+P Print button.

### 4. Vendor Bill Page Integration (`/finance/payable`)
- Added "Debited" column to the vendor bills table.
- Added "Raise debit note" action button per active vendor bill.
- Added interactive modal dialog:
  - Fetches debitable lines via `getDebitableLinesForBill`.
  - Shows inline warning if there is nothing to debit (`!lines || lines.length === 0`).
  - Lists rejected lines with item description, rejected quantity, previously debited quantity, available quantity, rate, tax %, and editable quantity input.
  - Reason field input.
  - Validates and submits via `raiseDebitNote` server action.
  - Success message displays direct link to the newly generated printable Debit Note document (`/purchase/debit-notes/[id]`).
- Updated payment application modal to cap at `totalValue - paidAmount - debitedAmount`.

---

## Part 5: Debit Note Links, Vendor Bill Page & Navigation

### 1. Vendor Bill Detail Page (`/finance/payable/[id]`)
- Created dedicated Vendor Bill detail page mirroring `src/app/(app)/sales/invoices/[id]/page.tsx`:
  - `RecordHeader`: Displays bill code, vendor title, status chip, action buttons linking to Debit Notes and Payable list, and metadata (bill date, due on, invoice ref, basis, linked PO and GRN links, total value).
  - Upstream lines breakdown: Displays goods receipt lines (with received, accepted, and rejected quantities and line values) or purchase order lines if linked against PO.
  - Stored bill totals: Subtotal, Tax Amount (GST), Total Bill Value.
  - Ledger postings: Displays bill's general ledger postings (DR Purchases, CR Accounts Payable) with double-entry balance verification.
  - Debit postings: Nested under the bill's postings, displays all `sourceType: DEBIT_NOTE` ledger entries (DR Accounts Payable, CR Purchases, CR Input GST reversal) referencing the Debit Note document.
  - Debit notes section: Table of all Debit Notes issued against the bill, linking directly to `/purchase/debit-notes/[id]` and linked GRN `/procurement/grn/[id]`, with issue date, reason, status chip, and debited amount.
  - Payment summary: 5-column breakdown displaying Bill Total, Paid Amount, Debited (`-₹...`), Balance Due (`Math.max(0, totalValue - paidAmount - debitedAmount)`), and Status, followed by payment transaction postings if present.

### 2. GRN Detail Page Integration (`/procurement/grn/[id]`)
- Added direct link to the Debit Note for each rejected line in `QcPanel`:
  - Under the rejected quantity in the QC inspection table, if a line has been debited, renders a direct link to the Debit Note document (`DN-YYYY-NNNN →`).
- RecordHeader action bar: Added direct link to the Debit Note document when issued against this GRN.
- GRN detail aside: Added "Debit notes" Section listing all issued Debit Notes for this receipt with amounts and links to both the Debit Note and linked Vendor Bill.

### 3. Navigation
- Added "Debit notes" navigation entry in `src/lib/nav.ts` under the **Finance** group directly next to "Accounts payable", accessible to finance users with `invoice:read` permission.
- Retained the Procurement group navigation entry under "Rejection notes" for purchase staff (`po:read`).

### 4. Vendor Outstanding & Payable Grid debitedAmount Subtraction
- Updated `/finance/payable` grid:
  - Bill No column now links to `/finance/payable/[id]`.
  - Added "Balance Due" column displaying net open balance (`totalValue - paidAmount - debitedAmount`).
  - Maintained "Debited" column highlighting `-₹...`.
- Updated `/api/finance/vendor-bills`:
  - Enriched API response with `remainingAmount` and `balanceDue` computed net of `debitedAmount`.
- Updated Vendor pages (`/procurement/vendors` and `/procurement/vendors/[id]`):
  - Vendor detail page calculates `outstanding` across active vendor bills subtracting `debitedAmount` and displays it in `RecordHeader` meta.
  - Vendors grid calculates and displays net `outstanding` column.
- Updated `metrics.ts`:
  - Cash cycle calculation in `trends()` now accounts for `DEBIT_NOTE` on Accounts Payable (Account `2000`) and `CREDIT_NOTE` on Accounts Receivable (Account `1100`).


