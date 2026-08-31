# Petrol Pump Operations System — Product, UX, and Engineering Implementation Plan

**Document status:** Owner-only v1 implemented locally; production-pilot and follow-up scope remains a roadmap
**Product type:** Petrol Pump Operations & Management System (CRM capabilities can follow later)
**Primary market assumption:** One owner operating one Indian retail outlet in v1
**Primary database constraint:** MongoDB Atlas
**Design constraint from the source conversation:** The interface must be calm, subtle, owner-focused, mobile-friendly, and must avoid harsh or excessive red

---

## Current v1 build slice

The first implementation deliberately uses the simplified model chosen after the original planning conversation: one owner, one outlet, one active shift, one petrol nozzle/tank, and one diesel nozzle/tank. It includes staff records, daily attendance, one operator-to-machine allocation per shift, totalizer-based operator performance and handover variance, shift opening and immutable closing, test-fuel handling, fuel receipts, expenses, density/water checks, deterministic reconciliation, live owner views, and a daily CSV export.

To keep this first release honest and small, it does not include closed-record corrections, transactional packaged-goods inventory, attachments/offline drafts, configurable multi-nozzle equipment, accounts, authentication, or user sessions. The workspace is owner-operated and should remain on an owner-controlled device or private network. Local review mode uses seeded in-memory data; MongoDB enables persistence.

---

## 1. Executive product definition

The application should let the owner answer six questions from anywhere, without depending on paper books or mental calculations:

1. How much petrol, diesel, and packaged product is available now?
2. How much was sold in the current business day and shift?
3. How much money should have been received, and how much was actually accounted for?
4. What is the fuel, payment, and cash handover variance?
5. What gross margin and estimated operating profit did the outlet make?
6. Which shift, employee, reading, delivery, or adjustment explains an exception?

The core product is built around three independently captured sources of truth:

```text
Nozzle totalizers         Physical tank stock/dip       Payment accounting
        \                           |                           /
         \                          |                          /
          +---------------- Reconciliation ------------------+
                                  |
                          Owner review and close
```

The software must never hide disagreement between these sources. It should calculate the disagreement, explain its likely origin, and let the owner review, correct, or acknowledge it before closing the shift.

### 1.1 Product goals

- Let the owner record and close a normal shift in under five minutes, excluding the time required to physically obtain readings from staff or equipment.
- Calculate all fuel, revenue, stock, payment, and margin totals server-side with deterministic decimal arithmetic.
- Prevent editing of closed shifts in v1; add append-only correction history only in a later release.
- Give the owner a readable mobile dashboard showing current stock, shift status, sales, margin, expenses, variance, and alerts.
- Work safely during intermittent connectivity by preserving drafts and never duplicating final submissions.
- Reproduce the outlet's required daily stock, meter, density, water-dip, delivery, payment, and expense records.

### 1.2 Explicit non-goals for v1

- Customer loyalty, marketing campaigns, and consumer CRM.
- Full double-entry accounting, statutory tax filing, or replacement of the owner's accountant.
- Direct dispenser, automatic tank gauge, bank, UPI, POS, or OMC integration.
- OCR as the source of truth. Photos are evidence in v1; OCR can be a later assistive feature.
- Fleet credit invoicing and collection management beyond basic credit-tender recording.
- AI-generated performance scores for employees.
- Staff accounts, roles, permissions, invitation flows, and approval chains.
- Multi-outlet administration or consolidated reporting.

### 1.3 Regulatory design principle

The data model will support daily stock records, pump meter readings, product and water dips per tank, morning density at 15°C, delivery density evidence, equipment checks, invoices, and a traceable correction process. Exact tolerances, register formats, correction rules, retention periods, and OMC-specific operating rules must be confirmed with the dealership, OMC guidance, and accountant before production. They will be configuration or policy records, not magic numbers spread through UI code.

