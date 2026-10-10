# Tech Stack

## Language & Runtime

- **TypeScript 5.6+** targeting ES2022, compiled with `NodeNext` module resolution
- **Node.js** (ESM — `"type": "module"` in package.json)

## Test Framework

- **Vitest 5.x** — test runner, assertions, and mocking
  - `globals: true` — `describe`, `it`, `expect`, `vi` are available without imports (though explicit imports are preferred in practice)
  - `environment: node` — no DOM
  - `testTimeout: 15000ms` — accounts for slow REST calls
  - Setup file: `tests/setup.ts` loads `.env` before each suite via `dotenv`

## Key Libraries

| Package | Purpose |
|---|---|
| `vitest` | Test runner + assertions |
| `@vitest/coverage-v8` | Code coverage via V8 |
| `@vitest/ui` | Browser-based test UI |
| `dotenv` | Load `.env` into `process.env` |
| `typescript` | Compiler / type-checking |

## Environment Configuration

Copy `.env.example` to `.env` and set:

```
OUTSYSTEMS_BASE_URL=https://your-org.outsystemscloud.com/EmployeeCatalog/rest/EmployeeAPI
OUTSYSTEMS_API_KEY=         # optional, sent as X-API-Key header
```

When `OUTSYSTEMS_BASE_URL` is unset, integration tests fall back to a mocked fetch so they still pass in CI.

## Common Commands

```bash
npm test                 # Run all tests once (CI-safe)
npm run test:watch       # Re-run on file changes
npm run test:ui          # Open Vitest browser UI
npm run test:coverage    # Run tests + generate coverage report
npm run typecheck        # Type-check without running tests
```

## TypeScript Config Highlights

- `strict: true`
- `module: NodeNext` / `moduleResolution: NodeNext` — imports **must** use `.js` extensions even for `.ts` source files
- `target: ES2022`
- `types: ["node", "vitest/globals"]`
