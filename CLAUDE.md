# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Forecourt (`petrol-pump-os`): a single-owner petrol pump operations app (Next.js 16 App Router, React 19, TypeScript, MongoDB, Decimal.js, Zod). There is no auth, no staff accounts, and no roles: the owner enters everything. `README.md` lists the v1 boundaries, and `IMPLEMENTATION_PLAN.md` holds the full product and UX roadmap. The UI copy and design should stay calm and owner-focused, without harsh or excessive red.

## Commands

```bash
npm run dev            # http://127.0.0.1:3000; seeded in-memory mode when MONGODB_URI is empty
npm test               # vitest run (unit + component + integration, jsdom)
npx vitest run tests/unit/reconciliation.test.ts     # single file
npx vitest run -t "records an auditable"             # single test by name
npm run test:coverage  # enforces 80% lines/functions/statements, 75% branches on the files listed in vitest.config.ts
npm run test:e2e       # Playwright, desktop + mobile (iPhone 13) projects; reuses or starts `npm run dev`
npx playwright test --project=desktop tests/e2e/owner-workflows.spec.ts
npm run typecheck
npm run lint
npm run build
```

Set `PLAYWRIGHT_BASE_URL` or `PLAYWRIGHT_WEB_SERVER_COMMAND` to override the e2e target or server.

## Architecture

**Layers.** `src/app/**/page.tsx` are async server components (`dynamic = "force-dynamic"`) that read directly from repositories and stores, then pass plain data to `"use client"` components in `src/components/`. Client components make changes through `fetch("/api/...")` and then call `router.refresh()`. API route handlers (`src/app/api/**/route.ts`) follow one pattern: parse the body with a Zod schema from `src/server/http/schemas.ts`, call a service or repository, and pass any error to `apiError()`.

**Error mapping is string-based.** `src/server/http/api-response.ts` maps thrown `Error` messages to HTTP status codes by matching exact strings or prefixes (for example "Shift not found" → 404, "Shift changed on another device…" → 409). If you add or rename an error message in a service or repository, update this mapping, or the error becomes a 500.

**Dual storage backend.** Every store has an in-memory implementation and a MongoDB implementation, chosen at runtime by `hasMongoConfiguration()` (`src/server/db/mongo-client.ts`):
- `OperationsRepository` (shifts, pump-shift entries, tank balances, inventory movements): an interface in `operations-repository.ts`, with `memory-` and `mongo-` implementations, selected by `getOperationsRepository()` in `repository-provider.ts`.
- `staff-store`, `forecourt-config-store` (products, tanks, stations/nozzles), `journal-store` (expenses, fuel receipts), and `quality-store` (density checks) branch on `hasMongoConfiguration()` inside each function.
- In-memory state is kept on `globalThis.forecourt*` singletons so it survives HMR. Tests reset these directly (for example `globalThis.forecourtConfigStore = createMemoryForecourtConfigStore(...)`). Any behaviour change has to be made in both backends.
- Multi-document writes (opening or closing a shift, and saving, editing, or voiding a fuel receipt, which move tank stock) use MongoDB transactions (`session.withTransaction`), so the Mongo deployment must support transactions.

**Domain model.** One OPEN shift at a time, which serves as the "business day" shown on `/day` (the Today sheet). Stations are nozzles, grouped into pumps/dispensers and sides (`src/server/domain/forecourt.ts`, `pump-grouping.ts`). A shift snapshots station config, prices (purchase/reseller and selling), and tank stock when it opens. While it is open, the owner can record per-pump shift entries and correct opening readings, allocations, prices, and the business date, with audit history. Closing runs `shift-reconciliation-service` / `calculations/reconciliation.ts`, deducts tank stock, and locks the shift. Closed shifts are immutable. Close and receipt/expense POSTs are idempotent through an `Idempotency-Key` header, which client forms generate once per submission with `useRef`.

**Money and volume math.** All calculations run on the server with Decimal.js (precision 32, ROUND_HALF_UP). Values are stored and passed as strings: volumes to 3 decimal places and money to 2. Never use JS `number` arithmetic for litres or rupees. Invalid inputs raise `CalculationError`, which the API returns as 422.

**Business time.** Dates are business dates in `Asia/Kolkata` (`src/lib/business-time.ts`), as `YYYY-MM-DD` strings. Use `businessDate()` rather than `new Date().toISOString()`.

**Seed data.** `src/server/demo/demo-data.ts` and the default staff and config in the stores seed memory mode. The default layout is Pump 1/Pump 2, N1/N3 on Side 1, N2/N4 on Side 2, with N1/N2 petrol and N3/N4 diesel.

## Tests

- `tests/unit`: pure services and calculations.
- `tests/integration`: memory repositories and stores. No MongoDB is needed.
- `tests/components`: Testing Library in jsdom.
- `tests/e2e`: Playwright (excluded from vitest).

The `@/` alias resolves to `src/` in both TypeScript and Vitest.
