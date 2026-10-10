# ODC CRUD Wrapper — DB Results ModelApplication Pattern

When designing, generating BRDs, or scaffolding OutSystems Developer Cloud (ODC) server actions for an entity, strictly adhere to the DB Results ModelApplication pattern derived from `SampleEntity`.

## Core Philosophy
- Every entity gets **4 server actions** placed in an action folder named exactly `{Entity}`:
  1. `{Entity}_Validate`[cite: 1]
  2. `{Entity}_Upsert`[cite: 1]
  3. `{Entity}_GetCanRemove`[cite: 1]
  4. `{Entity}_Remove` (soft-delete)[cite: 1]
- Do **not** create standalone `GetAll` or `GetById` server actions[cite: 1]. Aggregates fetch data directly in screens or APIs[cite: 1].
- Do **not** use hard deletes[cite: 1].
- Never call raw entity actions (`CreateOrUpdate{Entity}`) directly from UI or exposed REST endpoints[cite: 1].

---

## 1. Entity Standard Audit Fields
Every wrapped entity must include these attributes alongside its business fields[cite: 1]:

| Attribute | Type | Mandatory | Default | Notes |
|---|---|---|---|---|
| `Id` | Long Integer | Yes | AutoNumber | Primary key[cite: 1] |
| `IsActive` | Boolean | False | `True` | Soft-delete flag (safe default for populated tables)[cite: 1] |
| `CreatedByUserId` | User Identifier | False | _(none)_ | Audit (FK to User)[cite: 1] |
| `CreatedOn` | DateTime | False | `#1900-01-01 00:00:00#` | Safe default[cite: 1] |
| `UpdatedByUserId` | User Identifier | False | _(none)_ | Audit (FK to User)[cite: 1] |
| `UpdatedOn` | DateTime | False | `#1900-01-01 00:00:00#` | Safe default[cite: 1] |

*Rule:* When adding audit attributes to existing entities, always set `IsMandatory=False` with safe defaults to prevent deploy failure `OS-DPL-50205`[cite: 1].

---

## 2. Required Shared Infrastructure
Before constructing entity actions, verify or specify the existence of these helpers[cite: 1]:

- **Structures[cite: 1]:**
  - `EntityActionResult`: `IsSuccess` (Boolean), `EntityActionMessages` (List of EntityActionMessage), `CombinedEntityMessageText` (Text), `CombinedEntityActionMessageTypeId` (MessageType Identifier)[cite: 1].
  - `EntityActionMessage`: `MessageTypeId` (MessageType Identifier), `MessageText` (Text)[cite: 1].
- **Static Entity[cite: 1]:** `MessageType` (Records: Success = 1, Error = 2, Warning = 3, Info = 4)[cite: 1].
- **Folder `EntityActionResult`[cite: 1]:**
  - `EntityActionResult_BuildFromSuccess(EntityActionResultMessageText: Text)`[cite: 1]
  - `EntityActionResult_BuildFromError(EntityActionResultMessageText: Text)`[cite: 1]
  - `EntityActionResult_CombineEntityActionMessages(EntityActionMessages: EntityActionMessage List)`[cite: 1]
- **Folder `Session`[cite: 1]:**
  - `Session_GetNormalizedSessionUserId()` -> `NormalizedSessionUserId: User Identifier` (**Toggle `Function = True`** so it can be invoked inline in assign nodes)[cite: 1].

---

## 3. The 4 CRUD Server Actions

### Action 1: `{Entity}_Validate`
- **Input:** `Source` (`{Entity}` record, Mandatory)[cite: 1]
- **Output:** `EntityActionResult`[cite: 1]
- **Rules[cite: 1]:**
  - Check mandatory fields and max length constraints[cite: 1].
  - If invalid, append to `EntityActionResult.EntityActionMessages` (`MessageTypeId = Entities.MessageType.Error`)[cite: 1].
  - If list is empty: assign `IsSuccess = True`[cite: 1].
  - If list is NOT empty: call `EntityActionResult_CombineEntityActionMessages`, assign `IsSuccess = False`, and map combined message text & message type[cite: 1].
  - **Do NOT** call `BuildFromError` or `BuildFromSuccess` inside `_Validate`[cite: 1].

