# Sales Module User Flow

## 1. Overview
The Sales module manages the quote-to-cash lifecycle for custom polymer compounds, spanning inquiry capture, cost estimation, commercial quotation, credit-gated order processing, inventory allocation, dispatch challaning, and automated ledger invoicing. It enforces governance rules including four-eyes approvals, margin protection, customer credit exposure gates, and batch traceability. It also handles customer returns with QC inspection and automated stock restoration or replacement order re-triggering.

## 2. Main Flow

```mermaid
flowchart TD
    %% Main Quote-to-Cash Flow
    Inq["1. Sales Inquiry<br/>/sales/inquiries/new"] --> CS["2. Cost Sheet Formulation<br/>/sales/cost-sheets/new"]
    CS --> CSApprove{"Cost Sheet Decision<br/>/sales/cost-sheets/[id]"}
    CSApprove -- "Approve (4-Eyes)" --> Quote["3. Sales Quotation<br/>/sales/quotations/new"]
    CSApprove -- "Send Back" --> CS
    
    Quote --> Proforma["4. Proforma Print View<br/>/sales/quotations/[id]/proforma"]
    Quote --> QuoteAccept["5. Customer Acceptance<br/>/sales/quotations/[id]"]
    
    %% Direct Branch
    DirectSO["Direct Sales Order<br/>/sales/orders/new"] --> SOReview
    
    QuoteAccept --> SOReview["6. Order Approval & Credit Gate<br/>/sales/orders/[id]"]
    
    SOReview -- "Confirm (4-Eyes + Credit Check)" --> SOConfirmed["7. Confirmed Order<br/>/sales/orders/[id]"]
    
    %% Allocation & Dispatch
    SOConfirmed --> Allocate["8. Stock Batch Allocation<br/>/sales/orders/[id]"]
    Allocate --> Dispatch["9. Dispatch & Challan<br/>/sales/orders/[id]"]
    Dispatch --> Invoice["10. Raise Invoice & Post Ledger<br/>/sales/dispatch/[id]"]
    
    %% Order Cancellation Branch
    SOReview -- "Cancel (No Challans)" --> CancelSO["Cancel Order & Release Stock<br/>/sales/orders/[id]"]
    SOConfirmed -- "Cancel (Before Dispatch)" --> CancelSO
    
    %% Return & QC Branch
    Dispatch -.-> ReturnLog["11. Log Sales Return<br/>/sales/returns/new"]
    ReturnLog --> ReturnQC["12. QC Inspection Bench<br/>/sales/returns/[id]"]
    ReturnQC -- "Restock / Scrap / Resend" --> SettleReturn{"Resolution Decision"}
    SettleReturn -- "Reopen Order" --> SOConfirmed
    SettleReturn -- "Replacement Order" --> SOReview

    classDef built stroke:#0f766e,stroke-width:2px;
    classDef partial stroke:#d97706,stroke-width:2px,stroke-dasharray: 5 5;
    classDef notbuilt fill:#f3f4f6,stroke:#9ca3af,stroke-width:1px,color:#6b7280;

    class Inq,CS,CSApprove,Quote,Proforma,QuoteAccept,DirectSO,SOReview,SOConfirmed,Allocate,Dispatch,Invoice,CancelSO,ReturnLog,ReturnQC,SettleReturn built;
```

## 3. Step Table

