# EmployeeCatalogMCP3 — Test Suite

A TypeScript + Vitest test suite that verifies the **EmployeeCatalogMCP3** REST API
on OutSystems Developer Cloud (ODC). It is not an application — it exists solely to
confirm the ODC backend endpoints behave to spec. It contains pure offline unit tests
(mocked `fetch`), dual-mode integration tests (live against the tenant when configured,
otherwise mocked), and one live-only test.

The ODC application itself (entities, server actions, REST API, screens) was generated
fresh from `brd-employee-catalog.md` via OutSystems AI Mentor Web and published to the
Development environment.

---

## Live deployment

| | |
|---|---|
| **App** | EmployeeCatalogMCP3 (ODC WebApplication) |
| **Tenant** | *(your ODC tenant)* |
| **Environment** | Development |
| **Current revision** | 2 |
| **App URL** | `https://<your-tenant>-dev.outsystems.app/EmployeeCatalogMCP3` |
| **REST base URL** | `https://<your-tenant>-dev.outsystems.app/EmployeeCatalogMCP3/rest/EmployeeAPI` |

> Tenant hostnames, environment/app identifiers, and keys are environment-specific
> and intentionally omitted here. Set your own values in `.env` (gitignored).

### Endpoints under test
| Method | Route | Purpose |
|---|---|---|
| `POST` | `/employees` | Create an employee (201); 409 on duplicate email, 400 on validation failure |
| `GET` | `/employees` | List active employees; optional `Department`, `Page`, `PageSize` query params |
| `GET` | `/employees/{Id}` | Fetch a single active employee; 404 when absent |

---

## Getting started

### Prerequisites
- Node.js (ESM) and npm
- Network access to the ODC tenant for live runs (optional — the suite falls back to mocks)

### Install
```bash
npm install
```

### Configure
Copy the template and set the REST base URL:
```bash
cp .env.example .env
```
```
OUTSYSTEMS_BASE_URL=https://<your-tenant>-dev.outsystems.app/EmployeeCatalogMCP3/rest/EmployeeAPI
OUTSYSTEMS_API_KEY=        # optional; sent as X-API-Key when set
```
- **With `OUTSYSTEMS_BASE_URL` set** → dual-mode integration tests hit the live tenant;
  the live-only test runs.
- **With it unset** → dual-mode tests are intended to fall back to a stubbed `fetch`, and
  the live-only test is skipped. Note: an offline (mock) pass alone is not sufficient to
  claim a feature green — the tracker requires a live run.

> **Known issue (offline mode):** the offline fallback does **not** currently hold for all
> tests. A read-only verification on 2026-10-10 found 6 failures with
> `OUTSYSTEMS_BASE_URL=""` (5 in `create-employee.test.ts`, 1 in `employees.test.ts`):
> those tests attempt a real network call to `mock.local` (`getaddrinfo ENOTFOUND`)
> instead of using the stub. So the suite is **not** fully green offline yet. See
> `00-run-log.md` → "Read-only verification" for details. Live mode passes 21/21.

> `.env` is gitignored. Never commit real tenant URLs or keys.

### Run
```bash
npm test            # run everything once (CI-safe)
npm run test:watch  # re-run on change
npm run test:ui     # Vitest browser UI
npm run test:coverage
npm run typecheck   # tsc --noEmit, no tests
```

---

## Project structure

```
.
├── src/
│   └── client.ts                       # OutSystemsClient — fetch wrapper (base URL, headers, params, JSON parse)
├── tests/
│   ├── setup.ts                        # loads .env via dotenv before each suite
│   ├── client.test.ts                  # offline unit tests for OutSystemsClient (7)
│   ├── create-employee.test.ts         # Use Case #1 — POST /employees, dual-mode (6)
│   ├── employees.test.ts               # GET list + GET by id, dual-mode (3)
│   ├── filter-by-department.test.ts    # Use Case #2 — GET /employees?Department, dual-mode (4)
│   └── unique-email-index.test.ts      # DB-level IdxEmail_Unique probe, live-only (1)
├── brd-employee-catalog.md             # Business Requirements Document (source of truth for the ODC app)
├── README.md                           # this file
├── 00-use-case.md                      # Use-case tracker (SFTDD: status, phases, GWT scenarios)
├── 00-run-log.md                       # Chronological build + verification log
├── .kiro/steering/                     # Project conventions (tech, structure, workflow, policies)
├── .env.example                        # env template (committed)
├── .gitignore
├── LICENSE
├── vitest.config.ts
├── tsconfig.json
└── package.json

# Local-only (gitignored, not in the repo):
#   .env                               — real tenant URL / key
#   conversation-transcript-round3.md  — working conversation transcript
```

---

## Test coverage

**21 tests total** — 7 pure offline-unit, 13 dual-mode (live when configured, else mocked),
1 live-only. **Live mode: 21/21 passing** (verified on revision 2). **Offline mode: not
fully green** — see the known issue above (6 tests reach for `mock.local` instead of the
stub).

| File | Tests | Kind |
|---|---|---|
| `client.test.ts` | 7 | offline unit (mocked fetch) |
| `create-employee.test.ts` | 6 | dual-mode (UC#1) — live or mocked |
| `employees.test.ts` | 3 | dual-mode (GET list + by id) — live or mocked |
| `filter-by-department.test.ts` | 4 | dual-mode (UC#2) — live or mocked |
| `unique-email-index.test.ts` | 1 | live-only; skipped offline |

### Use cases
- **UC#1 — Create Employee Record** (Completed): happy path 201 + echoed fields, duplicate
  email 409, missing field 400, empty body 400 (framework shape).
- **UC#2 — Filter Active Employees by Department** (Completed): filter isolates the
  requested department, active-only, empty department, no-filter spans departments. The
  Red run caught a real defect (the `Department` filter was ignored); fixed via Mentor and
  republished as revision 2.

### Known coverage notes
- **Omit-empty responses**: ODC omits unassigned/empty output fields, so `GET /employees`
  on an empty set returns `{}` rather than `{ Employees: [], TotalCount: 0 }`. The list
  tests normalise this (missing `Employees` → `[]`, missing `TotalCount` → `0`).
- **Soft-delete not on the REST surface**: removal is `Employee_Remove` (UI only), so the
  active-only exclusion (UC#2 S2) is proven offline via the mock; the live path verifies
  active-only via the records it can create.
- **`IdxEmail_Unique`**: the ODC Context Service does not expose entity indexes, so the DB
  index cannot be confirmed structurally. It is verified behaviorally by
  `unique-email-index.test.ts` (concurrent-create probe → at most one row persists).

---

## Documentation map
- **`brd-employee-catalog.md`** — the requirements the ODC app was generated from.
- **`00-use-case.md`** — per-use-case status, phases, and Given/When/Then scenarios.
- **`00-run-log.md`** — everything done, in order: cleanup → build → UC cycles → verification.
- **`conversation-transcript-round3.md`** — the working conversation (user prompts + Kiro
  responses). Kept local only; gitignored, so it is not part of this repo.
