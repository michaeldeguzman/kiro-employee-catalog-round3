# Project Context
- **Application**: Employee Catalog Service
- **Platform**: OutSystems (ODC / O11)
- **Harness / Test Tool**: Vitest (or BDDFramework via API triggers)
- **Test Command**: `npm test`
- **Architecture**: Service Actions / REST Endpoints over Core Entities

---

# Use Case Catalog

## Use Case #1: Create Employee Record
**Description**:
An HR user wants to create an employee record with FirstName, LastName, Department, and Email. The system must generate a unique identifier and reject any duplicate email addresses.

**Status**: Completed
**Current Phase**: Refactor (completed)
**Last Phase Completed**: Refactor
**Last Updated**: 2026-10-10 12:04
**Test Count**: 6 tests (Scenario 1 has 3 tests)
**Test File**: `tests/create-employee.test.ts`
**Last Live Run**: 2026-10-10, against EmployeeCatalogMCP3 (revision 1) on the ODC Development tenant. All 6 Use Case #1 tests passed: S1 (3 tests) 201 + generated Id + echoed fields; S2 duplicate email -> 409 with { Errors, StatusCode } body; S3 missing Email -> 400 with Errors array; S4 empty body -> 400 ODC built-in validation shape. Full suite 16/16: 9 hit the live API, 7 are offline unit tests.

> Note: Move to Green only after a live run passes against EmployeeCatalogMCP3. A mock run (OUTSYSTEMS_BASE_URL unset) is not sufficient to claim Green on its own, because it exercises stubbed fetch, not the tenant.

> Uniqueness coverage: S2 (duplicate email -> 409) exercises the application-layer check in `Employee_Validate` only; it passes regardless of whether the DB index exists. The DB-level `IdxEmail_Unique` index (BRD Rule 4 hard safety net) cannot be confirmed via the MCP inspection tools (the ODC Context Service does not expose entity indexes). It is instead verified behaviorally by `tests/unique-email-index.test.ts` (live-only), a concurrent-create probe asserting at most one row persists for a given email. Verified on revision 2: statuses [201,400], persistedRows=1.

### Scenarios (GWT)

**Scenario 1 — Happy path: create a valid employee**
```gherkin
Given a valid payload with FirstName, LastName, Department, and an Email that is unique to this test run
When POST /employees is called
Then the response status is 201
And the response body contains the generated Id (Long Integer, > 0)
And the response body echoes back FirstName, LastName, Department, and Email
```

**Scenario 2 — Duplicate email rejected**
```gherkin
Given an employee has just been created with a unique email for this test run
When POST /employees is called again with the same email
Then the response status is 409
And the response body contains an error message referencing the duplicate email
```

**Scenario 3 — Missing required field (e.g. Email omitted)**
```gherkin
Given a payload that omits the Email field
When POST /employees is called
Then the response status is 400
And the response body contains { "Errors": [...], "StatusCode": 400 } with an Errors entry naming the missing field
```

**Scenario 4 — Empty request body**
```gherkin
Given a request with no body
When POST /employees is called
Then the response status is 400
And the response body contains { "errors": { "ValidationErrors": ["The request body is missing."] } }
Note: this body is produced by the ODC framework before the action flow runs, so it differs from the Errors/StatusCode shape used by Scenario 3.
```

---

## Use Case #2: Filter Active Employees by Department
**Description**:
Retrieve all active employees belonging to a specific department, ignoring inactive staff.

**Status**: Completed
**Current Phase**: Refactor (completed)
**Last Phase Completed**: Refactor
**Last Updated**: 2026-10-10 12:21
**Test Count**: 4 tests
**Test File**: `tests/filter-by-department.test.ts`
**Endpoint**: `GET /employees?Department={name}` (BRD §6.2 — ListEmployees).
**Defect found & fixed**: The Red run exposed that `ListEmployees` ignored the `Department` query filter (a dead IfNode routed around the aggregate, so every call returned the full active set). Fixed via Mentor by adding the conditional filter `Department = "" or Employee.Department = Department` to both the `GetEmployees` and `CountEmployees` aggregates and removing the dead node. Republished as revision 2 (outcome success).
**Last Live Run**: 2026-10-10, against EmployeeCatalogMCP3 (revision 2) on the ODC Development tenant. All 4 Use Case #2 tests passed. Full suite 21/21: 14 hit the live API, 7 are offline unit tests (includes the live-only `unique-email-index` probe added in the IdxEmail_Unique follow-up).

### Scenarios (GWT)

**Scenario 1 — Filter returns only the requested department**
```gherkin
Given several active employees exist across at least two departments, seeded in this test run
When GET /employees?Department=<the unique department for this run> is called
Then the response status is 200
And every returned employee has Department equal to the requested department
And TotalCount matches the number of active employees in that department
```

**Scenario 2 — Inactive (soft-deleted) employees are excluded**
```gherkin
Given an active employee and a soft-deleted employee both exist in the same department
When GET /employees?Department=<that department> is called
Then the response status is 200
And the soft-deleted employee's Id is not present in the returned list
```

**Scenario 3 — Department with no active employees**
```gherkin
Given a department name that no active employee belongs to
When GET /employees?Department=<that department> is called
Then the response status is 200
And the result is empty (ODC omits the empty Employees list; treated as [] with TotalCount 0)
```

**Scenario 4 — No filter returns active employees across departments**
```gherkin
Given active employees exist in more than one department
When GET /employees is called with no Department filter
Then the response status is 200
And the returned employees are not restricted to a single department
```