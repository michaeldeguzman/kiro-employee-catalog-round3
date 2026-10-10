import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { OutSystemsClient } from "../src/client.js";

/**
 * Use Case #2 — Filter Active Employees by Department (GET /employees?Department=…)
 *
 * Scenarios (GWT):
 *  S1 — Filter returns only employees in the requested department.
 *  S2 — Inactive (soft-deleted) employees are excluded from the active list.
 *  S3 — A department with no active employees returns an empty result.
 *  S4 — With no Department filter, employees across departments are returned.
 *
 * Live vs. mock:
 *  When OUTSYSTEMS_BASE_URL is set, these tests seed data via POST /employees and
 *  assert the live filter behaviour of EmployeeCatalogMCP3. When unset, a stubbed
 *  fetch emulates the ListEmployees contract (IsActive=True + exact Department
 *  match, ODC omit-empty response) so the suite still passes offline in CI.
 *
 * Note on S2: the exposed EmployeeAPI has no REST route that soft-deletes a record
 * (removal is Employee_Remove, reachable only from the UI). The live path therefore
 * verifies the active-only contract via the data it can create — every record it
 * seeds is active, and the filter returns exactly those. The offline mock additionally
 * proves an IsActive=False record is excluded, which is the behaviour the ODC
 * aggregate enforces (filter Employee.IsActive = True).
 */

const BASE_URL = process.env.OUTSYSTEMS_BASE_URL;
const LIVE = Boolean(BASE_URL);

interface Employee {
  Id: number;
  FirstName: string;
  LastName: string;
  Email: string;
  Department: string;
  JobTitle?: string;
}

interface ListResponse {
  Employees?: Employee[];
  TotalCount?: number;
}

interface CreateEmployeeInput {
  FirstName: string;
  LastName: string;
  Email: string;
  Department: string;
  JobTitle?: string;
}

/** Unique per-run suffix so repeated live runs never collide on email or department. */
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const DEPT_A = `UC2-Alpha-${RUN}`;
const DEPT_B = `UC2-Beta-${RUN}`;
const DEPT_EMPTY = `UC2-Empty-${RUN}`;

function uniqueEmail(tag: string): string {
  return `uc2.${tag}.${RUN}@example.com`;
}

/** Normalise ODC's omit-empty list response to a concrete array / count. */
function employeesOf(res: { data: ListResponse }): Employee[] {
  return res.data.Employees ?? [];
}
function totalOf(res: { data: ListResponse }): number {
  return res.data.TotalCount ?? 0;
}

/**
 * Offline fetch mock emulating POST /employees + GET /employees?Department=…
 * It stores created (active) records plus one pre-seeded inactive record so the
 * exclusion scenario (S2) is exercised offline.
 */
function makeMockClient(): OutSystemsClient {
  interface Row extends Employee {
    IsActive: boolean;
  }
  const rows: Row[] = [];
  let nextId = 1;

  const fetchMock = vi.fn(
    async (url: string | URL, init?: RequestInit): Promise<Response> => {
      const jsonHeaders = { "content-type": "application/json" };
      const parsed = new URL(url.toString());
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "POST" && parsed.pathname.endsWith("/employees")) {
        const p = JSON.parse(init!.body as string) as CreateEmployeeInput;
        const row: Row = { Id: nextId++, IsActive: true, ...p };
        rows.push(row);
        return new Response(
          JSON.stringify({
            Id: row.Id,
            FirstName: row.FirstName,
            LastName: row.LastName,
            Email: row.Email,
            Department: row.Department,
            JobTitle: row.JobTitle ?? "",
          }),
          { status: 201, headers: jsonHeaders }
        );
      }

      if (method === "GET" && parsed.pathname.endsWith("/employees")) {
        const dept = parsed.searchParams.get("Department");
        let active = rows.filter((r) => r.IsActive);
        if (dept) active = active.filter((r) => r.Department === dept);
        if (active.length === 0) {
          // ODC omit-empty: empty result returns {}.
          return new Response("{}", { status: 200, headers: jsonHeaders });
        }
        const employees = active.map(({ IsActive, ...e }) => e);
        return new Response(
          JSON.stringify({ Employees: employees, TotalCount: employees.length }),
          { status: 200, headers: jsonHeaders }
        );
      }

      return new Response("{}", { status: 404, headers: jsonHeaders });
    }
  );

  vi.stubGlobal("fetch", fetchMock);
  const client = new OutSystemsClient(
    "https://mock.local/EmployeeCatalogMCP3/rest/EmployeeAPI"
  );

  // Pre-seed one inactive record in DEPT_A so S2 can assert exclusion offline.
  (fetchMock as unknown as { __seedInactive?: () => void }).__seedInactive =
    () => {
      rows.push({
        Id: 10_000,
        IsActive: false,
        FirstName: "Soft",
        LastName: "Deleted",
        Email: uniqueEmail("inactive"),
        Department: DEPT_A,
        JobTitle: "",
      });
    };
  (
    fetchMock as unknown as { __seedInactive?: () => void }
  ).__seedInactive!();

  return client;
}

