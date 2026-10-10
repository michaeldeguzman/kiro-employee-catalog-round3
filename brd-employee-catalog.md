# Business Requirements Document
## Employee Catalog Application

**Platform:** OutSystems Developer Cloud (ODC)
**Tool:** OutSystems MCP server (Mentor behind it)
**Input format:** `.md` (Markdown)
**Version:** 2.2
**Date:** 2026-10-03

> **Authoring note:** This document follows the [ODC Requirement Document specification](https://success.outsystems.com/documentation/outsystems_developer_cloud/agentic_development/ai_app_generation_in_mentor_web/use_requirement_documents/) for AI Mentor Web. Sections, data type labels, role definitions, and screen patterns use the exact vocabulary Mentor Web expects to generate accurate blueprints.

---

## 1. App Overview

The **Employee Catalog** is an internal HR application that centralises the management and browsing of employee records. It allows HR Administrators to create, update, and soft-delete employee profiles, and provides Directory Viewers with a filtered, read-only view of active staff.

The application must enforce uniqueness of employee email addresses, track record-level audit history (who created and last updated each record), and expose a REST API for integration and automated testing.

---

## 2. General App Settings

- **Theme:** Use the default Mentor theme available in the ODC tenant.
- **Localization:** English only.
- **No custom telemetry or observability instrumentation** is required for this build.

---

## 3. Roles and Permissions

```
Role: HR Administrator
- Employee entity: Full Access (Create, Edit, Delete/Soft-delete)
- Can toggle visibility of inactive records on the list screen.
- Has access to audit field display on the detail screen.

Role: Directory Viewer
- Employee entity: View Access (active records only)
- Cannot create, edit, or remove employee records.
- Cannot see inactive records or audit fields.
```

---

## 4. Data Model

### 4.1 Static Entity: MessageType

```
Entity Name: MessageType
Purpose: Defines the severity level of messages returned by server actions.
Type: Static Entity
Records: Success, Error, Warning, Info
```

> Record Id assignments: Success = 1, Error = 2, Warning = 3, Info = 4.

---

### 4.2 Structure: EntityActionMessage

```
Structure: EntityActionMessage
Purpose: Represents a single validation or result message produced by a server action.
Attributes:
- MessageTypeId: An Identifier that is a Foreign Key to the MessageType static entity
- MessageText: Text, the human-readable message content
```

---

### 4.3 Structure: EntityActionResult

```
Structure: EntityActionResult
Purpose: Standard return envelope for all server actions. Carries success/failure status and any messages.
Attributes:
- IsSuccess: Boolean, True if the operation succeeded
- EntityActionMessages: A list of EntityActionMessage records
- CombinedEntityMessageText: Text, a flattened summary of all messages in the list
- CombinedEntityActionMessageTypeId: An Identifier that is a Foreign Key to the MessageType static entity, representing the most severe message type across all messages
```

---

### 4.4 Entity: Employee

```
Entity: Employee
Purpose: Stores employee profile and directory data. Supports soft-deletion via the IsActive flag.

Attributes:
- Id: An Identifier that serves as the Primary Key, AutoNumber enabled, platform-generated
- FirstName: Text (max 50 characters), mandatory, employee given name
- LastName: Text (max 50 characters), mandatory, employee family name
- Email: Email, mandatory, work email address — must be unique across all Employee records
- Department: Text (max 100 characters), mandatory, department or business unit name
- JobTitle: Text (max 100 characters), optional, role or position title, default value is empty text
- IsActive: Boolean, mandatory, soft-delete flag — True means the record is active, default value is True
- CreatedByUserId: User Identifier, optional, audit field — the user who created this record
- CreatedOn: DateTime, optional, audit field — timestamp of record creation, default value is #1900-01-01 00:00:00#
- UpdatedByUserId: User Identifier, optional, audit field — the user who last updated this record
- UpdatedOn: DateTime, optional, audit field — timestamp of last update, default value is #1900-01-01 00:00:00#

Indexes:
- IdxEmail_Unique: Unique index on the Email attribute. Enforces one Employee record per email address at the database level.

Notes:
- The IsActive, CreatedByUserId, CreatedOn, UpdatedByUserId, and UpdatedOn attributes must be set as not mandatory (IsMandatory = False) with safe default values to prevent deployment error OS-DPL-50205 when adding them to an existing entity.
- Audit fields are set exclusively by server actions, never by the UI layer.
```

---

## 5. Business Logic and Server Actions

Create a server action folder named **Employee**. This folder contains exactly four server actions. Do not create standalone GetAll or GetById server actions — data is fetched directly in screens and REST API flows using Aggregates.

> **Constraint:** Never call raw entity actions (CreateEmployee, UpdateEmployee) directly from UI screens or exposed REST endpoints. All writes go through Employee_Upsert. All soft-deletes go through Employee_Remove.

---

### 5.1 Shared Infrastructure — Folder: EntityActionResult

These utility server actions are required before building the Employee actions.

```
Server Action: EntityActionResult_BuildFromSuccess
Folder: EntityActionResult
Purpose: Constructs an EntityActionResult with IsSuccess = True and a success message.
Input:
- EntityActionResultMessageText: Text, mandatory
Output:
- EntityActionResult: EntityActionResult structure

Server Action: EntityActionResult_BuildFromError
Folder: EntityActionResult
Purpose: Constructs an EntityActionResult with IsSuccess = False and an error message.
Input:
- EntityActionResultMessageText: Text, mandatory
Output:
- EntityActionResult: EntityActionResult structure

Server Action: EntityActionResult_CombineEntityActionMessages
Folder: EntityActionResult
Purpose: Flattens a list of EntityActionMessage records into a single text string and resolves the highest-severity MessageType.
Input:
- EntityActionMessages: List of EntityActionMessage, mandatory
Output:
- CombinedEntityMessageText: Text
- CombinedEntityActionMessageTypeId: An Identifier referencing the MessageType static entity
```

---

### 5.2 Shared Infrastructure — Folder: Session

```
Server Action: Session_GetNormalizedSessionUserId
Folder: Session
Purpose: Returns the current session user's Identifier, normalised for use as an audit UserId.
Function property: True (enables inline use inside Assign nodes without a separate flow step)
Input: none
Output:
- NormalizedSessionUserId: User Identifier
```

---

### 5.3 Employee_Validate

```
Server Action: Employee_Validate
Folder: Employee
Purpose: Validates a candidate Employee record before any write. Returns an EntityActionResult indicating whether the record is valid.
Input:
- Source: Employee record, mandatory
Output:
- EntityActionResult: EntityActionResult structure

Validation rules (evaluate all rules and collect all failures before returning):
1. If Source.FirstName is empty: add EntityActionMessage with MessageTypeId = MessageType.Error and MessageText = "First Name is required."
2. If Source.LastName is empty: add EntityActionMessage with MessageTypeId = MessageType.Error and MessageText = "Last Name is required."
3. If Source.Email is empty: add EntityActionMessage with MessageTypeId = MessageType.Error and MessageText = "Email is required."
4. If Source.Email is not a valid email format: add EntityActionMessage with MessageTypeId = MessageType.Error and MessageText = "Email must be a valid email address."
5. Duplicate Email check: run an Aggregate on Employee filtered by Employee.Email = Source.Email AND Employee.Id <> Source.Id AND Employee.IsActive = True, MaxRecords = 1. If the count is greater than 0: add EntityActionMessage with MessageTypeId = MessageType.Error and MessageText = "An employee with email '" + Source.Email + "' already exists."
6. If Source.Department is empty: add EntityActionMessage with MessageTypeId = MessageType.Error and MessageText = "Department is required."

Result assignment:
- If the EntityActionMessages list is empty: assign EntityActionResult.IsSuccess = True.
- If the list is not empty: call EntityActionResult_CombineEntityActionMessages, then assign EntityActionResult.IsSuccess = False, EntityActionResult.CombinedEntityMessageText, EntityActionResult.CombinedEntityActionMessageTypeId, and EntityActionResult.EntityActionMessages.

Important: do not call EntityActionResult_BuildFromError or EntityActionResult_BuildFromSuccess inside Employee_Validate.
```

---

### 5.4 Employee_Upsert

```
Server Action: Employee_Upsert
Folder: Employee
Purpose: Creates a new Employee record or updates an existing one. Runs Employee_Validate first and exits early if validation fails.
Input:
- Source: Employee record, mandatory
Output:
- EntityActionResult: EntityActionResult structure
- Id: Employee Identifier

Logic:
1. Call Employee_Validate(Source). If EntityActionResult.IsSuccess = False, return that EntityActionResult immediately. Id = NullIdentifier().

2. Create path — if Source.Id = NullIdentifier():
   Assign in a single Assign node:
   - Source.CreatedOn = CurrDateTime()
   - Source.CreatedByUserId = Session_GetNormalizedSessionUserId()   [inline function call]
   - Source.UpdatedOn = Source.CreatedOn                             [copy — do NOT call CurrDateTime() again]
   - Source.UpdatedByUserId = Source.CreatedByUserId                 [copy]
   - Source.IsActive = True
   Call entity action CreateEmployee(Source).
   Assign Id = CreateEmployee.Id.

3. Update path — if Source.Id is not NullIdentifier():
   Assign in a single Assign node:
   - Source.UpdatedOn = CurrDateTime()
   - Source.UpdatedByUserId = Session_GetNormalizedSessionUserId()   [inline function call]
   Call entity action UpdateEmployee(Source).
   Assign Id = Source.Id.

4. Both paths end with:
   EntityActionResult = EntityActionResult_BuildFromSuccess("Employee """ + Source.FirstName + " " + Source.LastName + """ has been saved.")

Exception handlers:
- DatabaseException: return EntityActionResult_BuildFromError("A database error occurred. Please contact your administrator.")
- AllExceptions: return EntityActionResult_BuildFromError(ExceptionMessage)
```

---

### 5.5 Employee_GetCanRemove

```
Server Action: Employee_GetCanRemove
Folder: Employee
Purpose: Checks whether an Employee record is eligible for soft-deletion. Used as a guard before Employee_Remove.
Input:
- Id: Employee Identifier, mandatory
Output:
- EntityActionResult: EntityActionResult structure

Logic:
1. Run Aggregate GetById: filter Employee.Id = Id, MaxRecords = 1.
2. If count = 0: return EntityActionResult_BuildFromError("Cannot remove an unsaved Employee.")
3. If GetById.List.Current.Employee.IsActive = False: return EntityActionResult_BuildFromError("Cannot remove Employee """ + FirstName + " " + LastName + """, it is already removed.")
4. If IsActive = True: return EntityActionResult_BuildFromSuccess("").

Exception handler:
- DatabaseException: raise ProcessingException.
```

---

### 5.6 Employee_Remove

```
Server Action: Employee_Remove
Folder: Employee
Purpose: Soft-deletes an Employee record by setting IsActive = False.
Input:
- Id: Employee Identifier, mandatory
Output:
- EntityActionResult: EntityActionResult structure

Logic:
1. Call Employee_GetCanRemove(Id). If EntityActionResult.IsSuccess = False: RAISE ProcessingException(CombinedEntityMessageText). Do not return the failure result.
2. Call entity action GetForUpdateEmployee(Id) to lock the row.
3. Assign on the locked record in a single Assign node:
   - IsActive = False
   - UpdatedOn = CurrDateTime()
   - UpdatedByUserId = Session_GetNormalizedSessionUserId()   [inline function call]
4. Call entity action UpdateEmployee(GetForUpdateEmployee.Record).
5. Return EntityActionResult = EntityActionResult_BuildFromSuccess("Employee """ + FirstName + " " + LastName + """ has been removed.")

Exception handlers:
- DatabaseException: return EntityActionResult_BuildFromError("A database error occurred. Please contact your administrator.")
- AllExceptions: return EntityActionResult_BuildFromError(ExceptionMessage)
```

---

## 6. REST API Endpoints

Expose a REST API named **EmployeeAPI** under the Logic tab > Integrations. All methods call server action flows — never raw entity actions directly.

> Per the [ODC REST API documentation](https://success.outsystems.com/documentation/outsystems_developer_cloud/integration_with_external_systems/exposing_rest_apis/change_the_http_status_code_of_a_rest_api/), use the HTTP extension action `Response_SetStatusCode` to return non-200 success codes. To return the custom `Errors` and `StatusCode` body, assign it to the response and end the flow normally. A raised exception returns ODC's framework error envelope (`errors`, `title`, `status`, `traceId`) instead.

---

### 6.1 POST /employees — Create Employee

```
REST Method: CreateEmployee
HTTP Method: POST
URL Pattern: /employees
Description: Creates a new Employee record via Employee_Upsert.

Input structure (request body):
- FirstName: Text, mandatory
- LastName: Text, mandatory
- Email: Email, mandatory
- Department: Text, mandatory
- JobTitle: Text, optional

Logic flow:
1. Map request body fields onto a local Employee record.
2. Call Employee_Upsert(Employee).
3. If EntityActionResult.IsSuccess = False:
   - If the failure is a duplicate email: Call Response_SetStatusCode(409), assign Errors = [EntityActionResult.CombinedEntityMessageText] and StatusCode = 409 to the response structure, then End.
   - For any other validation failure (for example a missing required field): Call Response_SetStatusCode(400), assign Errors = [EntityActionResult.CombinedEntityMessageText] and StatusCode = 400 to the response structure, then End.
4. If an unexpected exception occurs (AllExceptions handler): Call Response_SetStatusCode(500), assign Errors = [ExceptionMessage] and StatusCode = 500 to the response structure, then End.
5. If IsSuccess = True:
   - Call Response_SetStatusCode(201)
   - Return the response structure below.

Note: do not raise an exception on the 409/400/500 paths. Raising returns ODC's framework error envelope (errors, title, status, traceId) instead of the custom Errors/StatusCode body. Assign the body and reach a normal End node instead.

Output structure (shared across success and error responses):
- Id: Identifier (Long Integer), the platform-generated Employee Id
- FirstName: Text
- LastName: Text
- Email: Email
- Department: Text
- JobTitle: Text
- Errors: Text List — populated only on error responses. It holds a SINGLE element: all failed-rule messages combined into one string, separated by a newline (`\r\n`), as produced by EntityActionResult_CombineEntityActionMessages and wrapped as Errors = [CombinedEntityMessageText]. It is NOT one list element per failed rule. On the HTTP 201 success response it is left unassigned, so ODC omits it from the JSON body.
- StatusCode: Integer — populated only on error responses (409 / 400 / 500). On the HTTP 201 success response it is left unassigned, so ODC omits it from the JSON body.

On HTTP 201 the body therefore contains only the six employee fields, e.g.
  { "Id": 34, "FirstName": "Raw", "LastName": "One", "Email": "...", "Department": "Engineering", "JobTitle": "Dev" }
(Errors and StatusCode are absent, not null — ODC omits unassigned fields.)

Error responses:
- HTTP 400 (missing body or malformed request): returned by the ODC framework before the action flow runs, so the body shape cannot be customised.
  Body shape: { "errors": { "ValidationErrors": ["The request body is missing."] }, plus other framework-generated fields }
- HTTP 400 (validation failure, for example a missing required field): Response_SetStatusCode(400), then assign the error body and End.
  Body shape: { "Errors": ["<all failed-rule messages joined by \r\n in one string>"], "StatusCode": 400 }
  Example (FirstName and LastName both omitted): { "Errors": ["First Name is required.\r\nLast Name is required."], "StatusCode": 400 }
- HTTP 500: unexpected exception — Response_SetStatusCode(500), then assign the error body and End.
  Body shape: { "Errors": ["<exception message>"], "StatusCode": 500 }
- HTTP 409: duplicate email — Response_SetStatusCode(409), then assign the error body and End.
  Body shape: { "Errors": ["An employee with email '...' already exists."], "StatusCode": 409 }
```

---

### 6.2 GET /employees — List Active Employees

```
REST Method: ListEmployees
HTTP Method: GET
URL Pattern: /employees
Description: Returns all active Employee records. Supports optional department filtering and pagination.

Input parameters (query string):
- Department: Text, optional — filter by exact department name
- Page: Integer, optional — 1-based page number, default 1
- PageSize: Integer, optional — records per page, default 25

Logic flow:
1. Run Aggregate on Employee:
   - Filter: Employee.IsActive = True
   - If Department input is non-empty, add filter: Employee.Department = Department
   - Apply pagination: StartIndex = (Page - 1) * PageSize, MaxRecords = PageSize
2. Run a second Aggregate (count only) for TotalCount with the same filters but no MaxRecords.
3. Map results to output structure.
4. Return HTTP 200.

Output structure (HTTP 200):
- Employees: List of Employee records, each containing Id, FirstName, LastName, Email, Department, JobTitle
- TotalCount: Integer, total number of matching active records
```

---

### 6.3 GET /employees/{Id} — Get Employee by Id

```
REST Method: GetEmployee
HTTP Method: GET
URL Pattern: /employees/{Id}
Description: Returns a single active Employee record by Id.

Input parameter (URL):
- Id: Identifier, mandatory

Logic flow:
1. Run Aggregate GetById: filter Employee.Id = Id AND Employee.IsActive = True, MaxRecords = 1.
2. If count = 0:
   - Call Response_SetStatusCode(404)
   - Assign Errors = ["Employee not found."] and StatusCode = 404 to the response structure, then End. Do not raise an exception.
3. If a row is found: map the six employee fields to the response and return HTTP 200 (Errors and StatusCode left unassigned, so they are omitted from the body).

Output structure (shared across success and error responses):
- Id: Identifier
- FirstName: Text
- LastName: Text
- Email: Email
- Department: Text
- JobTitle: Text
- Errors: Text List — on the 404 response holds a single element "Employee not found."; unassigned (and omitted) on the HTTP 200 response.
- StatusCode: Integer — on the 404 response holds 404; unassigned (and omitted) on the HTTP 200 response.

Error responses:
- HTTP 404: employee not found or inactive. GetEmployee sets Response_SetStatusCode(404), assigns the error body, and ends normally (no raise), returning the custom body:
  Body shape: { "Errors": ["Employee not found."], "StatusCode": 404 }
```

---

## 7. Screens and UI

### 7.1 Employee_List

```
Screen: Employee_List
Purpose: Directory table for browsing employees. Primary screen for both personas.
Layout: Table / list view

Data source:
- Aggregate on Employee filtered by Employee.IsActive = True.
- If Department filter is active, add: Employee.Department = SelectedDepartment.
- If HR Administrator has toggled "Show Inactive", remove the IsActive filter.

Columns: Full Name (FirstName + " " + LastName), Email, Department, JobTitle

Filters:
- Department dropdown: populated from distinct Department values of active employees. Filters the aggregate on change.
- Show Inactive toggle: visible to HR Administrator only. When enabled, shows records where IsActive = False in addition to active records.

Actions (HR Administrator only):
- New Employee button: navigates to Employee_Detail with no Id (create mode).
- Edit row action: navigates to Employee_Detail with the row's Id.
- Remove row action: calls Employee_Remove(Id). On success, refreshes the list and displays the EntityActionResult success message as a toast notification.

Empty state: display the message "No employees found." when the aggregate returns zero records.

Permissions:
- HR Administrator: Full access including filters, actions, and inactive toggle.
- Directory Viewer: View only. No action buttons. No inactive toggle.
```

---

### 7.2 Employee_Detail

```
Screen: Employee_Detail
Purpose: Create and edit form for a single Employee record.
Layout: Form / detail view

Mode detection:
- If URL parameter Id is NullIdentifier(): create mode — form fields start empty.
- If Id is provided: edit mode — load record via Aggregate filtered by Employee.Id = Id, MaxRecords = 1.

Form fields:
- FirstName: Text input, label "First Name", mandatory
- LastName: Text input, label "Last Name", mandatory
- Email: Email input, label "Work Email", mandatory
- Department: Text input, label "Department", mandatory
- JobTitle: Text input, label "Job Title", optional

Validation feedback:
- On save, if EntityActionResult.IsSuccess = False, display CombinedEntityMessageText as an inline error message above the form fields.
- Highlight the relevant fields where possible.

Actions:
- Save button: calls Employee_Upsert(Employee). On success, navigate back to Employee_List and display the EntityActionResult success message as a toast notification.
- Cancel button: navigates back to Employee_List without saving.

Audit panel (edit mode only, HR Administrator only):
- Read-only panel at the bottom of the form displaying:
  - Created On: CreatedOn (DateTime)
  - Created By: CreatedByUserId (User name lookup)
  - Last Updated On: UpdatedOn (DateTime)
  - Last Updated By: UpdatedByUserId (User name lookup)

Permissions:
- HR Administrator: Full access to create and edit.
- Directory Viewer: No access to this screen.
```

---

## 8. Constraints and Rules Summary

```
Rule 1 — No hard deletes
All record removals set IsActive = False via Employee_Remove. The Delete entity action is never called.

Rule 2 — No standalone GetAll or GetById server actions
Data is fetched directly in screens and REST flows using Aggregates.

Rule 3 — No direct entity action calls from UI or REST
All writes route through Employee_Upsert. All soft-deletes route through Employee_Remove.

Rule 4 — Duplicate email enforced at two levels
Employee_Validate returns a clean 409 user message. The unique database index IdxEmail_Unique is the hard safety net.

Rule 5 — Audit fields are server-only
CreatedByUserId, CreatedOn, UpdatedByUserId, and UpdatedOn are set exclusively inside Employee_Upsert and Employee_Remove. The UI layer never sets them.

Rule 6 — Session_GetNormalizedSessionUserId must be a Function
Set Function = True on this server action so it can be called inline inside Assign nodes. Never invoke it as a separate flow step.

Rule 7 — UpdatedOn and UpdatedByUserId on create are copied, not re-computed
In the create path of Employee_Upsert, assign UpdatedOn = Source.CreatedOn and UpdatedByUserId = Source.CreatedByUserId in the same Assign node. Do not call CurrDateTime() a second time.

Rule 8 — Safe DateTime defaults prevent deployment failure
CreatedOn and UpdatedOn use default value #1900-01-01 00:00:00# to avoid ODC deployment error OS-DPL-50205 when these attributes are added to an entity that already has data.

Rule 9 — REST error codes require explicit Response_SetStatusCode
ODC defaults to HTTP 200 on success. Call Response_SetStatusCode(201) for record creation. Call Response_SetStatusCode(409) then assign the error body and End for duplicate email. Call Response_SetStatusCode(400) then assign the error body and End for any other validation failure. Call Response_SetStatusCode(404) then assign the error body and End for not-found.
Reference: https://success.outsystems.com/documentation/outsystems_developer_cloud/integration_with_external_systems/exposing_rest_apis/change_the_http_status_code_of_a_rest_api/
```