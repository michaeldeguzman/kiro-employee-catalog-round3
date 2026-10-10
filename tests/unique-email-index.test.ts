import { beforeAll, describe, expect, it } from "vitest";
import { OutSystemsClient } from "../src/client.js";

/**
 * Verifies the DATABASE-LEVEL unique index IdxEmail_Unique on Employee.Email
 * (BRD Rule 4: the index is the "hard safety net" that backs the application-layer
 * duplicate check in Employee_Validate).
 *
 * Why a concurrency probe:
 *   The ordinary duplicate test (create, then create again) is caught by
 *   Employee_Validate's aggregate and returns a clean 409 — that passes whether or
 *   not the DB index exists, so it does NOT prove the index. To isolate the index,
 *   we fire two POSTs with the SAME brand-new email at the same time. Both requests
 *   run Employee_Validate before either has committed, so both pass validation and
 *   race to INSERT. With the unique index present, the database rejects the second
 *   insert — exactly one request should end up creating a row.
 *
 * Interpreting the result:
 *   - Exactly one 201 (the other 409 or 500): index enforced the constraint. PASS.
 *   - Two 201s but only ONE row survives a follow-up lookup by email: still a single
 *     persisted record — constraint effectively held. PASS (with note).
 *   - Two 201s AND two distinct persisted ids for the same email: the index is NOT
 *     enforcing uniqueness. FAIL — this is the real defect this test exists to catch.
 *
 * This test is live-only. A mocked fetch cannot prove a real DB constraint, so when
 * OUTSYSTEMS_BASE_URL is unset the test is skipped rather than faked green.
 */

const BASE_URL = process.env.OUTSYSTEMS_BASE_URL;
const LIVE = Boolean(BASE_URL);

interface EmployeeResponse {
  Id?: number;
  Email?: string;
  Errors?: string[];
  StatusCode?: number;
}

interface ListResponse {
  Employees?: { Id: number; Email: string }[];
  TotalCount?: number;
}

const run = LIVE ? describe : describe.skip;

run("Employee.Email — DB-level unique index IdxEmail_Unique (live-only)", () => {
  let client: OutSystemsClient;
  const email = `uc1.index.${Date.now()}-${Math.floor(
    Math.random() * 1e6
  )}@example.com`;

  beforeAll(() => {
    client = new OutSystemsClient(BASE_URL);
  });

  it("given two concurrent creates with the same new email then at most one row persists", async () => {
    const payload = (tag: string) => ({
      FirstName: "Race",
      LastName: tag,
      Email: email,
      Department: "Engineering",
    });

    // Fire both at once so they both clear Employee_Validate before either commits.
    const [a, b] = await Promise.all([
      client.post<EmployeeResponse>("/employees", payload("A")),
      client.post<EmployeeResponse>("/employees", payload("B")),
    ]);

    const statuses = [a.status, b.status].sort();
    const created = [a, b].filter((r) => r.status === 201);

    // Primary assertion: the two concurrent inserts must NOT both succeed as
    // independent rows. Acceptable outcomes are one 201 + one rejection (409/500),
    // or — if ODC let both responses return 201 — a single surviving row below.
    expect(created.length).toBeLessThanOrEqual(1);

    // Secondary, authoritative check: look the email up and assert at most one
    // active row exists for it. This is what proves the constraint actually held
    // at the database, independent of the HTTP status codes.
    //
    // (Filter by a department large enough to page in our row; use PageSize to be safe.)
    const list = await client.get<ListResponse>("/employees", {
      params: { PageSize: 200, Department: "Engineering" },
    });
    const matches =
      (list.data.Employees ?? []).filter((e) => e.Email === email) ?? [];

    expect(matches.length).toBeLessThanOrEqual(1);

    // Informational: record what actually happened for the run log.
    console.log(
      `[unique-index] email=${email} statuses=${JSON.stringify(
        statuses
      )} created201=${created.length} persistedRows=${matches.length}`
    );
  });
});