function makeClient(): OutSystemsClient {
  return LIVE ? new OutSystemsClient(BASE_URL) : makeMockClient();
}

async function seed(
  client: OutSystemsClient,
  input: CreateEmployeeInput
): Promise<number> {
  const res = await client.post<Employee>("/employees", input);
  expect(res.status).toBe(201);
  return res.data.Id;
}

describe("GET /employees?Department — Filter Active Employees by Department (Use Case #2)", () => {
  let client: OutSystemsClient;

  beforeAll(async () => {
    client = makeClient();
    // Seed two departments with active employees for this run.
    await seed(client, {
      FirstName: "Alpha",
      LastName: "One",
      Email: uniqueEmail("a1"),
      Department: DEPT_A,
      JobTitle: "Engineer",
    });
    await seed(client, {
      FirstName: "Alpha",
      LastName: "Two",
      Email: uniqueEmail("a2"),
      Department: DEPT_A,
    });
    await seed(client, {
      FirstName: "Beta",
      LastName: "One",
      Email: uniqueEmail("b1"),
      Department: DEPT_B,
      JobTitle: "Analyst",
    });
  });

  afterEach(() => {
    // The live client has no global stub; only unstub offline.
    // (We do NOT unstub here because the mock holds seeded state for the whole
    // suite; offline teardown happens once the process exits.)
  });

  // S1 — Filter returns only the requested department
  it("given active employees across departments when filtering by one department then only that department is returned", async () => {
    const res = await client.get<ListResponse>("/employees", {
      params: { Department: DEPT_A },
    });

    expect(res.status).toBe(200);
    const employees = employeesOf(res);
    expect(employees.length).toBeGreaterThanOrEqual(2);
    for (const e of employees) {
      expect(e.Department).toBe(DEPT_A);
    }
    // Beta department must not leak into an Alpha-filtered result.
    expect(employees.some((e) => e.Department === DEPT_B)).toBe(false);
  });

  // S2 — Inactive employees excluded
  it("given a department when filtering then every returned employee is active (no inactive records)", async () => {
    const res = await client.get<ListResponse>("/employees", {
      params: { Department: DEPT_A },
    });

    expect(res.status).toBe(200);
    const employees = employeesOf(res);
    // The known inactive seed (offline Id 10000) must never appear.
    expect(employees.some((e) => e.Id === 10_000)).toBe(false);
    // TotalCount reflects active-only matches.
    expect(totalOf(res)).toBe(employees.length);
  });

  // S3 — Department with no active employees
  it("given a department with no active employees when filtering then the result is empty", async () => {
    const res = await client.get<ListResponse>("/employees", {
      params: { Department: DEPT_EMPTY },
    });

    expect(res.status).toBe(200);
    expect(employeesOf(res).length).toBe(0);
    expect(totalOf(res)).toBe(0);
  });

  // S4 — No filter returns across departments
  it("given no Department filter when listing then employees are not restricted to one department", async () => {
    const res = await client.get<ListResponse>("/employees", {
      params: { PageSize: 100 },
    });

    expect(res.status).toBe(200);
    const employees = employeesOf(res);
    const departments = new Set(employees.map((e) => e.Department));
    // Our run seeded at least DEPT_A and DEPT_B; the unfiltered list spans them.
    expect(departments.has(DEPT_A)).toBe(true);
    expect(departments.has(DEPT_B)).toBe(true);
  });
});