### Action 2: `{Entity}_Upsert`
- **Input:** `Source` (`{Entity}` record, Mandatory)[cite: 1]
- **Output:** `EntityActionResult`, `Id` (`{Entity}` Identifier)[cite: 1]
- **Rules[cite: 1]:**
  - Run `{Entity}_Validate(Source)` first; if not success, exit returning that result[cite: 1].
  - Check `Source.Id = NullIdentifier()`[cite: 1]:
    - **Create Path:** 
      - `CreatedOn = CurrDateTime()`[cite: 1]
      - `CreatedByUserId = Session_GetNormalizedSessionUserId()`[cite: 1]
      - `UpdatedOn = Source.CreatedOn` (copy, do NOT invoke `CurrDateTime()` again)[cite: 1]
      - `UpdatedByUserId = Source.CreatedByUserId` (copy)[cite: 1]
      - `IsActive = True`[cite: 1]
      - Call entity action `Create{Entity}(Source)`[cite: 1]
      - Assign `Id = Create{Entity}.Id`[cite: 1]
    - **Update Path:**
      - `UpdatedOn = CurrDateTime()`[cite: 1]
      - `UpdatedByUserId = Session_GetNormalizedSessionUserId()`[cite: 1]
      - Call entity action `Update{Entity}(Source)`[cite: 1]
      - Assign `Id = Source.Id`[cite: 1]
  - Both paths end with `EntityActionResult = EntityActionResult_BuildFromSuccess("{Entity} """ + Source.{NameField} + """ has been saved.")`[cite: 1].
  - **Inline Execution:** `Session_GetNormalizedSessionUserId()` must be called inline in assign nodes, never as a separate flow block[cite: 1].
  - **Exception Handlers:** Must include `DatabaseException` (return generic admin error via `BuildFromError`) and `AllExceptions` (return `ExceptionMessage` via `BuildFromError`)[cite: 1].

### Action 3: `{Entity}_GetCanRemove`
- **Input:** `Id` (`{Entity}` Identifier, Mandatory)[cite: 1]
- **Output:** `EntityActionResult`[cite: 1]
- **Rules[cite: 1]:**
  - Use an **Aggregate** named `GetById` (filter `{Entity}.Id = Id`, `MaxRecords = 1`)[cite: 1].
  - If null/missing: return `BuildFromError("Cannot remove an unsaved {Entity}.")`[cite: 1].
  - If `IsActive = False`: return `BuildFromError("Cannot remove {Entity} """ + Name + """, it is already removed.")`[cite: 1].
  - If `IsActive = True`: return `BuildFromSuccess("")`[cite: 1].
  - Add `DatabaseException` handler that **raises** `ProcessingException`[cite: 1].

### Action 4: `{Entity}_Remove`
- **Input:** `Id` (`{Entity}` Identifier, Mandatory)[cite: 1]
- **Output:** `EntityActionResult`[cite: 1]
- **Rules[cite: 1]:**
  - Call `{Entity}_GetCanRemove(Id)`[cite: 1].
  - If `IsSuccess = False`: **RAISE** `ProcessingException(CombinedEntityMessageText)` (do not return failure result)[cite: 1].
  - Lock row using entity action `GetForUpdate{Entity}(Id)`[cite: 1].
  - Assign on `GetForUpdate{Entity}.Record.{Entity}`: `UpdatedOn = CurrDateTime()`, `UpdatedByUserId = Session_GetNormalizedSessionUserId()`, and `IsActive = False`[cite: 1].
  - Call entity action `Update{Entity}(GetForUpdate{Entity}.Record)`[cite: 1].
  - Return `EntityActionResult = EntityActionResult_BuildFromSuccess("{Entity} """ + Record.{NameField} + """ has been removed.")`[cite: 1].
  - Include both `DatabaseException` and `AllExceptions` handlers calling `BuildFromError`[cite: 1].

