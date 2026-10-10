/**
 * Vitest global setup.
 *
 * Loads environment variables from `.env` into `process.env` before any test
 * suite runs. When OUTSYSTEMS_BASE_URL is set, integration tests hit the live
 * OutSystems environment; when unset, they fall back to a mocked fetch so the
 * suite still passes in CI.
 */
import "dotenv/config";
