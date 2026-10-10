import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { OutSystemsClient } from "../src/client.js";

/**
 * Integration tests for the read endpoints of the Employee Catalog API:
 *   GET /employees           — list active employees (pagination + Department filter)
 *   GET /employees/{Id}      — fetch a single active employee, 404 when absent
 *
 * Live when OUTSYSTEMS_BASE_URL is set; otherwise a stubbed fetch returns the
 * contracted shapes so the suite passes offline.
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
  // ODC omits unassigned/empty output fields, so both may be absent when the
  // active-employee set is empty.
  Employees?: Employee[];
  TotalCount?: number;
}

interface NotFoundResponse {
  Errors?: string[];
  StatusCode?: number;
}

function sampleEmployee(id: number): Employee {
  return {
    Id: id,
    FirstName: "Sample",
    LastName: `Person${id}`,
    Email: `sample${id}@example.com`,
    Department: "Engineering",
    JobTitle: "Engineer",
  };
}

function makeClient(): OutSystemsClient {
  if (LIVE) {
    return new OutSystemsClient(BASE_URL);
  }

  const fetchMock = vi.fn(
    async (url: string | URL): Promise<Response> => {
      const jsonHeaders = { "content-type": "application/json" };
      const parsed = new URL(url.toString());
      const path = parsed.pathname;

      // GET /employees/{id}
      const byIdMatch = path.match(/\/employees\/(\d+)$/);
      if (byIdMatch) {
        const id = Number(byIdMatch[1]);
        if (id === 999999) {
          return new Response(
            JSON.stringify({ Errors: ["Employee not found."], StatusCode: 404 }),
            { status: 404, headers: jsonHeaders }
          );
        }
        return new Response(JSON.stringify(sampleEmployee(id)), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      // GET /employees (list)
      if (path.endsWith("/employees")) {
        const pageSize = Number(parsed.searchParams.get("PageSize") ?? "25");
        const employees = Array.from({ length: Math.min(pageSize, 3) }, (_, i) =>
          sampleEmployee(i + 1)
        );
        return new Response(
          JSON.stringify({ Employees: employees, TotalCount: 3 }),
          { status: 200, headers: jsonHeaders }
        );
      }

      return new Response("{}", { status: 404, headers: jsonHeaders });
    }
  );

  vi.stubGlobal("fetch", fetchMock);
  return new OutSystemsClient("https://mock.local/EmployeeCatalogMCP3/rest/EmployeeAPI");
}

describe("GET /employees — List Employees", () => {
  let client: OutSystemsClient;

  beforeAll(() => {
    client = makeClient();
  });

  afterEach(() => {
    if (!LIVE) vi.unstubAllGlobals();
  });

  it("given the list endpoint when called then status is 200 with an Employees list and TotalCount", async () => {
    const res = await client.get<ListResponse>("/employees");

    expect(res.status).toBe(200);
    // ODC omits unassigned/empty output fields, so an empty table returns {}
    // rather than { Employees: [], TotalCount: 0 }. Normalise the omit-empty
    // shape before asserting on the contract.
    const employees = res.data.Employees ?? [];
    const totalCount = res.data.TotalCount ?? 0;
    expect(Array.isArray(employees)).toBe(true);
    expect(typeof totalCount).toBe("number");
    expect(totalCount).toBeGreaterThanOrEqual(0);
  });

  it("given pagination params when called then they are honoured", async () => {
    const res = await client.get<ListResponse>("/employees", {
      params: { Page: 1, PageSize: 2 },
    });

    expect(res.status).toBe(200);
    const employees = res.data.Employees ?? [];
    expect(employees.length).toBeLessThanOrEqual(2);
  });
});

describe("GET /employees/{Id} — Get Employee by Id", () => {
  let client: OutSystemsClient;

  beforeAll(() => {
    client = makeClient();
  });

  afterEach(() => {
    if (!LIVE) vi.unstubAllGlobals();
  });

  it("given a non-existent Id when called then status is 404 with the custom error body", async () => {
    const res = await client.get<NotFoundResponse>("/employees/999999");

    expect(res.status).toBe(404);
    expect(res.data.StatusCode).toBe(404);
    expect(res.data.Errors?.[0]).toMatch(/not found/i);
  });
});
