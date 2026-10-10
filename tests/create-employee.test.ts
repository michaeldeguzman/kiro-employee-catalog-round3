import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { OutSystemsClient } from "../src/client.js";

/**
 * Use Case #1 — Create Employee Record (POST /employees)
 *
 * Scenarios (GWT):
 *  S1 — Happy path: a valid payload returns 201 with a generated Id and echoed fields.
 *  S2 — Duplicate email: creating twice with the same email returns 409.
 *  S3 — Missing required field (Email omitted): returns 400 with { Errors, StatusCode }.
 *  S4 — Empty request body: returns 400 with the ODC framework validation shape.
 *
 * Live vs. mock:
 *  When OUTSYSTEMS_BASE_URL is set, these tests hit the live EmployeeCatalogMCP3
 *  REST API. When unset, a stubbed fetch returns the contracted shapes so the
 *  suite still passes offline in CI.
 */

const BASE_URL = process.env.OUTSYSTEMS_BASE_URL;
const LIVE = Boolean(BASE_URL);

/** The six-field employee body returned on a 201. */
interface EmployeeResponse {
  Id: number;
  FirstName: string;
  LastName: string;
  Email: string;
  Department: string;
  JobTitle?: string;
}

/** The custom error body shape returned on 400 (validation) / 409. */
interface ErrorResponse {
  Errors?: string[];
  StatusCode?: number;
}

/** The ODC framework error shape returned on an empty/malformed body. */
interface FrameworkErrorResponse {
  errors?: { ValidationErrors?: string[] };
}

interface CreateEmployeeInput {
  FirstName: string;
  LastName: string;
  Email: string;
  Department: string;
  JobTitle?: string;
}

/** Unique-per-run email so re-runs against the live tenant never collide. */
function uniqueEmail(tag: string): string {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return `uc1.${tag}.${stamp}@example.com`;
}

/**
 * Returns a client wired to the live tenant, or — offline — a client backed by
 * a fetch mock that emulates the POST /employees contract. The mock tracks
 * created emails so the duplicate-email scenario behaves like the real API.
 */
