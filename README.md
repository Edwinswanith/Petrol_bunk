# Forecourt

Forecourt is a responsive, single-owner petrol pump operations system. It connects shift readings, fuel receipts, tank reconciliation, collections, cash, expenses, quality checks, margin estimates, and daily reporting in one calm operating workspace.

## Product preview

![Forecourt owner dashboard](docs/screenshots/dashboard-desktop.png)

<p align="center">
  <img alt="Forecourt mobile dashboard" src="docs/screenshots/dashboard-mobile.png" width="360" />
</p>

![Forecourt stock and delivery view](docs/screenshots/stock-desktop.png)

## What works

- Open one active shift with protected nozzle totalizers and physical tank stock.
- Record fuel deliveries, accepted quantities, density evidence, water dips, and expenses.
- Capture returned or non-returned test fuel during shift close.
- Reconcile nozzle sales, physical tank stock, tender totals, cash handover, fuel cost, gross margin, and estimated operating profit with decimal-safe server calculations.
- Include linked fuel receipts and cash/non-cash expenses automatically in the active shift reconciliation.
- Preview every reconciliation before an idempotent, immutable close.
- Review live owner dashboards for sales, margin, expenses, fuel stock, throughput, payment mix, and exceptions.
- Export a spreadsheet-safe daily CSV containing summaries, shifts, variances, expenses, and fuel receipts.
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

Configure at least:

```dotenv
MONGODB_URI=mongodb+srv://...
MONGODB_DB=forecourt
OWNER_NAME=Edwin
OUTLET_NAME=Swanith Fuels
```

Use a MongoDB deployment that supports transactions so shift opening and closing remain atomic.

## Owner workflow

1. Open the shift with nozzle totalizers, tank stock, and optional staff names.
2. Record deliveries, density/water checks, and expenses during the shift.
3. Enter closing totalizers, physical stock, test fuel, tender totals, and declared cash.
4. Review the server-calculated fuel, tank, tender, cash, and margin position.
5. Close and lock the shift. Replaying the same command returns the canonical result instead of duplicating it.
6. Review the dashboard or download the daily operations CSV from Reports.

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

- 24 unit, component, and integration tests
- 10 desktop/mobile end-to-end journeys
- 98.37% line coverage across the critical calculation and workflow layer
- Production build, TypeScript, ESLint, dependency audit, and secret scan passing

The runtime health endpoint is `GET /api/health`.

## v1 boundaries

- One owner, one outlet, one active shift, one petrol nozzle/tank, and one diesel nozzle/tank.
- Staff names are operational notes only; there are no staff accounts, roles, approvals, or invitations.
- Closed shifts are immutable in v1.
- Packaged-goods stock is an owner reference list rather than a transactional inventory ledger.
- Local review mode has no authentication. Add the owner session/recovery gate and deployment secrets before public exposure.
- Outlet prices, cost basis, tank calibration, density tolerances, OMC procedures, and the hosting target require production confirmation.

See [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) for the complete product, UX, engineering, pilot, and production-readiness roadmap.
