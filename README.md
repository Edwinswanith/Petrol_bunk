# Forecourt

Forecourt is a responsive, single-owner petrol pump operations system. It connects attendance, staff-to-machine allocation, shift totalizers, fuel receipts, tank reconciliation, collections, expenses, quality checks, staff performance, and daily reporting in one calm operating workspace.

## Product preview

![Forecourt owner dashboard](docs/screenshots/dashboard-desktop.png)

<p align="center">
  <img alt="Forecourt mobile dashboard" src="docs/screenshots/dashboard-mobile.png" width="360" />
</p>

![Forecourt stock and delivery view](docs/screenshots/stock-desktop.png)

## What works

- Configure any number of fuel products, tanks, and independently metered stations, including petrol, diesel, XP95, X100, or custom grades.
- Run the full day from one physical forecourt sheet: Pump A and Pump B, mirrored sides, eight nozzle totalizers, four side-level staff allocations, prices, tank readings and closing collections.
- Enter two clear daily prices for every fuel: the reseller purchase price paid by the outlet and the customer selling price used for revenue. Both are locked into the daily record.
- Open one active shift with protected station totalizers, price snapshots, staff allocations, and physical tank stock.
- Maintain a staff directory, monthly salary commitment, and daily present, late, absent, or leave register with check-in and check-out times.
- Assign one primary operator to each station; one operator may run multiple stations and assigned operators are marked present automatically.
- Record fuel deliveries, accepted quantities, density evidence, water dips, and expenses.
- Capture returned or non-returned test fuel during shift close.
- Reconcile station sales, product totals, physical tank stock, tender totals, cash handover, fuel cost, gross margin, and estimated operating profit with decimal-safe server calculations.
- Deduct aggregated station outflow from each source tank when a shift closes, while returned test fuel is excluded and unreturned test fuel remains an inventory loss.
- Increase tank stock immediately when an accepted fuel receipt is saved, with a per-tank auditable movement ledger and balance-after value.
- Include linked fuel receipts and cash/non-cash expenses automatically in the active shift reconciliation.
- Preview every reconciliation before an idempotent, immutable close; shift closure and tank deduction are committed in one MongoDB transaction.
- Require an explanation before closing a material payment, cash, or physical tank variance.
- Calculate aggregated litres, expected sales value, declared handover, and handover variance for every assigned operator across all assigned stations.
- Reconcile Cash, UPI, Card, Credit and Other collections independently for every pump side, then aggregate the same evidence into staff, product and daily totals.
- Review live owner dashboards for sales, margin, expenses, fuel stock, throughput, payment mix, and exceptions.
- Review month-wise finance with revenue, product gross profit, day-wise expenses, salary budget, estimated net profit, and each employee's petrol/diesel litres, revenue, and gross-profit contribution.
- Export spreadsheet-safe daily, 7-day and 30-day CSV workbooks containing prices, nozzle readings, pump-side collections, staff performance, tank variances, expenses and fuel receipts.
- Operate across desktop and mobile layouts without staff accounts, role management, or approval queues.

## Quick start

Requirements: Node.js 20.9 or newer.

```bash
git clone https://github.com/Edwinswanith/Petrol_bunk.git
cd Petrol_bunk
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

When `MONGODB_URI` is empty, Forecourt starts in a seeded in-memory review mode. Saved records survive navigation but reset when the server restarts.

## Persistent storage

Copy the environment template:

```bash
cp .env.example .env.local
```

Configure MongoDB:

```dotenv
MONGODB_URI=mongodb+srv://...
MONGODB_DB=forecourt
```

No owner name, outlet name, email, or session secret is required. The owner uses the workspace directly and enters all operational information manually.

Use a MongoDB deployment that supports transactions so shift opening and closing remain atomic.

## Owner workflow

1. Configure fuel products, customer/reseller prices, tanks, and stations from **Products, tanks & stations**.
2. Add staff, monthly salary commitments, and attendance from **Staff, attendance & salary**.
3. Open **Today**, enter the reseller and customer price, allocate an operator from each side's dropdown, edit all eight opening totalizers independently, confirm tank stock, then start the business day.
4. Record deliveries, density/water checks, and expenses during the shift.
5. Return to the same **Today** page and enter closing totalizers, physical stock, test fuel, and Cash/UPI/Card/Credit collections for every pump side.
6. Review nozzle, side, product and operator sales, payment variance, expected tank balances, and physical stock variance.
7. Close once. Tank inventory is updated and the shift is locked in the same transaction.
8. Review month-wise product profit, day-wise expenses, payroll, and employee contribution in **Finance**, or download the operations CSV from Reports.

## Technology

- Next.js 16 and React 19
- TypeScript
- MongoDB with an in-memory review adapter
- Decimal.js for fuel and monetary calculations
- Zod request validation
- Vitest and Testing Library
- Playwright desktop/mobile browser journeys

## Verification

```bash
npm test
npm run test:coverage
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

Current verification baseline:

- 47 unit, component, and integration tests
- 12 desktop/mobile end-to-end journeys
- Production build, TypeScript, ESLint, and the automated test suite passing

The runtime health endpoint is `GET /api/health`.

## v1 boundaries

- One owner and one active daily forecourt sheet. Products, tanks, pumps, sides, nozzles, and staff allocations are configurable.
- The default layout is Pump A and Pump B with N1/N3 on Side 1 and N2/N4 on Side 2. N1/N2 default to petrol and N3/N4 to diesel; mappings remain configuration data.
- One primary operator is assigned to each pump side for the full day. An operator may run multiple sides; mid-day reassignment and shared-side splits are deferred.
- There are no staff accounts, roles, approvals, invitations, or staff-facing screens; the owner records all activity.
- Closed shifts are immutable in v1.
- Packaged-goods stock is an owner reference list rather than a transactional inventory ledger.
- The workspace has no authentication or user sessions in v1. Keep it on a trusted owner-controlled device or private network rather than exposing it publicly.
- Prices are snapshotted when a shift opens. Mid-shift price changes, totalizer rollover, tank transfers, and closed-shift correction journals are deferred.
- Tank calibration, density tolerances, OMC procedures, and the hosting target require production confirmation.

See [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) for the complete product, UX, engineering, pilot, and production-readiness roadmap.
