/**
 * OutSystems REST client
 *
 * A thin wrapper around the native fetch API for calling OutSystems
 * REST endpoints. Configure the base URL and optional API key via
 * environment variables (see .env.example).
 */

export interface RequestOptions {
  /** Additional headers merged on top of the defaults. */
  headers?: Record<string, string>;
  /** Query-string parameters appended to the URL. */
  params?: Record<string, string | number | boolean>;
  /** Request body (will be JSON-serialised). */
  body?: unknown;
}

export interface ApiResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
  headers: Record<string, string>;
}

export class OutSystemsClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(baseUrl?: string, apiKey?: string) {
    const resolvedBase = baseUrl ?? process.env.OUTSYSTEMS_BASE_URL ?? "";

    if (!resolvedBase) {
      throw new Error(
        "OutSystemsClient: base URL is required. " +
          "Pass it to the constructor or set OUTSYSTEMS_BASE_URL."
      );
    }

    // Normalise: strip trailing slash so callers can always use "/path"
    this.baseUrl = resolvedBase.replace(/\/$/, "");

    const resolvedKey = apiKey ?? process.env.OUTSYSTEMS_API_KEY ?? "";

    this.defaultHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(resolvedKey ? { "X-API-Key": resolvedKey } : {}),
    };
  }

  // ─── Low-level request ──────────────────────────────────────────────────

  async request<T = unknown>(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, options.params);

    const response = await fetch(url, {
      method,
      headers: { ...this.defaultHeaders, ...options.headers },
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    // Attempt JSON parse; fall back to raw text so tests can still assert.
    // Match both "application/json" and structured-suffix JSON types such as
    // "application/problem+json" (RFC 7807), which ODC uses for its built-in
    // validation error responses.
    let data: T;
    const contentType = response.headers.get("content-type") ?? "";
    const isJson =
      contentType.includes("application/json") || contentType.includes("+json");
    if (isJson) {
      data = (await response.json()) as T;
    } else {
      data = (await response.text()) as unknown as T;
    }

    // Flatten headers to a plain object for easy assertion in tests
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return { status: response.status, ok: response.ok, data, headers };
  }

  // ─── Convenience methods ────────────────────────────────────────────────

  get<T = unknown>(path: string, options?: RequestOptions) {
    return this.request<T>("GET", path, options);
  }

  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>("POST", path, { ...options, body });
  }

  put<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>("PUT", path, { ...options, body });
  }

  patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>("PATCH", path, { ...options, body });
  }

  delete<T = unknown>(path: string, options?: RequestOptions) {
    return this.request<T>("DELETE", path, options);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean>
  ): string {
    // Join base + path explicitly. We avoid `new URL(path, base)` because an
    // absolute path (leading "/") resolves against the origin only and would
    // discard any path segments in baseUrl (e.g. "/EmployeeCatalogMCP3/rest/EmployeeAPI").
    // baseUrl already has its trailing slash stripped in the constructor.
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(this.baseUrl + normalizedPath);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }
}

/**
 * Returns a singleton client pre-configured from environment variables.
 * The instance is created lazily on first access so importing this module
 * never throws when OUTSYSTEMS_BASE_URL is not set.
 */
let _client: OutSystemsClient | undefined;
export function getClient(): OutSystemsClient {
  if (!_client) {
    _client = new OutSystemsClient();
  }
  return _client;
}
