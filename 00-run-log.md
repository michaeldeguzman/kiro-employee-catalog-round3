# Run Log — EmployeeCatalogMCP3

A chronological record of everything done in this project — from the initial
repository cleanup through the fresh ODC build and the per-use-case TDD cycles.
Timestamps are UTC unless marked local. Newest entries at the top; read bottom-up
for chronological order.

---

## 2026-10-10 — Documentation sync (README + tracker/transcript consistency)

- Created `README.md` (project front door): purpose, live deployment details
  (app key, tenant, revision 2, app + REST URLs), endpoints under test, getting-started
  (install / configure / run), project structure, the 21-test coverage breakdown, the
  known coverage notes (omit-empty, soft-delete not on REST surface, IdxEmail_Unique), and
  a documentation map linking the BRD, use-case tracker, run log, and transcript.
- Fixed a stale count in `00-use-case.md` (UC#2 "Last Live Run"): 20/20 → 21/21 after the
  `unique-email-index` probe was added.
- Appended this entry to `00-run-log.md` and a corresponding turn to `00-transcript.md`.
- No code changes; suite remains 21/21 live on revision 2.

---

## 2026-10-10 — Follow-up: verify the IdxEmail_Unique database index

### Why this was needed
During the UC#1 build, the unique index `IdxEmail_Unique` was **not independently
verified** — Mentor narrated that it created the index, and the UC#1 duplicate-email
test (S2) passed, so uniqueness was assumed covered. That conflated two layers: the
UC#1 S2 test is caught by `Employee_Validate` (an application-layer aggregate) and
would pass whether or not the DB index exists. The index itself was never confirmed.

### What inspection could and couldn't show
- `context_entities` / `context_search` return the Employee entity's **attributes but
  no index collection** at all. The ODC Context Service does not surface indexes, so
  the index cannot be confirmed (or denied) structurally through the available MCP
  inspection tools. Its absence from that output is "not reported," not "not present."

### Behavioral verification added
- New test `tests/unique-email-index.test.ts` (live-only; skipped offline because a
  mock cannot prove a real DB constraint). It fires two concurrent POSTs with the same
  brand-new email so both clear `Employee_Validate` before either commits, then races
  the inserts, and finally looks the email up to count persisted rows.

### Result (live, revision 2)
```
[unique-index] email=uc1.index.<run>@example.com statuses=[201,400] created201=1 persistedRows=1
```
- One create returned 201, the other 400; a follow-up lookup found **exactly 1 row**.
- The uniqueness guarantee holds: the system never ended up with two rows sharing an
  email (BRD Rule 4 end-state satisfied).
- Nuance: the loser returned 400, meaning on this run the platform serialized the
  requests enough that the second one's validation aggregate already saw the first
  row (caught at the validation layer, not purely at the DB index). Forcing the
  pure index-only path (both clearing validation, colliding only at commit) is hard
  to reproduce on demand given ODC request handling. The decisive evidence is
  `persistedRows=1` — a single surviving record regardless of which layer caught it.

---

## 2026-10-10 — Session bootstrap (pre-build): rename, git removal, fresh-slate cleanup

This section records the work that preceded any build, so the log is complete from
the beginning of the session.

### Step 1 — Rename EmployeeCatalogMCP2 → EmployeeCatalogMCP3
- Searched the workspace for all references to `EmployeeCatalogMCP2`.
- Found 3 occurrences, all in `00-use-case.md` (Last Phase Completed, Last Live Run, and the Green-gate Note).
- Replaced all 3 with `EmployeeCatalogMCP3`. Post-edit search confirmed zero `MCP2` references remained.

### Step 2 — Remove git from the codebase
- Inspected state first: branch `main`, an `origin` remote pointing at a prior
  round-2 GitHub repo, all files untracked (no commits staged).
- Deleted the `.git` directory. `git status` afterwards reported "not a git repository" —
  history and the remote link removed; working files left intact.

### Step 3 — Point everything at MCP3 + reset tracker (user: "no trace of the previous build")
- Updated `.env`: `OUTSYSTEMS_BASE_URL` → `.../EmployeeCatalogMCP3/rest/EmployeeAPI`
  (previously pointed at the live MCP2 app — the one consequential leftover).
- Reset the `00-use-case.md` Use Case #1 status block to a from-scratch state
  (Status: Not Started, Phase: Not Started, Test Count: 0, Last Live Run: None),
  discarding the prior build's "Green / 20/20 passed / revision 4" history.
- Removed previous-build artifacts for a clean slate: `src/` (old `client.ts`),
  `tests/` (4 old test files), `node_modules/`, `package-lock.json`, and stray
  `.DS_Store` files (root + `.kiro/`). `.git` had already been removed in Step 2.
- Kept intentionally (inputs/config, not prior-build output): `00-use-case.md`,
  `brd-employee-catalog.md`, `.kiro/steering/*`, `package.json`, `tsconfig.json`,
  `vitest.config.ts`, `.env.example`, `.gitignore`, `LICENSE`.
- Verified: workspace-wide search for `MCP2|revision 4|20/20` → no matches.

### Pre-flight for the build
- `npm install` → 62 packages added, 0 vulnerabilities.
- OutSystems MCP auth: logged in to the ODC tenant.
- `app_list` search "EmployeeCatalog" → tenant had `EmployeeCatalogMCP2`, `EmployeeCatalogMCP`,
  and `Employee Catalog`, but **no MCP3**. Decision: create MCP3 brand-new (not cloned).

---

## 2026-10-10 — Use Case #2: Filter Active Employees by Department (SPEC → Red → Green → Refactor)

### Context
- **Endpoint under test**: `GET /employees?Department={name}` (BRD §6.2 — ListEmployees)
- **App**: EmployeeCatalogMCP3
- **Published revision after fix**: 2 (publish outcome: success, status: Finished)
- **Test file**: `tests/filter-by-department.test.ts`

### Phase progression
| Phase | Outcome |
|---|---|
| SPEC | 4 GWT scenarios authored (filter-to-department, active-only, empty-department, no-filter) |
| Red | Live run exposed a defect: `ListEmployees` ignored the `Department` filter — filtering by a department returned `Engineering` rows, and an empty department returned the full 19-row active set (2 tests failed) |
| Green | Defect fixed via Mentor + republished (rev 2); full suite 20/20 live |
| Refactor | No test changes needed; mock already modelled the correct active-only + exact-match contract |

### Defect & root cause
- **Symptom**: `GET /employees?Department=X` returned all active employees regardless of X.
- **Root cause** (per Mentor): a dead `IfNode` ("Department filter?") routed execution around the aggregate without ever applying a filter; the `GetEmployees`/`CountEmployees` aggregates had no Department condition.
- **Fix**: added conditional filter `Department = "" or Employee.Department = Department` to BOTH the `GetEmployees` and `CountEmployees` aggregates (so `TotalCount` matches the filtered set), and removed the dead IfNode + its unreachable assign. Pagination was already correct and left untouched. Validation: 0 errors, 2 non-blocking warnings.

### Live verification run
```
RUN TIMESTAMP (UTC): 2026-10-10T01:21:16Z
 ✓ tests/client.test.ts            (7 offline unit tests)
 ✓ tests/create-employee.test.ts   (6 Use Case #1 tests, live)
 ✓ tests/employees.test.ts         (3 GET integration tests, live)
 ✓ tests/filter-by-department.test.ts (4 Use Case #2 tests, live)

 Test Files  4 passed (4)
      Tests  20 passed (20)
   Duration  ~4s
```

### Use Case #2 scenario results (live, revision 2)
| Scenario | Expectation | Result |
|---|---|---|
| S1 — Filter to department | 200; every row Department = requested; no other dept leaks | PASS |
| S2 — Active-only | 200; no inactive record present; TotalCount = row count | PASS |
| S3 — Empty department | 200; empty result (omit-empty → [] / 0) | PASS |
| S4 — No filter | 200; results span more than one department | PASS |

### Notes
- The exposed EmployeeAPI has no REST route that soft-deletes a record (removal is
  `Employee_Remove`, UI-only), so S2's inactive-exclusion is proven offline via the mock
  (which seeds an IsActive=False row); the live path verifies active-only via the records
  it can create. This limitation is documented in the test file header.

---

## 2026-10-10 — Use Case #1: Create Employee Record (SPEC → Red → Green → Refactor)

### Context
- **App**: EmployeeCatalogMCP3 (ODC WebApplication, created fresh — not cloned from any prior build)
- **Environment**: Development
- **Published revision**: 1 (publish outcome: success, status: Finished)
- **App URL**: `https://<your-tenant>-dev.outsystems.app/EmployeeCatalogMCP3`
- **REST base URL**: `https://<your-tenant>-dev.outsystems.app/EmployeeCatalogMCP3/rest/EmployeeAPI`
- **Test command**: `npm test` (vitest --run)

> Tenant hostname and the app/portfolio/environment/publication identifiers are
> environment-specific and intentionally omitted from this committed log.

### Build (OutSystems AI Mentor Web)
| Step | Result |
|---|---|
| Create asset EmployeeCatalogMCP3 | OK |
| Generate full app from BRD | changeApplied: true, validation: 0 errors / 2 warnings (non-blocking: cosmetic update-behavior note, expected Google Fonts offline note) |
| Publish | publishSucceeded, revision 1 |

Elements built: MessageType static entity (Success/Error/Warning/Info); EntityActionMessage
& EntityActionResult structures; Employee entity (11 attributes, safe DateTime defaults,
IdxEmail_Unique unique index); roles HRAdministrator + DirectoryViewer; EntityActionResult
folder actions (BuildFromSuccess, BuildFromError, CombineEntityActionMessages);
Session_GetNormalizedSessionUserId (Function); Employee CRUD wrappers (Employee_Validate,
Employee_Upsert, Employee_GetCanRemove, Employee_Remove); EmployeeAPI REST
(POST /employees, GET /employees, GET /employees/{Id}); screens Employee_List, Employee_Detail.

### Phase progression
| Phase | Timestamp (local) | Outcome |
|---|---|---|
| SPEC | 2026-10-10 11:45 | 4 GWT scenarios confirmed from `00-use-case.md` |
| Red | 2026-10-10 11:45 | Integration tests 404 against tenant (REST API not yet published) — expected Red |
| Green | 2026-10-10 12:04 | App published; full suite 16/16 live |
| Refactor | 2026-10-10 12:04 | List test tolerant of ODC omit-empty response shape; types tightened; typecheck clean |

### Live verification run
```
RUN TIMESTAMP (UTC): 2026-10-10T01:11:21Z
BASE_URL: https://<your-tenant>-dev.outsystems.app/EmployeeCatalogMCP3/rest/EmployeeAPI
========================================
 ✓ tests/client.test.ts  (7 offline unit tests)
 ✓ tests/create-employee.test.ts  (6 Use Case #1 tests, live)
 ✓ tests/employees.test.ts  (3 GET integration tests, live)

 Test Files  3 passed (3)
      Tests  16 passed (16)
   Duration  ~5s
```

### Use Case #1 scenario results (live)
| Scenario | Expectation | Result |
|---|---|---|
| S1 — Happy path | 201 + generated Id (>0) + echoed FirstName/LastName/Department/Email | PASS |
| S1 — 201 body is clean | Errors and StatusCode omitted on 201 | PASS |
| S1 — No JobTitle | 201 (JobTitle optional) | PASS |
| S2 — Duplicate email | 409 with `{ Errors: ["...already exists"], StatusCode: 409 }` | PASS |
| S3 — Missing Email | 400 with `{ Errors: [...], StatusCode: 400 }` naming the field | PASS |
| S4 — Empty body | 400 ODC framework shape `{ errors: { ValidationErrors: [...] } }` | PASS |

### Notes / observations
- Immediately after publish the REST API briefly returned 404 (module warm-up). It became
  responsive within ~1 minute; the live suite then passed.
- `GET /employees` on an empty table returns `{}` rather than `{ Employees: [], TotalCount: 0 }`
  because ODC omits unassigned/empty output fields. The list test normalises this
  (treats missing `Employees` as `[]`, missing `TotalCount` as `0`).

---