This is consistent with the [HPCL Marketing Discipline Guidelines 2024](https://www.hindustanpetroleum.com/documents/pdf/Marketing_Discipline_Guideline_2024_24102024.pdf), which describe daily stock, meter, product/water-dip and morning density records, and with the [IndianOil Marketing Discipline Guidelines index](https://iocl.com/marketing-discipline-guidelines). These sources guide the record capabilities, but the outlet's controlling OMC and current dealership instructions remain the production authority.

### 1.4 Production-pilot release priorities

**P0 — pilot cannot launch without it**

- Outlet/equipment/basic staff-name/shift setup and opening balances.
- One owner-operated workspace with direct manual entry and no account setup.
- Shift opening, operation, closing, handover, and locking.
- Nozzle, tank, density, water-dip, equipment-check, and test-dispense capture.
- Effective-dated selling prices and price-boundary readings.
- Fuel receipt and tank stock movements.
- Cash, UPI, card, credit, other-tender, and physical cash-handover capture.
- Lubricant/packaged inventory receive, sell, count, and adjust.
- Expense capture.
- Fuel, tank, payment, cash, cost, margin, and estimated operating-profit calculations.
- Variance review, owner-confirmed closed-record correction, change history, dashboard, alerts, and essential reports/exports.
- Offline drafts, retry/idempotency, backup/restore, security, monitoring, and UAT evidence.

**P1 — high-value follow-up after a stable pilot**

- Mid-shift machine reassignment, shared-nozzle splits, and richer coaching trends beyond the current attendance, litres, expected sales, and handover-variance view.
- Credit-customer account, limit, invoice, payment, and ageing workflow.
- Scheduled owner notifications through approved channels.
- Barcode-assisted packaged inventory.
- Accountant-oriented settlement/fee reconciliation and richer profitability views.
- Additional local-language UI.
- Staff logins, roles, permissions, and multi-person approval if the owner later delegates data entry.

**P2 — design for later, do not build in v1**

- Multi-outlet consolidated administration.
- Direct dispenser, automatic tank gauge, POS, bank, UPI, OMC, or accounting integrations.
- OCR-assisted readings and anomaly detection.
- Customer loyalty/marketing CRM and fleet portal.

---

## 2. V1 user and operating model

There is one application user: the petrol pump owner. Staff may tell the owner readings, cash totals, sales, or delivery information, but they do not sign in and do not enter data in v1.

### 2.1 What stays simple

- One owner-operated workspace for the forecourt.
- One unified interface on phone and desktop.
- No roles, invitations, staff PINs, permission matrix, approval inbox, or separation-of-duties workflow.
- Staff can be stored as simple operational records so the owner can note who worked a shift; a staff record is not a user account.
- The owner enters, reviews, and closes each shift.
- Alerts are personal reminders and exceptions for the owner, not assigned work items.

### 2.2 Safeguards still required

Single-user does not mean calculations or history can be unsafe:

- The owner can freely edit a draft or open shift.
- Closing a shift locks its calculation snapshot.
- Closed shifts are immutable in the first release; no correction command is exposed.
- A later correction feature must append a new version while preserving the original values and totals.
- Critical calculations remain server-side, decimal-safe, transactional, and idempotent.
- Backups and protected network/device access remain required; accounts and sessions can be reconsidered only if public or delegated access is introduced later.
- If staff accounts are added later, they will be a separate scoped feature rather than dormant role complexity in v1.

---

## 3. Core domain model and operating concepts

### 3.1 Physical hierarchy

```text
Owner workspace
└── Forecourt operations
    ├── Tanks
    │   └── Fuel product (MS/petrol, HSD/diesel, future grades)
    ├── Dispensers
    │   └── Nozzles ── mapped to exactly one active tank at a time
    ├── Packaged products / lubricant stock locations
    ├── Staff directory (names and shift participation only)
    ├── Shift templates
    └── Operational and financial policy
```

Readings belong to a nozzle or tank, not merely to a product name. This distinction is required to reconcile multiple nozzles drawing from one tank and multiple tanks holding the same product.

### 3.2 Business day and shift

Calendar date and business day are separate fields. If the outlet's operational day begins at 5:00 PM, an event at 1:00 AM can still belong to the previous business day. Store timestamps in UTC, store the outlet's IANA timezone, and derive a stable `businessDate` server-side.

Supported shift templates:

- Named shifts with configurable scheduled start and end times.
- Shifts that cross midnight.
- One active shift per operational lane/group in v1; overlapping shifts require an explicit configuration decision.
- A handover reading can close one shift and seed the next shift's opening reading to avoid duplicate entry.

### 3.3 Shift state machine

```text
DRAFT
  → OPENING_IN_PROGRESS
  → OPEN
  → CLOSING_IN_PROGRESS
  → REVIEW
  → CLOSED

CLOSED → CORRECTION_IN_PROGRESS → AMENDED
```

Rules:

- State transitions happen through explicit backend commands, never a generic status edit.
- A transition validates all required data, the owner session, shift version, and business rules in one MongoDB transaction.
- Repeated client submissions use the same idempotency key and return the original result rather than creating duplicates.
- `CLOSED` is a locked reconciliation snapshot. Later changes create amendment records and a replacement snapshot linked to the original.
- A shift with unresolved data remains in `REVIEW`; the owner can acknowledge an explained variance and close it, but cannot bypass impossible or structurally incomplete inputs.

---

## 4. Reconciliation and calculation specification

All canonical calculations run in the API. The UI may show a preview, but it must label it as a preview and replace it with the server result after validation.

### 4.1 Precision

- Store money and measured quantities as MongoDB `Decimal128` and exchange them over JSON as decimal strings.
- Never use JavaScript binary floating point for persisted financial or volume calculations.
- Configure display precision independently from stored precision. Initial proposal: currency to 2 decimals, litres to 3 decimals, totalizers to the equipment's supported precision, density to the measuring process's supported precision.
- Round only at defined boundaries. Preserve unrounded intermediate values and store calculation inputs and rule version with every reconciliation snapshot.

### 4.2 Nozzle sales

For each nozzle and price segment:

```text
metered volume = closing totalizer - opening totalizer
customer sales volume = metered volume - approved non-sale dispenses
revenue = sum(customer sales volume per price segment × applicable selling price)
```

Non-sale dispense events must record purpose and disposition:

- Quantity test returned to the correct tank.
- Quantity test consumed/not returned.
- Maintenance/calibration draw.
- Approved internal use or documented loss.

This matters because a returned test reduces billable sales and also changes expected tank outflow differently from a test that was not returned.

Hard validations:

- Closing totalizer cannot be below the accepted opening totalizer unless a documented meter replacement/reset workflow exists.
- A reading outside the configured equipment digit/precision range is rejected.
- Duplicate opening or closing readings for the same nozzle and shift are prevented by a unique index.
- A large delta is a blocking or owner-confirmation exception based on configured thresholds, not silently accepted.

### 4.3 Price history and price changes inside a shift

Fuel prices are effective-dated and never overwritten. A price record contains product, outlet, selling price, effective timestamp, evidence, owner session, confirmation timestamp, and superseded record.

If a shift crosses a price change:

1. The system creates a required price-boundary checkpoint.
2. The owner records every affected nozzle totalizer at the effective boundary.
3. Volume before and after the checkpoint is priced using the relevant price period.
4. If a boundary reading is missed, the shift cannot be silently priced at one rate. The owner must supply a documented allocation before closing the shift.

### 4.4 Tank reconciliation

For each tank:

```text
expected closing stock
= opening physical stock
+ accepted receipts
+ transfers in
+ quantities returned to tank
- metered physical outflow
- transfers out
- approved losses/adjustments

tank variance = actual physical closing stock - expected closing stock
variance percent = tank variance / relevant throughput basis
```

The exact permissible thresholds are policy configuration with effective dates and change history. The system shows both absolute litres and percentage, severity, and the calculation basis.

### 4.5 Payment and cash reconciliation

Do not collapse revenue, tender accounting, and cash handover into one number.

```text
expected sales value = fuel revenue + lubricant/other sales
accounted tender = cash sales + UPI + card + recorded credit + vouchers/other
sales-to-tender variance = accounted tender - expected sales value

expected physical cash = cash sales + cash receipts - cash-paid expenses - recorded cash removals
cash handover variance = declared cash handed over - expected physical cash
```

UPI/card settlement differences and fees are separate settlement records, not shift cash shortages. Credit is recognized as a tender allocation but not as received cash.

### 4.6 Cost and margin

The management reporting proposal is weighted-average inventory cost by product and outlet:

```text
new weighted cost =
  (opening quantity × opening weighted cost + receipt quantity × landed unit cost)
  / quantity after receipt
```

Reports must distinguish:

- Sales revenue.
- Estimated fuel cost of goods sold.
- Gross fuel margin.
- Lubricant gross margin.
- Operating expenses recorded in the system.
- Estimated operating profit.

Until the accountant confirms commission, taxes, freight, evaporation/loss treatment, card fees, and accrual rules, the UI must call the result **estimated management profit**, not statutory or net profit.

---

## 5. End-to-end user journeys

### Flow A — First-time outlet setup

**Actor:** Owner, assisted by implementation team
**Goal:** Make the first live shift structurally valid.

1. Confirm the fixed timezone, currency, business-day start, and forecourt equipment configuration; no owner identity or outlet naming step is required.
2. Select the OMC/dealership policy profile or create a reviewed custom profile.
3. Create fuel products and their display labels.
4. Add tanks with code, product, capacity, calibration/dip reference, safe fill level, reorder level, and active status.
5. Add dispensers and nozzles; map each nozzle to its current tank and record totalizer precision.
6. Add shift templates and define the handover method.
7. Configure payment methods, expense categories, stock adjustment reasons, and variance thresholds.
8. Optionally add staff names so the owner can note who worked each shift; these records have no login or permissions.
9. Enter opening stock, current totalizers, current selling prices, weighted costs, and packaged inventory as a confirmed opening-balance event.
10. Run a readiness check. The first shift cannot open until every active nozzle has one active tank mapping, every tank has a product, and all required prices are effective.

**Recovery:** Setup saves step-by-step. Imported opening balances remain drafts until the owner confirms them. Failed CSV rows are reported individually and valid rows are not silently discarded.

### Flow B — Open the owner workspace

1. The owner opens the application directly on the controlled device or private network.
2. The application connects to MongoDB and lands on the operations dashboard.
3. The owner enters and reviews every operational record manually; there is no email, password, sign-in, or session recovery flow in v1.

**Failure states:** MongoDB unavailable, network unavailable, or stale data each receive a clear retry action and never masquerade as an authentication error.

### Flow C — Open a shift

**Actor:** Owner
**Entry:** “Start shift” on mobile or “New shift” on desktop.

1. Confirm shift template, business date, planned start, and optionally select staff on duty for reference.
2. Show a physical-walk sequence grouped by dispenser/nozzle, then tank—not a database-form sequence.
3. Enter each opening totalizer with numeric keypad and unit/precision mask; optionally capture a photo.
4. Enter each tank product dip/stock, water dip, and evidence.
5. Complete required density and equipment/quantity checks for the applicable daily checkpoint.
6. Review a one-page exception summary: missing item, reading lower than prior accepted reading, excessive delta since handover, stale photo, or unmapped equipment.
7. Submit once. The backend compares the readings with the previous accepted close, locks the opening snapshot, and transitions the shift to `OPEN`.
8. The owner returns to the live shift overview.

**No-break behavior:** Every step autosaves a draft. Back navigation is safe. Image upload can continue separately, but policy decides whether missing required evidence blocks opening. A double tap or retry cannot create a second shift.

### Flow D — Run a shift

The owner's live shift page shows:

- Shift name, elapsed time, staff on duty, and active nozzles.
- Required/incomplete tasks.
- Add lubricant sale.
- Record payment summary or collection event, depending on operating model.
- Add expense.
- Record a non-sale dispense/test.
- Receive fuel.
- Start closing.

Each event gets device, client timestamp, server timestamp, outlet, shift, version, evidence status, and sync status. Events can be corrected while the shift is open; closed-shift events change only through the guided correction flow.

### Flow E — Change a fuel price

1. Owner creates a future or immediate price with effective timestamp and evidence.
2. System detects affected open shifts/nozzles.
3. A checkpoint task appears before the boundary.
4. Owner records the reported boundary totalizers and confirms the price board update.
5. Backend closes the previous price segment and opens the next.
6. A missed checkpoint becomes an explicit close-shift issue requiring the owner to enter a documented allocation before closing.

### Flow F — Receive a tanker load

1. Start receipt and record supplier/OMC, invoice, tanker, product, compartment details, invoice quantity, price/cost components, invoice density, and target tank.
2. Capture pre-decant tank stock/dip and available capacity. Block a target tank/product mismatch or unsafe overfill projection.
3. Record lorry seal/calibration and density/temperature checks as configured, with evidence.
4. Confirm decant start and completion.
5. Record post-decant dip, composite density checkpoint, shortages, and signed/photographic evidence.
6. Owner reviews expected versus physical receipt variance.
7. Accepting the receipt posts an immutable stock movement and weighted-cost update in one transaction.

**Failure states:** Wrong tank, insufficient capacity, duplicate invoice, interrupted receipt, partial compartment, rejected load, density exception, missing post-decant checkpoint, and upload failure. A receipt is never added to available stock while still a draft.

### Flow G — Record lubricants and packaged goods

- Create SKU with category, brand, pack size, barcode optional, purchase/selling prices, tax/accounting metadata placeholder, minimum stock, and supplier.
- Receive stock through a purchase/receipt event.
- Sell by selecting/scanning item, quantity, price, optional staff name, and tender allocation.
- Count stock and submit an adjustment with a required reason.
- Show low stock and negative-stock prevention. Backdated events that alter a closed shift use the closed-record correction flow.

### Flow H — Record expenses

1. Tap `+ Expense`.
2. Choose category, amount, payment source, date/time, note, and attachment.
3. The UI tells the user whether this reduces expected physical cash.
4. A large or unusual amount shows a confirmation warning but does not create an approval workflow.
5. Saving creates the expense once; a later correction preserves the original amount and reason.

### Flow I — Close and hand over a shift

1. Owner starts closing; app freezes the staff-on-duty note and shows a task checklist.
2. Record closing totalizers by physical walk order, with optional/required evidence.
3. Record closing tank dips/stock and water dips.
4. Enter tender totals: cash, UPI, card, credit, vouchers/other. Enter physical cash handed over separately.
5. Complete packaged stock count where required.
6. Server computes nozzle sales, price segments, expected tank stock, actual tank variance, expected revenue, tender variance, cash variance, margin, and unresolved tasks.
7. Review screen presents “what we expected / what was entered / difference / likely source” for each exception.
8. If there is a variance, the owner corrects the input or records an explanation and explicitly acknowledges it. Structurally invalid inputs remain blocking.
9. Owner taps `Close shift`; the server commits the locked snapshot once.
10. Once closed, create the next shift's opening seed from the accepted handover readings.

**Blocking cases:** Missing active nozzle reading, closing below opening, missing price checkpoint, unresolved tanker receipt, invalid decimal, duplicate tender allocation, stock below impossible bounds, unsynced required event, or shift version conflict.

### Flow J — Resolve a variance

1. Owner opens the variance explanation from the shift review screen.
2. System groups causes: reading error, non-sale dispense missing, delivery issue, tank dip issue, payment allocation, cash handover, lube stock, or unexplained.
3. Owner can correct an input, add a documented adjustment, record an explanation, or leave the shift in review.
4. Every acknowledged variance stores the reason, timestamp, and before/after effect.
5. The close snapshot shows both the original calculated variance and resolution status; acknowledgment does not erase the fact that a variance occurred.

### Flow K — Correct a closed shift

1. Owner selects `Correct closed shift` from the locked record.
2. Select the affected field/event, enter the replacement, attach a reason/evidence, and review the projected impact.
3. A final confirmation clearly lists the stock, revenue, cash, margin, and report totals that will change.
4. Confirming appends reversal/replacement events and generates a new reconciliation version atomically; it never overwrites the original.
5. Reports default to the latest confirmed version but can display/export the original and every amendment.

### Flow L — Owner remote review

1. Owner opens mobile home and sees last-sync time, active shift, today/business-day selector, sales, estimated margin, expenses, current stock, unresolved variance, and alerts.
2. Tapping a card opens the relevant drill-down with the same filter context.
3. Owner resolves an alert or variance from its detailed evidence view, never from an ambiguous notification alone.
4. Dashboard values show `live`, `provisional`, or `closed` status so in-progress numbers cannot be mistaken for final accounts.

### Flow M — Staff operational review

1. Owner selects a person and date/shift range.
2. View shifts worked, attendance notes if enabled, fuel volume handled as context, packaged add-on sales, cash/payment exceptions, and customer/operational incidents where captured.
3. Every metric shows its denominator and assignment context; the system does not compare an attendant on a busy diesel lane directly with one on a quiet lane through a single score.
4. The owner can drill from a metric to the relevant shift/evidence, but cannot edit the source from the performance view.
5. Employment actions and payroll remain outside v1; the view is operational evidence, not an automated disciplinary decision.

### Flow N — Reports and change-history export

1. Select report, outlet, business-date range, shift/product/tender filters, and status/version basis.
2. Preview totals and data freshness.
3. Export generation runs immediately for the supported v1 date range and records the time and owner session that requested/downloaded it; an oversized request asks the owner to narrow the range instead of introducing a job system.
4. PDF is optimized for human review; spreadsheet export is normalized and includes calculation/version metadata.
5. Empty results explain why and preserve the selected filters.

### Flow O — Connectivity loss and conflict recovery

- Read-only previously loaded data remains available with a clear stale/offline banner.
- Form drafts persist locally with a visible `Saved on this device` state.
- Each command has a stable client-generated idempotency key.
- Reconnect uploads in dependency order: evidence, draft events, then final command.
- If the owner has the app open on two devices and the server record changed, the client does not last-write-win. It shows a field-level comparison and requires refresh/re-entry.
- Final shift close requires a server acknowledgment. An offline device may prepare closure, but must not display `Closed` until the server commits it.

---

## 6. Information architecture and screen inventory

### 6.1 Owner navigation

Desktop: persistent left navigation. Mobile: five-item bottom navigation.

```text
Home
Shifts
Stock
Finance
More
```

`Stock` contains Tanks, Packaged Inventory, Fuel Receipts, and Density/Quality.
`Finance` contains Sales, Payments, Expenses, Margin/Profit, and later Credit.
`More` contains Staff, Reports, Alerts, Changes, Suppliers, and Settings.

### 6.2 Live shift quick actions

```text
Enter reading
Record payment totals
Add expense
Record lube sale
Receive fuel
Close shift
```

These appear inside the current shift rather than as a separate staff application.

### 6.3 Required review screens before implementation

The design phase should produce a linked prototype and review images at desktop 1440 px, tablet 1024 px, and mobile 390 px for the following:

| Area | Screens / states to design |
|---|---|
| Onboarding | Outlet details, products, tanks, dispensers/nozzles, mappings, shifts, tenders, optional staff names, opening balances, readiness check |
| Owner home | Healthy day, active warnings, no active shift, provisional data, loading/offline/error |
| Shift list | Active/upcoming/closed/variance filters, empty state, overdue shift |
| Shift open | Staff assignment, nozzle readings, tank/density checks, photo capture/upload, review, conflict/error, success |
| Running shift | Owner live-shift overview, task list, quick add sheet, event history, sync states |
| Shift close | Closing readings, tank counts, tender totals, cash handover, reconciliation result, blocker, variance acknowledgment, closed |
| Reconciliation | Summary, nozzle drill-down, tank drill-down, payment/cash drill-down, resolution work item |
| Fuel receipt | Draft, pre-check, compartment/density, target tank/capacity, post-decant, variance, rejection/exception, accepted |
| Tanks | Stock overview, tank detail, movement history, dip entry, low-stock alert |
| Density/quality | Daily register, entry, history, exception, missing check |
| Lubricants | Product list, product detail, receive, sell, count, adjustment, low/zero stock |
| Finance | Sales summary, payment breakdown, expense list/add/detail/correction, management profit |
| Prices | Current prices, history, schedule change, price boundary task, missed checkpoint |
| Alerts | Inbox, severity filters, detail/evidence, acknowledge/resolve |
| Reports | Catalog, filter builder, preview, export progress, empty/error |
| Staff | Simple staff list, profile, shift participation, attendance note, activate/archive record; no login or role settings |
| Changes/corrections | Change timeline, closed-record correction, impact preview, final confirmation, amended comparison |
| Settings | Operating model, business day, thresholds, tenders, categories, evidence policy, backup/export status |

### 6.4 Universal frontend state contract

Every data screen must intentionally implement:

- Loading/skeleton.
- First-use empty state with the next action.
- No-results state for active filters.
- Recoverable API error with retry.
- Offline/stale state with last successful sync.
- Record-locked state.
- Optimistic-action pending state only where safe.
- Version conflict state.
- Attachment upload pending/failed state.
- Success confirmation that identifies the saved record and next action.

### 6.5 Report catalog

| Report | Required outputs | Main decision supported |
|---|---|---|
| Daily business summary | Closed/provisional sales, volume, tenders, cash, receipts, expenses, margins, variances | Is the day complete and healthy? |
| Shift reconciliation | Opening/closing by nozzle/tank, price segments, tenders, cash handover, exceptions, owner acknowledgments | What happened in this shift? |
| Fuel sales and product mix | Volume/revenue by product, nozzle, dispenser, shift, day | What is selling and where? |
| Tank stock and movement | Opening, receipts, returns, dispensed outflow, adjustments, expected/actual close | Where did physical stock move? |
| Tank variance history | Litres, percentage, severity, resolution, repeated equipment pattern | Is there leakage, dip error, or process drift? |
| Density/water register | Morning and post-receipt readings, references, evidence, missing/exception status | Are quality checks complete? |
| Fuel receipts | Supplier/invoice/tanker, expected/accepted quantity, density, shortage, cost effect | Are deliveries and costs controlled? |
| Tender reconciliation | Expected revenue and cash/UPI/card/credit/other allocation | Is every sale accounted for? |
| Cash handover | Expected versus declared cash, cash-paid expenses, removals, owner confirmation | Is physical cash correct? |
| Expenses | Category, payment source, evidence, corrections, trend | Where is operating money going? |
| Margin/profitability | Revenue, weighted fuel/lube cost, gross margin, recorded expenses, estimated operating profit | Is the outlet trading profitably? |
| Packaged inventory | Opening, received, sold, adjusted, counted, closing, low stock, gross margin | What should be reordered or investigated? |
| Staff operations | Assignments, attendance if enabled, actions, exception rate, lube sales, context | Where is coaching/process support needed? |
| Corrections and change history | Original/change/reason/impact and owner confirmation | How and why did a closed value change? |

Every report supports Today, Yesterday, 7 days, This Month, and Custom filters where meaningful. Totals must state whether they include live, provisional, amended, or only finally closed data.

### 6.6 Alert catalog and lifecycle

Initial P0 alert rules:

- Shift not opened, closing overdue, or shift still in review.
- Required morning density, water dip, equipment check, or reading missing.
- Closing totalizer below opening or outside configured expected range.
- Missed price-boundary reading.
- Tank below reorder threshold or projected days remaining threshold.
- Tank stock outside physical/capacity bounds or variance above configured policy.
- Tanker receipt incomplete, duplicate invoice, density exception, or receipt variance.
- Sales-to-tender variance or cash-handover variance.
- Negative/low packaged stock or unusual adjustment.
- Expense above a configured warning threshold.
- Closed-record correction created or unusual correction volume.
- Attachment/evidence required but still unavailable.

Alert lifecycle:

```text
OPEN → ACKNOWLEDGED → RESOLVED
  └──────────────────→ DISMISSED_WITH_REASON
```

Critical operational rules cannot be dismissed merely to make the dashboard green. Resolution records the action, owner session, source change/acknowledgment, and resulting calculation version.

---

## 7. Visual and interaction design direction

### 7.1 Aesthetic

Use a quiet operational aesthetic rather than petrol-brand red:

- Warm off-white or very light neutral canvas.
- White or softly tinted surfaces with restrained shadows and clear borders.
- Deep charcoal/ink for text.
- Muted petrol-teal or deep blue-green as the primary interactive color.
- Soft amber for warning, muted rose only for destructive/critical states, and calm green for verified/healthy.
- Red must never be a large background or decorative brand wash.
- Information density should increase on desktop, while mobile retains one clear decision per screen.

The final palette must pass WCAG contrast checks. Status must use icon + label + color, never color alone.

### 7.2 Component system

Build reusable primitives for:

- App shell, page header, business-day selector, and sync status.
- Metric card with live/provisional/closed badge.
- Stock level bar with capacity and reorder marker.
- Status pill, severity banner, and alert item.
- Decimal/numeric field with unit, precision mask, and previous accepted value.
- Evidence/photo field with capture, preview, upload, retry, and remove-before-submit.
- Wizard step, task checklist, sticky action bar, review row, and exception card.
- Money/tender breakdown and reconciliation comparison.
- Change-history timeline and before/after panel.
- Responsive table that becomes prioritized cards on mobile.
- Confirm dialog reserved for irreversible or consequential actions.

### 7.3 Form behavior

- Large 44 px minimum touch targets and numeric keyboards for readings/amounts.
- Never clear entered values after a network error.
- Show units inside or immediately adjacent to the field.
- Show previous accepted reading and expected range without pre-filling a new physical reading.
- Autosave drafts with timestamp; distinguish `Saved locally`, `Syncing`, and `Saved to server`.
- Inline validation happens while typing; cross-record validation happens on review/submit.
- Warnings explain consequence and path forward. Blocking errors focus the first affected field.
- A sticky primary CTA uses explicit verbs: `Open shift`, `Accept receipt`, `Review totals`, `Close shift`, or `Confirm correction`.
- Destructive actions require a reason and, where material, recent authentication.

### 7.4 Accessibility and localization

- Keyboard operability on desktop and screen-reader names for every control.
- Visible focus, semantic headings, error summary, and announced async status.
- Do not encode meaning in charts alone; always expose the exact value/table.
- Indian number formatting and ₹ display, but store locale-neutral decimals.
- Architecture supports English first and later Tamil/other local languages through message keys; do not embed user-facing strings throughout business logic.

---

## 8. Recommended codebase architecture

### 8.1 Architecture decision

Use a **single full-stack modular application**, not separate frontend/backend services or microservices, for v1. It gives one deployment, one server-side business layer, and one transactional boundary while keeping the code organized by operational module.

Recommended stack:

- **Application:** Next.js App Router + React + TypeScript, responsive PWA, server Route Handlers/actions, React Hook Form, shared schema validation, query/cache library, and accessible headless UI primitives.
- **Business layer:** Server-only TypeScript modules inside the same repository. Calculations and MongoDB access never run in browser components.
- **Database:** MongoDB Atlas replica set, official driver or carefully configured ODM with sessions/transactions and Decimal128 support.
- **Object storage:** S3-compatible private bucket for meter photos, invoices, and bills; signed upload/download URLs; malware/content checks.
- **Scheduled work:** Use the deployment provider's basic scheduler only for daily reminders/health tasks that are actually required. No queue, Redis, or separate worker in v1.
- **Observability:** Structured logs, request/correlation IDs, error tracking, metrics, health/readiness endpoints, and persisted change events separate from diagnostic logs.
- **Deployment:** One container-compatible Next.js service, CDN/static delivery for frontend assets, managed MongoDB, and object storage. Confirm what “RNC” means before selecting a provider-specific design.

### 8.2 Repository layout

```text
src/
  app/                    # Pages, layouts, and server Route Handlers
  components/             # Shared accessible UI components
  features/               # Owner-facing feature screens and form logic
  server/
    auth/                 # Single-owner session and recovery
    db/                   # MongoDB client, transactions, validators
    modules/              # Shifts, tanks, receipts, payments, reports, etc.
    calculations/         # Server-only decimal reconciliation engine
    storage/              # Private attachment operations
  contracts/              # Request/response schemas; decimals as strings
  styles/                 # Tokens and global responsive styles
tests/
  unit/
  integration/
  e2e/
  fixtures/               # Owner/accountant-approved golden scenarios
docs/
  product/
  calculations/
  runbooks/
```

Database entities and canonical calculation functions stay under `src/server` and cannot be imported by client components. The browser receives validated response contracts and may calculate only clearly labeled previews.

### 8.3 Server modules

```text
Owner Account & Session
Outlet Setup
Staff Directory (non-login records)
Equipment (Tanks, Dispensers, Nozzles)
Shifts
Readings & Evidence
Prices & Costs
Fuel Receipts
Packaged Inventory
Payments & Cash Handover
Expenses
Reconciliation
Corrections & Change History
Dashboard / Projections
Reports / Exports
Alerts
Attachments
```

Each server module exposes focused commands/queries and owns its persistence access. Cross-module actions run through a server orchestration function, not by importing and mutating another module's collection directly.

---

## 9. MongoDB data design

Use a hybrid model: append-only operational events plus query-optimized aggregates/projections. Do not implement full event sourcing in v1, but preserve financial and stock facts as immutable ledger entries.

### 9.1 Principal collections

| Collection | Purpose and critical fields |
|---|---|
| `ownerAccount` / `outlet` | Single owner identity, outlet settings, timezone, business-day rules, configuration version |
| `staffRecords` | Optional staff names, employment status, and shift participation; no authentication or roles |
| `tanks` | Product, capacity, safe/reorder levels, calibration reference, status, version |
| `dispensers` / `nozzles` | Equipment codes, precision, active tank mapping, meter/reset history |
| `shiftTemplates` / `shifts` | Schedule, business date, state, optional staff-on-duty records, version, opening/closing snapshot references |
| `readingEvents` | Nozzle/tank/density/water/check readings, phase, decimal value, evidence, owner session, immutable status |
| `fuelPricePeriods` | Product price and effective interval, owner confirmation and evidence |
| `inventoryCostStates` / `costMovements` | Weighted cost inputs/results and rule version |
| `fuelReceipts` | Invoice, tanker/compartment checks, densities, target tank, quantities, state, evidence |
| `stockMovements` | Immutable fuel or packaged inventory debit/credit, source, quantity, cost, reversal link |
| `salesEvents` | Packaged sales and any explicit fuel segments derived from accepted readings |
| `paymentAllocations` / `cashHandovers` | Tender totals, settlement references, physical cash, source shift |
| `expenses` | Category, amount, payment source, correction state, attachment |
| `reconciliationSnapshots` | Inputs, formulas/rule version, outputs, severity, source shift version |
| `varianceCases` | Type, amount/quantity, workflow, evidence, resolution, owner |
| `corrections` | Original reference/value, replacement, reason, projected/confirmed impact, replacement links |
| `alerts` | Rule, severity, entity, state, timestamps |
| `changeEvents` | Owner session, action, entity, before/after summary, request/device/correlation metadata |
| `attachments` | Object key, hash, media metadata, upload/scan state, linked entity, retention |
| `idempotencyRecords` | Owner session/outlet/key/command fingerprint and original response |

### 9.2 Index and integrity strategy

- Unique active nozzle code per outlet; unique tank code per outlet.
- Unique shift instance per outlet/template/business date/scheduled occurrence.
- Unique opening/closing accepted reading per shift/nozzle/phase and tank/phase.
- Unique supplier invoice key per outlet/supplier/invoice/product as policy requires.
- Unique idempotency key per owner session/outlet/command scope.
- Operational indexes include `outletId` so a later migration is possible without implementing multi-tenant behavior now.
- TTL only for disposable security/idempotency/session data, never operational, financial, evidence, or change-history records.
- Use schema validation at MongoDB collection level for critical invariants in addition to application validation.
- Use optimistic concurrency via `version`; updates require the version last read.
- Multi-document shift close, receipt acceptance, correction confirmation, and stock/cost posting use transactions.

### 9.3 Data retention and backup

- Define OMC/statutory and business retention before launch; do not let users hard-delete closed operational records.
- Soft-deactivate equipment/staff while preserving referenced history.
- Daily automated backups plus point-in-time recovery where the Atlas tier supports it.
- Before pilot, execute and time a restore into an isolated environment; a backup is not proven until restored.
- Attachments use versioning/retention and hashes so replacement or corruption can be detected.

---

## 10. API design and failure contract

Use explicit commands for consequential transitions and ordinary query endpoints for views.

### 10.1 Representative endpoints

```text
GET    /outlet/readiness
POST   /outlet/opening-balances/submit

POST   /shifts
POST   /shifts/:shiftId/commands/open
POST   /shifts/:shiftId/readings
POST   /shifts/:shiftId/non-sale-dispenses
POST   /shifts/:shiftId/commands/start-close
POST   /shifts/:shiftId/commands/review-close
POST   /shifts/:shiftId/commands/close
GET    /shifts/:shiftId/reconciliation

POST   /fuel-receipts
POST   /fuel-receipts/:receiptId/commands/accept
POST   /price-periods

POST   /shifts/:shiftId/payment-allocations
POST   /shifts/:shiftId/cash-handover
POST   /shifts/:shiftId/expenses
POST   /shifts/:shiftId/packaged-sales

POST   /entities/:entityType/:entityId/corrections/preview
POST   /entities/:entityType/:entityId/corrections/confirm

GET    /dashboard
GET    /reports/:reportKey
POST   /exports
GET    /change-history
```

### 10.2 Command requirements

Every consequential POST carries:

- `Idempotency-Key`.
- Client command ID and record version where applicable.
- Client observed timestamp and device/session metadata.
- Decimal values as strings.
- Evidence references already uploaded or a declared pending-evidence policy state.

### 10.3 Error envelope

Errors return a stable machine code, safe message, correlation ID, field errors, retryability, and current version where relevant. Required categories:

- Validation failed.
- Authentication/session expired.
- State transition not allowed.
- Version conflict.
- Idempotency fingerprint conflict.
- Confirmation or explanation required.
- Dependency unavailable.
- Rate limited.
- Unexpected server error.

The UI maps codes to recovery steps; it must not parse human error strings.

---

## 11. Security, privacy, and change history

- Hash passwords/PINs with a current adaptive algorithm; never log credentials.
- Use secure, HTTP-only, same-site cookies for web sessions; rotate refresh/session credentials and support server-side revocation.
- Rate limit authentication, export, evidence, and mutation endpoints.
- Bind all operational requests to the outlet belonging to the authenticated owner; do not accept an arbitrary outlet scope from the browser.
- Use CSRF protection where cookie authentication requires it, strict CORS, secure headers, input size limits, and file-type/content validation.
- Encrypt in transit and at rest through managed services; secrets live only in the deployment secret manager.
- Private attachments are retrieved through short-lived signed URLs after owner-session checks.
- Record consequential changes and denied unauthenticated operations; diagnostic logs must not contain full financial payloads or private attachments.
- Provide owner-visible recent sessions/devices and revoke capability.
- Run dependency, secret, static-analysis, and authentication/session tests in CI.

---

## 12. Reliability, performance, and observability

### 12.1 Initial service targets for pilot

- 99.5% monthly availability target excluding announced maintenance.
- Common reads p95 under 500 ms at the API excluding client network latency.
- Normal command p95 under 1 second; shift close may run up to 3 seconds before becoming an async tracked operation.
- Zero accepted duplicate stock/financial events from client retry.
- Recovery point and recovery time objectives must be selected with the owner and hosting budget before production.

### 12.2 Operational controls

- `/health/live` proves the process is alive; `/health/ready` verifies critical dependencies safely.
- Structured logs include request, actor, outlet, command, entity, and correlation IDs without exposing secrets.
- Metrics: request error/latency, failed transactions, idempotent replays, upload failures, unresolved shift age, closure duration, reconciliation exceptions, login failures, and backup status.
- Alerts: application unavailable, database/storage failure, high 5xx rate, failed backup, shift overdue, and abnormal correction volume.
- Admin runbooks: failed close, stuck receipt, duplicate submission claim, attachment failure, restore, user lockout, and suspected unauthorized change.

---

## 13. Test and verification strategy

Accuracy tests are the release gate, not a final polish task.

### 13.1 Unit and property tests

- Decimal parsing, precision, and rounding boundaries.
- Business-date derivation across midnight and timezone changes.
- Nozzle calculation with one and multiple price periods.
- Test dispense dispositions and tank impact.
- Receipt and weighted-cost calculation.
- Tank, tender, and cash reconciliation.
- Reversal and amendment version chains.
- Property tests such as: accepted reversal restores prior balance; repeated command does not change total; sum of price segments equals total metered customer volume.

### 13.2 Golden operational fixtures

Create accountant/owner-approved fixtures for at least:

1. Normal single shift with zero variance.
2. Two nozzles feeding one petrol tank.
3. Two tanks holding the same product.
4. Shift crossing midnight.
5. Shift crossing a price change.
6. Daily test quantity returned to tank.
7. Test quantity not returned.
8. Tanker delivery during an open shift.
9. Partial/rejected delivery.
10. Cash-paid expense.
11. UPI/card plus credit tender.
12. Cash shortage with zero sales-to-tender variance and vice versa.
13. Meter replacement/reset.
14. Closed shift correction affecting stock, cash, and report totals.
15. Duplicate request and version conflict.

For each fixture, preserve raw inputs, hand-calculated expected outputs, owner/accountant confirmation, and rule version.

### 13.3 Integration and contract tests

- Run against a MongoDB replica-set test environment so transactions are genuinely exercised.
- Validate unique indexes and concurrent close/receipt attempts.
- Verify alerts are created only for committed operations and never for rolled-back transactions.
- Validate request/response schemas and keep browser/server contracts synchronized.
- Verify owner-session attachment access and expired signed URLs.
- Verify that every sensitive command requires a valid owner session and cannot target another outlet identifier.

### 13.4 Frontend and end-to-end tests

- Component accessibility and keyboard tests.
- Numeric form masks, error focus, autosave, photo retry, stale version, session expiry, and offline recovery.
- Critical E2E journeys at 390 px mobile and desktop: setup, open, operate, receive, close, variance acknowledgment, correction, report.
- Network tests: slow upload, request timeout after server commit, reconnect/replay, two devices editing one shift.
- Visual regression for the approved screen set and key responsive breakpoints.

### 13.5 Security and operational tests

- Unauthenticated and expired-session access attempts.
- Direct API attempts to reference a different outlet or bypass required confirmation.
- Rate limiting, session revocation, CSRF, injection, unsafe file, oversized upload, and exported-data session checks.
- Backup restore drill and dependency failure drills.
- Load test with projected pilot traffic plus a conservative burst; correctness assertions remain enabled during load.

### 13.6 User acceptance test

Run at least three complete shadow business days using real physical readings while the paper process remains the official record. Compare every system result with the owner's/accountant's manual calculation. Production cutover requires owner acceptance of calculation fixtures, daily registers/exports, correction flow, backup restore evidence, and pilot discrepancy resolution.

---

## 14. Delivery phases and review gates

The durations below assume roughly one product/design owner, two full-stack engineers, and part-time QA/domain access. They are planning ranges, not commitments.

### Phase 0 — Domain discovery and policy lock (1 week)

- Observe one opening, delivery, handover, and closing process.
- Inventory paper registers, OMC formats, invoices, pumps/nozzles/tanks, shift times, payment channels, and current calculations.
- Confirm formulas with owner/accountant and create golden fixtures.
- Resolve the blocking decisions in section 16.

**Gate:** Signed domain rules, equipment map, and sample data. No application implementation begins with unresolved calculation ownership.

### Phase 1 — UX architecture and complete design pack (2 weeks)

- Journey maps, screen map, low-fidelity flows, design tokens, component inventory.
- High-fidelity responsive screens listed in section 6.3.
- Clickable happy-path and exception-path prototypes for opening, receipt, closing, variance, and correction.
- Usability review with the owner using realistic values and both phone and desktop layouts.

**Gate:** Owner approves the unified flows, calm visual direction, responsive layouts, and error/empty/offline states before production UI coding.

### Phase 2 — Engineering foundation and outlet setup (1 week)

- Repository foundation, CI, environments, MongoDB configuration, change-history foundation, object storage, health/observability.
- Equipment, shifts, payment/category settings, staff, and opening balance workflow.
- Automated transaction, idempotency, and data-integrity test harness.

**Gate:** Seeded operations pass readiness checks; transaction tests, change history, CI, and restore procedure exist.

### Phase 3 — Shift ledger and field capture (2 weeks)

- Shift state machine, opening/closing drafts, nozzle/tank/density/water/equipment checks, evidence, non-sale dispenses, handover.
- Mobile offline draft and idempotent sync.

**Gate:** Normal and interrupted shifts complete on mobile without duplicate or lost entries; source readings are traceable.

### Phase 4 — Reconciliation and corrections (2 weeks)

- Price periods/checkpoints, tank reconciliation, tender and cash handover, weighted cost, margin, variance acknowledgment, closed snapshots, corrections.
- Golden fixture suite and concurrency testing.

**Gate:** All approved fixtures match exactly; closed records cannot be silently changed; two-device conflicts resolve safely.

### Phase 5 — Receipts, packaged inventory, and expenses (1–2 weeks)

- Tanker receipt workflow, stock movements and cost update.
- Lubricant receive/sell/count/adjust, low stock.
- Expense entry and correction.

**Gate:** Stock ledger reconciles from opening balance through all receipts/sales/adjustments and cannot go negative without an owner-confirmed, documented exception.

### Phase 6 — Owner dashboard, alerts, reports, and exports (1–2 weeks)

- Live/provisional/closed dashboard projections.
- Actionable alerts and one owner exception list.
- Daily/shift, sales, stock, density, receipt, tender, expense, margin, staff operational, and change-history reports.
- PDF/spreadsheet exports and report performance tests.

**Gate:** Every headline number drills to source records and can be reproduced by a golden fixture or report query.

### Phase 7 — Hardening, shadow pilot, and controlled launch (2 weeks)

- Accessibility, security, load, failure, restore, cross-device, and visual regression testing.
- A concise owner runbook.
- Three or more shadow business days and discrepancy review.
- Controlled first live outlet with rollback/support plan.

**Gate:** Signed UAT, production monitoring, backup/restore proof, incident contacts, and no unresolved severity-1/2 defects.

**Indicative total:** 12–14 weeks for a reliable single-owner pilot, including discovery, complete UI review, engineering, and shadow testing. Scope, team size, integrations, and feedback can change this substantially.

---

## 15. Definition of done for every feature

A feature is complete only when:

- Product behavior matches approved acceptance criteria.
- Happy path, empty, validation, server error, offline, retry, conflict, and locked states are handled where applicable.
- Canonical calculations are server-side and covered by exact expected-value tests.
- Consequential mutation is idempotent and recorded in change history.
- The owner-controlled workspace does not accept browser-supplied tenant or identity identifiers.
- Mobile 390 px, tablet, and desktop layouts are reviewed.
- Keyboard/screen-reader basics and contrast pass.
- Logs, metrics, and an operational recovery action exist.
- API contract and relevant runbook/documentation are updated.
- No secrets or real personal/financial records appear in fixtures or logs.
- Owner accepts the flow using realistic sample data.

---

## 16. Decisions required before implementation

### Blocking before design is finalized

1. What does “RNC” refer to as the intended cloud/deployment platform?
2. Can two physical shifts or cashier groups overlap at this one outlet?
3. How will the owner receive totalizers, tank dips, density, water dip, cash handover, and other inputs from staff?
4. What is the exact business-day start and current shift schedule?
5. Which OMC and which register/check formats must be reproduced?
6. Are all active tanks, dispensers, nozzles, capacities, product mappings, and totalizer precisions documented?
7. Is each sale entered individually, or are only shift-level tender totals available?
8. How are daily quantity-test litres handled: returned to tank, consumed, or mixed by case?
9. What happens operationally when a selling price changes during an active shift?
10. Which evidence is mandatory versus optional for opening, closing, delivery, expense, and correction?
11. Should the owner be allowed to close with an explained variance, and which impossible/incomplete conditions must always block closure?
12. Which costing method and expense treatment does the accountant accept for management reporting?

### Blocking before production

13. Confirm exact variance/tolerance thresholds and effective-date policy with the OMC/dealership.
14. Confirm data and document retention, export, invoice, privacy, and change-history requirements.
15. Select owner authentication/recovery method, MFA requirement, and session duration.
16. Select backup tier, recovery targets, object storage region, and production support owner.
17. Approve all golden fixtures and complete shadow-run/UAT sign-off.

### Non-blocking but important follow-ups

- Local-language priority.
- Barcode support for lubricants.
- POS/UPI/bank/OMC integrations.
- OCR meter assistance.
- Credit customer ledger/invoicing.
- Multi-outlet dashboard.
- Automated tank-gauge/dispenser feeds.
- Staff accounts and permissions if the owner later delegates entry.

---

## 17. Main risks and design responses

| Risk | Design response |
|---|---|
| Manual reading error | Previous-value context, precision masks, evidence, range checks, owner review, correction workflow |
| Duplicate submission after timeout | Idempotency keys, command fingerprints, transactional response records |
| MongoDB used like an unstructured document store | Domain-owned schemas, collection validators, unique indexes, transactions, immutable ledgers |
| Historical profit changes silently | Locked close snapshots, append-only correction/reversal, before/after change history |
| Shift spans price change | Effective price periods and mandatory totalizer checkpoint/exception |
| Fuel tests distort sales/stock | Explicit non-sale dispense and disposition events |
| Cash shortage confused with card settlement | Separate sales-to-tender, cash-handover, and external settlement reconciliation |
| Profit formula disputed | Versioned calculation policy, golden fixtures, “estimated management profit” label |
| Poor connectivity | Local drafts, visible sync state, idempotent replay, server acknowledgment for final close |
| Owner overwhelmed by ERP UI | One unified dashboard, guided shift flow, quick actions, and physical-walk ordering |
| Red-heavy visual feels harsh | Neutral base, teal/ink primary, red reserved for critical states |
| Compliance rule changes | Effective-dated policy configuration and reviewed exports, not hard-coded UI constants |
| Dashboard hides stale/provisional data | Prominent data status and last-sync timestamp with drill-through |

---

## 18. Success measures for the pilot

Measure from telemetry plus the owner's review after the shadow pilot:

- 100% of pilot shifts have complete required opening and closing records.
- 100% of closed shifts have reproducible reconciliation snapshots and change lineage.
- Zero duplicate accepted financial/stock events under retry testing and pilot use.
- At least 95% of standard shift submissions complete without support intervention.
- Median form interaction time meets the five-minute entry target, excluding physical measurement.
- 100% of deliberate test discrepancies are detected and routed to a visible variance case.
- Owner can trace every dashboard total to source records in no more than two drill-downs.
- No unresolved critical accessibility, session-security, backup/restore, or data-loss defects at launch.
- Owner usability sign-off after realistic phone and desktop use.

---

## 19. Recommended review sequence

Review this plan in the following order before implementation:

1. Approve the product boundary and v1 non-goals.
2. Answer the 12 pre-design blocking decisions, with the single-owner model already fixed.
3. Validate the physical equipment and shift model.
4. Approve reconciliation formulas with the owner/accountant using golden examples.
5. Approve the complete screen map and the calm visual direction.
6. Produce and review the responsive design pack and clickable exception flows.
7. Freeze the pilot acceptance criteria and only then begin Phase 2 engineering.

This sequence prevents attractive screens from being built around the wrong operational or financial model, while still putting the full UI in front of the user before production code is committed.