| Step | URL | Who (Permission) | Rule or Guard Enforced | Result / Status Change |
| :--- | :--- | :--- | :--- | :--- |
| **1. Create Inquiry** | `/sales/inquiries/new` | Sales (`sales:write`) | Requires customer selection and at least one item line with quantity > 0. | `SalesInquiry: OPEN` |
| **2. Prepare Cost Sheet** | `/sales/cost-sheets/new` | Sales (`costsheet:write`) | Pulls active formulation PHR & raw material rates; calculates conversion, overhead, and margin. | `CostSheet: PENDING_APPROVAL` |
| **3. Decide Cost Sheet** | `/sales/cost-sheets/[id]` | Finance (`costsheet:approve`) | **4-Eyes Guard**: Preparer cannot approve own sheet (`preparedById != userId`). | `CostSheet: APPROVED` or `DRAFT` (sent back) |
| **4. Create Quotation** | `/sales/quotations/new` | Sales (`squote:write`) | **Rate Floor Guard**: Quoted rate must be $\ge$ approved cost sheet selling rate or project target price. | `SalesQuotation: DRAFT` / `SENT` |
| **5. Proforma View** | `/sales/quotations/[id]/proforma` | Sales (`squote:read`) | Available for any active quotation not in `REJECTED` or `EXPIRED` status. | Clean printable commercial document |
| **6. Accept Quotation** | `/sales/quotations/[id]` | Sales (`so:write`) | **Expiry Guard**: Rejects if current IST time > `validUntil` end-of-day. Cost sheet must be approved. | `SalesQuotation: ACCEPTED`, creates `SalesOrder: PENDING_APPROVAL`, sets linked inquiry to `WON` |
| **Direct Order** | `/sales/orders/new` | Sales (`so:write`) | Creates SO directly for existing customer with compound line items. | `SalesOrder: PENDING_APPROVAL` |
| **7. Confirm Order** | `/sales/orders/[id]` | Management/Admin (`so:approve`) | **4-Eyes Guard**: Creator cannot confirm own order (`raisedById != userId`).<br/>**Credit Gate**: Rejects if total exposure > credit limit unless override justification is provided. | `SalesOrder: CONFIRMED` |
| **8. Allocate Stock** | `/sales/orders/[id]` | Store/Sales (`allocate:write`) | Order must be `CONFIRMED`. Allocated quantity cannot exceed batch `availableQtyKg` or open line quantity. | Creates active `StockAllocation`, updates batch `allocatedKg` |
| **9. Release Allocation** | `/sales/orders/[id]` | Store/Sales (`allocate:write`) | Allowed only before line is dispatched. | Deactivates `StockAllocation`, restores batch availability |
| **10. Despatch Order** | `/sales/orders/[id]` | Store/Logistics (`dispatch:write`) | Requires reserved stock. Records vehicle & driver. Creates outward stock movements. | `DeliveryChallan: DISPATCHED`, `SalesOrder: PARTIALLY_DISPATCHED` / `DISPATCHED` |
| **11. Raise Invoice** | `/sales/dispatch/[id]` | Finance (`invoice:write`) | **FIFO Return Netting**: Deducts returned qty from un-invoiced challan lines.<br/>**Per-Line Tax**: Sums tax per line using `SalesOrderLine.taxPct`. | `SalesInvoice: ISSUED`, generates AR & GST ledger postings |
| **12. Cancel Order** | `/sales/orders/[id]` | Sales/Admin (`so:write`) | Allowed only in `PENDING_APPROVAL` or `CONFIRMED` and before any delivery challan exists. | `SalesOrder: CANCELLED`, releases all active allocations |
| **13. Log Return** | `/sales/returns/new` | Store/Sales (`sreturn:write`) | Requires dispatched sales order reference. | `SalesReturn: PENDING_QC` |
| **14. Inspect Return & Settle** | `/sales/returns/[id]` | QC/Store (`sreturn:qc`) | Conservation rule: `restockedKg + scrappedKg == returnedKg`. Restocked qty generates fresh batch. | `SalesReturn: SETTLED`, reopens order or creates replacement order |

## 4. Status Lifecycles

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PENDING_APPROVAL: Submit
    PENDING_APPROVAL --> CONFIRMED: Confirm (Credit & 4-Eyes Check)
    PENDING_APPROVAL --> CANCELLED: Cancel Order
    CONFIRMED --> CANCELLED: Cancel (Before Dispatch)
    CONFIRMED --> PARTIALLY_DISPATCHED: Partial Dispatch
    CONFIRMED --> DISPATCHED: Full Dispatch
    PARTIALLY_DISPATCHED --> DISPATCHED: Final Dispatch
    DISPATCHED --> CLOSED: Fully Invoiced & Settled
    CANCELLED --> [*]
    CLOSED --> [*]
```

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> SENT: Send to Customer
    SENT --> ACCEPTED: Customer Accept (Expiry Check)
    SENT --> REJECTED: Customer Rejects
    SENT --> EXPIRED: Date Exceeded
    ACCEPTED --> [*]
    REJECTED --> [*]
    EXPIRED --> [*]
```

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PENDING_QC: Inward Material Logged
    PENDING_QC --> SETTLED: Inspect & Settle (Restock / Scrap / Resend)
    SETTLED --> [*]
```

## 5. Business Rules List
* **Cost Sheet Four-Eyes Check**: `decideCostSheetCore` blocks the cost sheet creator from approving their own margin.
* **Order Confirmation Four-Eyes Check**: `confirmSalesOrder` prevents the order creator from confirming the order and committing credit/stock.
* **Credit Limit Gate**: `confirmSalesOrder` evaluates customer exposure (`outstandingAmt + totalValue`) against `creditLimit` and requires a mandatory override reason if exceeded.
* **Pricing Rate Floor**: `createSalesQuotationCore` prevents quoting below the approved cost sheet selling rate or project target rate.
* **Quotation Expiry Check**: `acceptQuotationCore` enforces that quotations cannot be accepted past 23:59:59.999 IST of their `validUntil` date.
* **FIFO Return Netting**: `raiseInvoiceCore` deducts prior customer return quantities from delivered quantities using FIFO matching before computing billable line totals.
* **Dynamic Per-Line Tax**: `raiseInvoiceCore` computes invoice GST on each line individually using `SalesOrderLine.taxPct` against net billable amounts.
* **Order Cancellation & Stock Restoration**: `cancelSalesOrderCore` restricts cancellation to un-dispatched orders, releases active stock allocations, increments batch availability, and appends audit remarks.

## 6. Known Gaps
* Inquiries transition from `OPEN` to `WON` upon quotation acceptance (`acceptQuotationCore`), but do not have an intermediate `QUOTED` status.
* The Quotation detail page lacks a UI action button to explicitly mark a quotation as `REJECTED`.
* Invoices do not have a dedicated individual detail view page (`/sales/invoices/[id]`), relying on list views and document chain breadcrumbs.
* Commercial pricing does not support multi-currency or exchange rate conversions (hardcoded to INR).
