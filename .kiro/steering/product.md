# Product

This project is a TypeScript test suite for validating the **OutSystems Employee Catalog REST API**. It is not an application — it exists solely to verify that the OutSystems backend endpoints behave correctly.

## Purpose

- Provide integration tests that run against a live OutSystems environment
- Provide offline unit tests (using mocked fetch) so the suite passes in CI without a live backend
- Serve as a reference for how to interact with the Employee Catalog API

## Domain

The API manages employee records with the following core fields:

| Field | Type | Notes |
|---|---|---|
| `Id` | number | Unique identifier |
| `Name` | string | Full name |
| `Email` | string | Work email |
| `Department` | string | Department name |
| `JobTitle` | string | Role/position |

## Endpoints Under Test

- `GET /employees` — list employees, supports `page` / `pageSize` query params
- `GET /employees/:id` — fetch a single employee
- `POST /employees` — create a new employee (returns 201)
