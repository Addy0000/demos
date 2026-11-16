# Task F3 Reconnaissance Notes: First-Class Credit Note Document

These reconnaissance notes document the codebase state for introducing first-class Credit Note documents for sales-return credit.

---

### a) Ledger / Outstanding Source Type Definition & Return Credit Postings

- **Source Type Enum Definition**:
  - `prisma/schema.prisma` (lines 1910–1916):
    ```prisma
    enum PostingSourceType {
      VENDOR_BILL
      SALES_INVOICE
      PAYMENT
      JOURNAL_ENTRY
      STOCK_MOVEMENT
    }
    ```
  - Defined in SQL migration: `prisma/migrations/20260820144906_add_fin_coa_vendor_bill/migration.sql` (line 104).

- **Places where Return Credit is posted with `SALES_INVOICE` label**:
  - `src/app/(app)/sales/sales-core.ts` inside `inspectSalesReturnCore`:
    - **Line 1770**:
      ```ts
      await tx.ledgerPosting.create({
        data: {
          accountId: revenueAccount.id,
          side: PostingSide.DEBIT,
          amount: creditAmount,
          sourceType: PostingSourceType.SALES_INVOICE,
          sourceId: returnId,
          remark: `Credit note (Sales Revenue reversal) for return ${srn.code}`,
        },
      });
      ```
    - **Line 1783**:
      ```ts
      await tx.ledgerPosting.create({
        data: {
          accountId: outputTaxAccount.id,
          side: PostingSide.DEBIT,
          amount: creditTax,
          sourceType: PostingSourceType.SALES_INVOICE,
          sourceId: returnId,
          remark: `Credit note (Output GST reversal) for return ${srn.code}`,
        },
      });
      ```
    - **Line 1795**:
      ```ts
      await tx.ledgerPosting.create({
        data: {
          accountId: arAccount.id,
          side: PostingSide.CREDIT,
          amount: creditTotal,
          sourceType: PostingSourceType.SALES_INVOICE,
          sourceId: returnId,
          remark: `Credit note (Accounts Receivable reduction) for return ${srn.code}`,
        },
      });
      ```
  - `src/app/(app)/sales/invoices/[id]/page.tsx`:
    - **Line 111**: `sourceType: "SALES_INVOICE"` queries invoice postings.
    - **Lines 131–137**: Return reversal postings for order returns are queried by `sourceId: { in: returnIds }` (picking up the postings created with `sourceId: returnId` and `sourceType: SALES_INVOICE`).

---

### b) Document Number Generation & Fiscal-Year Behaviour

- **Implementation**:
  - `src/app/(app)/sales/sales-core.ts` (lines 26–56) and `src/app/(app)/sales/sales-actions.ts` (lines 25–56) implement `nextSeq(prefix, model)`.
  - Format: `${prefix}-${year}-${String(nextNum).padStart(4, "0")}`.
  - Prefix examples:
    - Invoices: `INV` -> `INV-2026-0001` (`sales-core.ts` line 1266)
    - Delivery Challans: `DC` -> `DC-2026-0001` (`sales-core.ts` line 1058)
    - Sales Returns: `SRN` -> `SRN-2026-0001` (`sales-core.ts` line 1943)
    - Sales Orders: `SO` -> `SO-2026-0001` (`sales-core.ts` line 541, 1650)
    - Packing Lists: `PKL` -> `PKL-2026-0001` (`sales-core.ts` line 2152)
    - Quotations: `QTN` -> `QTN-2026-0001` (`sales-core.ts` line 429)
    - Cost Sheets: `CS` -> `CS-2026-0001` (`sales-core.ts` line 227)
    - Inquiries: `INQ` -> `INQ-2026-0001` (`sales-core.ts` line 106)
- **Fiscal-Year Behaviour**:
  - `year` is computed strictly using calendar year: `const year = new Date().getFullYear();`.
  - There is NO fiscal-year logic (no April–March financial year split, no `FY25-26` or `2425` prefixes). Numbering increments per calendar year `YYYY`.

---

### c) Printable Document Page to Copy & Print CSS Location

- **Existing Printable Pages to Copy**:
  1. `src/app/(app)/sales/quotations/[id]/proforma/page.tsx` (Proforma Invoice document page):
     - Uses standalone full-page printable container (`max-w-4xl bg-surface print:border-none print:p-0 print:shadow-none`).
     - Includes official header banner, company identity ("Mavens Biotech ERP"), customer/billing grid, itemized table, tax breakdown, and signoff block.
     - Accompanied by client `PrintButton` in `src/app/(app)/sales/quotations/[id]/proforma/print-button.tsx`.
  2. `src/app/(app)/sales/packing-lists/[id]/page.tsx` (lines 201–330):
     - Uses `PrintButton` from `src/app/(app)/sales/packing-lists/[id]/print-button.tsx` with clean tabular layout.
