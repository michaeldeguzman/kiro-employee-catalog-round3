import { afterEach, describe, expect, it, vi } from "vitest";
import { OutSystemsClient } from "../src/client.js";

/**
 * Offline unit tests for OutSystemsClient. These never hit the network — they
 * stub the global fetch and assert on how the client builds requests and parses
 * responses.
 */
describe("OutSystemsClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("given a base URL with a trailing slash when constructed then it is stripped", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OutSystemsClient("https://example.com/api/");
    await client.get("/employees");

    expect(fetchMock).toHaveBeenCalledOnce();
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe("https://example.com/api/employees");
  });

  it("given a relative path without a leading slash when a request is made then it is normalised", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OutSystemsClient("https://example.com/api");
    await client.get("employees");

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe("https://example.com/api/employees");
  });

  it("given query params when a request is made then they are appended to the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OutSystemsClient("https://example.com/api");
    await client.get("/employees", { params: { page: 2, pageSize: 25 } });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("page=2");
    expect(calledUrl).toContain("pageSize=25");
  });

  it("given an API key when constructed then the X-API-Key header is sent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OutSystemsClient("https://example.com/api", "secret-key");
    await client.get("/employees");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBe("secret-key");
  });

  it("given a JSON response when parsed then data is an object", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ Id: 1, FirstName: "Ada" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OutSystemsClient("https://example.com/api");
    const res = await client.get<{ Id: number; FirstName: string }>(
      "/employees/1"
    );

    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.data.Id).toBe(1);
    expect(res.data.FirstName).toBe("Ada");
  });

  it("given a problem+json error response when parsed then data is still JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: { ValidationErrors: ["x"] } }), {
        status: 400,
        headers: { "content-type": "application/problem+json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OutSystemsClient("https://example.com/api");
    const res = await client.get<{ errors: { ValidationErrors: string[] } }>(
      "/employees"
    );

    expect(res.status).toBe(400);
    expect(res.ok).toBe(false);
    expect(res.data.errors.ValidationErrors).toEqual(["x"]);
  });

  it("given no base URL anywhere when constructed then it throws", () => {
    const original = process.env.OUTSYSTEMS_BASE_URL;
    delete process.env.OUTSYSTEMS_BASE_URL;
    try {
      expect(() => new OutSystemsClient()).toThrow(/base URL is required/);
    } finally {
      if (original !== undefined) process.env.OUTSYSTEMS_BASE_URL = original;
    }
  });
});