---

## 4. Exposed REST API Conventions

When creating, updating, or wiring exposed REST API endpoints via OutSystems MCP:

### Core Rules
- Endpoints must NEVER call built-in entity actions (`Create{Entity}`, `Update{Entity}`, `CreateOrUpdate{Entity}`, `Delete{Entity}`) directly[cite: 1, 5].
- Endpoints must delegate to the corresponding `{Entity}` CRUD wrapper actions or aggregates[cite: 1, 5].
- Endpoints must unpack `EntityActionResult` and map the HTTP response status code accordingly[cite: 1, 5].
- Use `HTTP.Response_SetStatusCode` (or ODC equivalent) to set response codes explicitly.

### Standard REST Endpoint Pattern for `{Entity}`

| HTTP Method | Route | Target Logic | Success Code & Body | Error / Validation Handling |
|---|---|---|---|---|
| `POST` | `/{entities}` | `{Entity}_Upsert`[cite: 1, 5] | **201 Created**<br>Return `{ Id: Id, ... }`[cite: 1, 3] | If `EntityActionResult.IsSuccess = False`:<br>- Set **409 Conflict** if error indicates duplicate/unique constraint.<br>- Set **400 Bad Request** for validation failures.<br>Return `{ message: CombinedEntityMessageText }`[cite: 1, 5]. |
| `GET` | `/{entities}` | Aggregate `Get{Entities}` | **200 OK**<br>Return List of `{Entity}`[cite: 3] | Filter by `{Entity}.IsActive = True` by default[cite: 1, 5]. Support pagination (`page`, `pageSize`)[cite: 3]. |
| `GET` | `/{entities}/{id}` | Aggregate `Get{Entity}ById`[cite: 3] | **200 OK**<br>Return `{Entity}` record[cite: 3] | Filter by `{Entity}.Id = Id` and `{Entity}.IsActive = True`[cite: 1, 5]. If empty, set **404 Not Found**. |
| `PUT` / `PATCH` | `/{entities}/{id}` | `{Entity}_Upsert`[cite: 1, 5] | **200 OK**<br>Return `{ Id: Id }` | Map incoming route `Id` into `Source.Id`. If `EntityActionResult.IsSuccess = False`, set **400 Bad Request** with `CombinedEntityMessageText`[cite: 1, 5]. |
| `DELETE` | `/{entities}/{id}` | `{Entity}_Remove`[cite: 1, 5] | **204 No Content**<br>(No body) | Wrap in exception handler: if `ProcessingException` is caught (from `_GetCanRemove`), map to **400 Bad Request** or **404 Not Found** with the exception message[cite: 1, 5]. |

### Standard Flow for Mutation Endpoints (POST / PUT)

1. Map Request payload into `Source` (`{Entity}` Record)[cite: 1, 5].
2. Call `{Entity}_Upsert(Source)`[cite: 1, 5].
3. Check `EntityActionResult.IsSuccess`[cite: 1, 5]:
   - **True**: Set Status Code to `201` (for POST) or `200` (for PUT), map output `Id` to response structure, and End[cite: 1, 3, 5].
   - **False**: Set Status Code to `400` or `409`, map `CombinedEntityMessageText` to error response structure, and End[cite: 1, 5].
4. Exception Handler:
   - Catch `AllExceptions`: Set Status Code to `500`, map `ExceptionMessage`, and End.

---

## 5. Instruction for BRD and Agent Scaffolding
- When generating BRDs for **OutSystems AI Mentor Web**, explicitly include the 6 standard fields and define these 4 action contracts so Mentor sets up the correct architecture from the start[cite: 1].
- When writing integration tests (e.g., Vitest), assert soft deletes by checking that a deleted record has `IsActive = False` and returns appropriate error messages from `_GetCanRemove`[cite: 1].