# Project Structure

```
outsystems-employee-catalog/
├── src/
│   └── client.ts          # OutSystemsClient — reusable fetch wrapper
├── tests/
│   ├── setup.ts           # Loads .env via dotenv before each suite
│   ├── client.test.ts     # Offline unit tests for OutSystemsClient
│   └── employees.test.ts  # Integration tests for Employee endpoints
├── .env.example           # Environment variable template (commit this)
├── .env                   # Local secrets (gitignored, never commit)
├── vitest.config.ts       # Vitest configuration
├── tsconfig.json          # TypeScript configuration
└── package.json
```

## Conventions

### `src/`
Contains reusable, non-test code. Currently only `client.ts`.

- `OutSystemsClient` — thin class wrapping the native `fetch` API. Handles base URL normalisation, default headers (`Content-Type`, `Accept`, optional `X-API-Key`), query param building, and JSON/text response parsing.
- `getClient()` — lazy singleton factory pre-configured from environment variables.
- All methods return `Promise<ApiResponse<T>>` with `{ status, ok, data, headers }`.

### `tests/`
One file per feature/endpoint group. Follow the existing pattern:

1. Define TypeScript interfaces for the response shape.
2. Use `makeClient()` pattern — real client when `OUTSYSTEMS_BASE_URL` is set, mocked fetch otherwise.
3. Group with `describe` / `it` blocks mirroring the HTTP method and path (e.g. `describe("GET /employees")`).
4. Import from `../src/client.js` (`.js` extension required by NodeNext resolution).

### Import Paths
Always use `.js` extensions for local imports due to `NodeNext` module resolution:
```ts
import { OutSystemsClient } from "../src/client.js";
```

### Mocking
Use `vi.stubGlobal("fetch", vi.fn())` to mock HTTP calls in offline tests. Always call `vi.unstubAllGlobals()` in `afterEach` to avoid leaking mocks between tests.