function makeClient(): OutSystemsClient {
  if (LIVE) {
    return new OutSystemsClient(BASE_URL);
  }

  const seenEmails = new Set<string>();
  let nextId = 1;

  const fetchMock = vi.fn(
    async (_url: string | URL, init?: RequestInit): Promise<Response> => {
      const jsonHeaders = { "content-type": "application/json" };

      // S4 — empty / missing body: ODC framework rejects before the flow runs.
      if (init?.body === undefined || init.body === null) {
        return new Response(
          JSON.stringify({
            errors: { ValidationErrors: ["The request body is missing."] },
          }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const payload = JSON.parse(init.body as string) as Partial<CreateEmployeeInput>;

      // S3 — missing required fields: collect messages, join by \r\n, 400.
      const missing: string[] = [];
      if (!payload.FirstName) missing.push("First Name is required.");
      if (!payload.LastName) missing.push("Last Name is required.");
      if (!payload.Email) missing.push("Email is required.");
      if (!payload.Department) missing.push("Department is required.");
      if (missing.length > 0) {
        return new Response(
          JSON.stringify({ Errors: [missing.join("\r\n")], StatusCode: 400 }),
          { status: 400, headers: jsonHeaders }
        );
      }

      // S2 — duplicate email: 409.
      if (seenEmails.has(payload.Email!)) {
        return new Response(
          JSON.stringify({
            Errors: [
              `An employee with email '${payload.Email}' already exists.`,
            ],
            StatusCode: 409,
          }),
          { status: 409, headers: jsonHeaders }
        );
      }

      // S1 — happy path: 201 with generated Id and echoed fields only.
      seenEmails.add(payload.Email!);
      return new Response(
        JSON.stringify({
          Id: nextId++,
          FirstName: payload.FirstName,
          LastName: payload.LastName,
          Email: payload.Email,
          Department: payload.Department,
          JobTitle: payload.JobTitle ?? "",
        }),
        { status: 201, headers: jsonHeaders }
      );
    }
  );

  vi.stubGlobal("fetch", fetchMock);
  return new OutSystemsClient("https://mock.local/EmployeeCatalogMCP3/rest/EmployeeAPI");
}

describe("POST /employees — Create Employee (Use Case #1)", () => {
  let client: OutSystemsClient;

  beforeAll(() => {
    client = makeClient();
  });

  afterEach(() => {
    // Only unstub in offline mode; the live client holds no global stub.
    if (!LIVE) vi.unstubAllGlobals();
  });

  // S1 — Happy path
  it("given a valid payload when POST /employees then status is 201 with a generated Id and echoed fields", async () => {
    const input: CreateEmployeeInput = {
      FirstName: "Ada",
      LastName: "Lovelace",
      Email: uniqueEmail("happy"),
      Department: "Engineering",
      JobTitle: "Engineer",
    };

    const res = await client.post<EmployeeResponse>("/employees", input);

    expect(res.status).toBe(201);
    expect(typeof res.data.Id).toBe("number");
    expect(res.data.Id).toBeGreaterThan(0);
    expect(res.data.FirstName).toBe(input.FirstName);
    expect(res.data.LastName).toBe(input.LastName);
    expect(res.data.Email).toBe(input.Email);
    expect(res.data.Department).toBe(input.Department);
  });

  it("given a valid payload when POST /employees then the 201 body omits Errors and StatusCode", async () => {
    const input: CreateEmployeeInput = {
      FirstName: "Grace",
      LastName: "Hopper",
      Email: uniqueEmail("clean"),
      Department: "Engineering",
      JobTitle: "Rear Admiral",
    };

    const res = await client.post<EmployeeResponse & ErrorResponse>(
      "/employees",
      input
    );

    expect(res.status).toBe(201);
    expect(res.data.Errors).toBeUndefined();
    expect(res.data.StatusCode).toBeUndefined();
  });

  it("given a valid payload with no JobTitle when POST /employees then status is still 201", async () => {
    const input: CreateEmployeeInput = {
      FirstName: "Katherine",
      LastName: "Johnson",
      Email: uniqueEmail("nojob"),
      Department: "Mathematics",
    };

    const res = await client.post<EmployeeResponse>("/employees", input);

    expect(res.status).toBe(201);
    expect(res.data.Id).toBeGreaterThan(0);
  });

  // S2 — Duplicate email rejected
  it("given an email already used when POST /employees again then status is 409 referencing the duplicate", async () => {
    const email = uniqueEmail("dup");
    const first: CreateEmployeeInput = {
      FirstName: "Alan",
      LastName: "Turing",
      Email: email,
      Department: "Engineering",
    };

    const firstRes = await client.post<EmployeeResponse>("/employees", first);
    expect(firstRes.status).toBe(201);

    const dupRes = await client.post<ErrorResponse>("/employees", {
      ...first,
      FirstName: "Alan2",
    });

    expect(dupRes.status).toBe(409);
    expect(dupRes.data.StatusCode).toBe(409);
    expect(dupRes.data.Errors?.[0]).toContain(email);
    expect(dupRes.data.Errors?.[0]).toMatch(/already exists/i);
  });

  // S3 — Missing required field
  it("given a payload omitting Email when POST /employees then status is 400 naming the missing field", async () => {
    const res = await client.post<ErrorResponse>("/employees", {
      FirstName: "No",
      LastName: "Email",
      Department: "Engineering",
    });

    expect(res.status).toBe(400);
    expect(res.data.StatusCode).toBe(400);
    expect(Array.isArray(res.data.Errors)).toBe(true);
    expect(res.data.Errors?.[0]).toMatch(/email is required/i);
  });

  // S4 — Empty request body
  it("given no request body when POST /employees then status is 400 with the framework validation shape", async () => {
    const res = await client.post<FrameworkErrorResponse>(
      "/employees",
      undefined
    );

    expect(res.status).toBe(400);
    expect(res.data.errors?.ValidationErrors).toBeDefined();
    expect(Array.isArray(res.data.errors?.ValidationErrors)).toBe(true);
  });
});