- **Print CSS Location**:
  - There is NO separate print CSS stylesheet or `@media print` block in `src/app/globals.css`.
  - Print styling is handled entirely via Tailwind utility classes:
    - `print:hidden` on action bars, navigation breadcrumbs, and print triggers.
    - `print:border-none print:p-0 print:shadow-none print:bg-white text-ink` on document containers.
  - Trigger: `onClick={() => window.print()}` inside `PrintButton` component.

---

### d) Tax and Amount Storage across SalesInvoice, SalesReturn, and SalesReturnLine

- **SalesInvoice** (`prisma/schema.prisma` lines 1758–1792):
  - Taxable value: `subtotal Decimal(14, 2) @default(0)` (taxable value, net of returns raised prior to billing).
  - Tax amount: `taxAmount Decimal(14, 2) @default(0)` (aggregate GST; **no** separate columns for CGST, SGST, or IGST).
  - Total: `totalValue Decimal(14, 2) @default(0)`.
  - Payment & Credits: `paidAmount Decimal(14, 2) @default(0)`, `creditedAmount Decimal(14, 2) @default(0)`.
  - Customer GSTIN: **Not** stored on `SalesInvoice`; accessed via relation `invoice.customer.gstin` (`Customer` model line 147).

- **SalesReturn** (`prisma/schema.prisma` lines 1817–1855):
  - Stores **no** monetary amounts or tax columns on header level (only status, resolution, reason, customerDcNo, dates, inspection notes).

- **SalesReturnLine** (`prisma/schema.prisma` lines 1857–1880):
  - Stores **no** monetary amounts or tax columns on line level.
  - Stores only quantities: `quantityKg`, `restockedKg`, `scrappedKg`, `resendKg` (`Decimal(12, 3)`), plus relations to `salesOrderLineId` and `projectId`.
  - Amounts are dynamically computed at inspection time in `inspectSalesReturnCore` (`src/app/(app)/sales/sales-core.ts` lines 1740–1753) by referencing `salesOrderLine.ratePerKg` and `salesOrderLine.taxPct` (defaulting to 18 if null):
    - `lineAmount = round2(returnedKg * ratePerKg)`
    - `lineTax = round2((lineAmount * taxPct) / 100)`
    - `creditAmount = sum(lineAmount)`
    - `creditTax = sum(lineTax)`
    - `creditTotal = creditAmount + creditTax`

---

### e) Return Cancellation / Reversal Flow

- **Status**: No cancel or reversal flow exists for sales returns.
- `SalesReturnStatus.CANCELLED` exists in `prisma/schema.prisma` (line 1808) and in filter arrays (`returns-grid.tsx` line 20), but no code path ever sets status to `CANCELLED`.
- In `src/app/(app)/sales/sales-core.ts`: returns are created in `PENDING_QC` (line 1949), and upon inspection transition irrevocably to `PARTIALLY_RESTOCKED`, `RESTOCKED`, or `SCRAPPED` (lines 1580–1583).
- No server action, core function, or API route exists to cancel or reverse a sales return, restocked batch, or return ledger posting.

---

### f) Permission-Check Patterns & Navigation File

- **Permission-Check Pattern on Sales Pages**:
  - Server Component Pages: Call `await requirePermission("<resource>:<action>")` from `src/lib/session.ts`.
    - Examples:
      - `src/app/(app)/sales/invoices/page.tsx` (line 11): `await requirePermission("invoice:read");`
      - `src/app/(app)/sales/invoices/[id]/page.tsx` (line 22): `await requirePermission("invoice:read");`
      - `src/app/(app)/sales/returns/page.tsx` (line 10): `await requirePermission("sreturn:read");`
      - `src/app/(app)/sales/returns/[id]/page.tsx` (line 23): `const user = await requirePermission("sreturn:read");`
      - Redirects unauthenticated users to `/login`, and unauthorized users to `/denied?need=<permission>`.
  - Server Actions: Call `await assertPermission("<resource>:<action>")` from `src/lib/session.ts`.
    - Examples: `assertPermission("invoice:write")` (`sales-actions.ts` line 295), `assertPermission("sreturn:qc")` (line 306).
    - Throws an Error with a user-facing rejection message.
- **Navigation File with Invoices Entry**:
  - `src/lib/nav.ts` (line 56):
    ```ts
    { label: "Invoices", href: "/sales/invoices", permission: "invoice:read", badge: "overdueInvoices" },
    ```
  - Sits under the `"Sales"` group (`src/lib/nav.ts` lines 47–59).

---

### g) Existing Posting Rows Carrying SALES_INVOICE for Returns

- **Database Query Result**:
  - Exactly **21** existing `LedgerPosting` rows in the database carry `sourceType: "SALES_INVOICE"` where `sourceId` matches a `SalesReturn.id`.
  - There are 17 total `SalesReturn` records in the database.
  - 7 inspected returns generated 3 postings each:
    1. DEBIT Account `4000` (Sales Revenue reversal)
    2. DEBIT Account `2100` (Output GST reversal)
    3. CREDIT Account `1100` (Accounts Receivable reduction)
    Total = 7 x 3 = 21 posting rows.
  - There are exactly 0 orphaned postings (all 21 non-invoice `SALES_INVOICE` postings match `SalesReturn` IDs).

---

## F1 gap fixes

1. **Re-running inspectSalesReturnCore for the same return**:
   - Verified that `inspectSalesReturnCore` already guards against duplicate settlement via pre-check (`if (srn.status === RESTOCKED || SCRAPPED || PARTIALLY_RESTOCKED) return { error }`) and atomic resolution guard (`where: { id: returnId, resolution: null }`).
   - Re-running returns an error and does not credit the invoice twice, does not decrement customer outstanding again, and creates no duplicate ledger postings.
   - Verified with unit test in `prisma/test-ar.ts` (Step 14). No code fix needed.

2. **Cancelling or reversing a return**:
   - No reversal flow exists in the codebase (skipped per task instructions).

3. **Fully credited invoice marked PAID excluded from customer outstanding**:
   - Verified that applying full return credit decrements `customer.outstandingAmt` by the credit amount and sets invoice status to `PAID`.
   - Remaining balance is ₹0, `GET /api/finance/receivable` reports `remainingAmount: 0`, and customer credit exposure in `confirmSalesOrderCore` does not count the invoice towards outstanding or unbilled orders.
   - Verified with unit test in `prisma/test-ar.ts` (Step 15). No code fix needed.

---

## F3 Credit Note Migration

- **Migration Folder**: `20261021164826_add_credit_note`
- **Path**: `prisma/migrations/20261021164826_add_credit_note`
- **Models Added**: `CreditNote`, `CreditNoteLine`
- **Enums Updated/Added**: `CreditNoteStatus` (enum `ISSUED`, `CANCELLED`), `PostingSourceType` (`CREDIT_NOTE` added)
- **Diff Verification**: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "postgresql://postgres:2005@localhost:5432/erp_shadow" --exit-code` returned code 0 ("No difference detected").

---

## Part 3 Logic Bug Fixes & Verification

1. **Idempotency Guard in Invoice Credit Loop (`inspectSalesReturnCore`)**:
   - **Bug**: In `inspectSalesReturnCore` inside `sales-core.ts`, when checking if an existing `CreditNote` already exists for `(salesReturnId, salesInvoiceId)`, the logic skipped re-creating the `CreditNote`, but previously proceeded through the rest of the loop block and re-incremented `creditedAmount` on `SalesInvoice`.
   - **Fix**: When `existingCn` is detected, it is recorded into `createdCreditNotes`, `remainingCredit` is decremented by `existingCn.totalValue`, and the loop executes `continue;`, ensuring `creditedAmount` on the invoice is never incremented twice.
   - **Line Snapshot Quantity Balancer**: Line snapshots now scale quantity proportionally and allocate rounding remainder on the final line (`totalReturnedKg * scale - sumScaledQty`) ensuring exact line-to-total balance.

2. **Test Suite `prisma/test-credit-note.ts`**:
   - Comprehensive test suite covering:
     - Single-invoice return giving 1 note and lines summing exactly to header.
     - Return spanning two invoices giving 2 notes with oldest-first application and unique numbering.
     - Re-running returning error with 0 new notes and creditedAmount unchanged.
     - Excess beyond invoice balance generating no note for excess and recording unapplied excess in `AuditEvent`.
     - Non-trivial tax splits (effective tax ratio with 2 decimals, rounding remainder to taxable value).
     - Ledger postings carrying `sourceType: PostingSourceType.CREDIT_NOTE` and referencing credit note numbers.
     - Credit note number uniqueness across all issued notes following `CN-YYYY-NNNN`.


