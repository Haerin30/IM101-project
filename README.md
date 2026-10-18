# IM101 Campus Facility Management System

Express/CommonJS backend with Prisma 7, PostgreSQL, and three-role access control.
The React frontend is planned.

## Setup

Use Node.js 24. Run `npm ci`, configure `DATABASE_URL` in a local `.env`,
then run `npx prisma generate --config prisma7.config.ts`.
Apply reviewed migrations with `npx prisma migrate deploy --config prisma7.config.ts`.
Run `npm start` or `npm run dev` (Node's built-in watcher).

The PostgreSQL connection explicitly uses UTC; API timestamps must include a
timezone. Stored timestamps use `timestamptz`. Deploy the application and migration
together: this version requires the new tables, triggers, and stored procedure.

## Migration and existing data

The integrity migration is transactional. It requires PostgreSQL's `btree_gist`
extension (available on Supabase). Existing blank purposes, invalid time ranges,
overlapping Pending/Approved reservations, invalid quantities, or stock counts
that disagree with active loans/allocations stop the migration. Resolve those
records deliberately; the migration does not delete bookings or invent inventory.
Back up the database and review these records before applying it.

Legacy timestamp-without-timezone values are interpreted as UTC, matching
Prisma's existing timestamp convention. Review this assumption if historical
records were entered directly using local-time SQL.

The three published demo identities identified by their original email and
ID number are disabled by the migration. Provision a new administrator with a
unique email and a strong supplied password. Existing other user passwords,
roles, and active flags are preserved by reseeding. No shared/live database
migration is run by CI.

## Secure seeding

`npm run seed` creates lookup data without creating any accounts by default.
Optionally supply pairs of environment variables:

- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`
- `SEED_STAFF_EMAIL` and `SEED_STAFF_PASSWORD`
- `SEED_MEMBER_EMAIL` and `SEED_MEMBER_PASSWORD`

Passwords must be at least 16 characters and at most 72 UTF-8 bytes.
Set secrets through the deployment environment or a local ignored `.env`;
never put real passwords in commands committed to the repository.
Account upserts have an empty update branch: seeding never resets a password,
changes an existing role, or reactivates a disabled user.

## Authentication and access

`POST /api/auth/login` accepts only email and password. Use the returned token
in `Authorization: Bearer <token>`. `GET /api/auth/me` returns the safe user
profile; `POST /api/auth/logout` revokes the token.

Sessions expire after one hour. Only SHA-256 token hashes are stored in
PostgreSQL. Sessions and the 10-attempts-per-IP-per-15-minutes login limit are
shared across instances. Expired entries are removed at login. Password changes
and deactivation revoke sessions; active status and role are reread on every
request. Authentication fails closed when the database is unavailable.

| Resource                                | Administrator / staff | Faculty / organization representative |
| --------------------------------------- | --------------------- | ------------------------------------- |
| Facilities/equipment reads              | Allowed               | Allowed                               |
| Facilities/equipment writes and repairs | Allowed               | Forbidden                             |
| Create reservation                      | Self                  | Self                                  |
| Reservation reads, edits, history       | All                   | Own only                              |
| Approve/reject/complete reservation     | Allowed               | Forbidden                             |
| Cancel reservation                      | All                   | Own only                              |
| Loan list                               | All                   | Own only                              |
| Approved checkout / return              | Allowed               | Forbidden                             |
| Database diagnostic                     | Administrator only    | Forbidden                             |

HTTPS is required outside local development. Keep tokens out of URLs and logs.
The app does not trust forwarded IP headers; configure proxy trust and ingress
rate limits explicitly for the actual deployment.

## Reservations

Create with `POST /api/reservations`: `facilityId`, nonblank `purpose`,
future `startDatetime` and `endDatetime`, optionally
`equipmentItems: [{ equipmentId, quantity }]`. Requester identity always comes
from the authenticated account. Dates must be valid ISO timestamps with timezone.

Only Pending requests may be edited using `PUT /api/reservations/:id`.
Partial date edits are checked against the stored other endpoint.
Facilities must be Available. Pending and Approved requests block overlapping
times; adjacent intervals are allowed. PostgreSQL's exclusion constraint protects
against concurrent overlap even when requests arrive together.

`PATCH /api/reservations/:id/status` accepts `{ status }`:

- Pending → Approved, Rejected, or Cancelled.
- Approved → Cancelled or Completed.
- Completed is allowed only after the end time; terminal states cannot reopen.

Approval records the authenticated approver and rechecks availability.
`GET /api/reservations/:id/history` returns reservation and allocation audit
events. SQL triggers retain before/after values and the transaction actor.

## Equipment and loans

Equipment quantities and identifiers must be bounded integers. Names cannot be
blank. Inventory availability is derived and cannot be manually edited.

Reservation allocations physically hold stock from request creation until
cancellation, rejection, or completion. This conservative policy holds stock even
for future reservations; nonoverlapping reservations do not share held units.
Allocation replacement is atomic. Separate ad-hoc loans consume unallocated
stock, so they cannot double-spend reserved quantities.

`POST /api/loans` records a staff-approved checkout with `equipmentId`,
`userId`, positive `quantity`, future `dueDate`, and optional `conditionOut`.
The borrower must be active. The approver comes from authentication.

`POST /api/loans/:id/return` takes `conditionIn`: Good, Fair, or Damaged.
A loan is returned as a whole; repeated or concurrent returns cannot add stock
twice. Good/Fair returns restore availability. Damaged returns increase
`damagedQuantity` and remain unavailable until staff record
`POST /api/equipment/:id/repair` with `{ quantity }`. Repair events are immutable.

Stock updates are atomic in database triggers. Total stock cannot be reduced
below committed and damaged units. Inactive/Damaged equipment cannot be issued;
equipment cannot be retired with outstanding commitments. Facilities cannot be
deactivated while blocking reservations remain.

## Checks and tests

`npm run quality` runs Prisma validation, Prettier/Prisma formatting, JavaScript
syntax checks, ESLint, and unit/HTTP tests. These tests use a stubbed DB boundary.
`npm run audit` fails on high/critical dependency advisories.

Run `npm run test:integration` with an explicitly supplied `TEST_DATABASE_URL`
pointing to a loopback PostgreSQL database whose name ends in `_test`.
It has no fallback to `DATABASE_URL` and fails if configuration is missing.
Tests create random isolated schemas, apply the repository migrations, exercise
real HTTP/Prisma/PostgreSQL behavior, and remove only their schemas afterward.
They test concurrent bookings/loans, lifecycle and ownership, stock release,
damaged returns and repair, session revocation/sharing, safe seeding, and migration
rollback. They require schema/extension creation permission in this test database.

GitHub Actions retains the required **Code Quality** job name. All checks,
PostgreSQL integration tests, client generation, and dependency audit are
mandatory. CI starts an isolated PostgreSQL 16 service and uses no Supabase secrets.

## Maintenance requests

All /api/maintenance-requests endpoints require bearer authentication.
Responses follow the existing success/data or success/message JSON convention.

| Method and path                            | Purpose and accepted body fields                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| POST /api/maintenance-requests             | Create an Open request: description and at least one of facilityId/equipmentId; staff/admin may also set priority |
| GET /api/maintenance-requests              | List visible requests in requestId order                                                                          |
| GET /api/maintenance-requests/:id          | View a visible request                                                                                            |
| PATCH /api/maintenance-requests/:id        | Edit description; staff/admin may also edit priority                                                              |
| PATCH /api/maintenance-requests/:id/assign | Assign an active maintenance staff user using assignedStaffId                                                     |
| PATCH /api/maintenance-requests/:id/status | Advance status; resolutionNotes is required for Resolved                                                          |
| GET /api/maintenance-requests/:id/history  | View the request's ordered AuditLog snapshots and actor IDs                                                       |

Faculty/organization representatives can create requests, list/view their own
requests and history, and edit their own description only while Open. Staff and
administrators can view all requests, edit description/priority, assign staff,
and advance workflow. Administrators have all management permissions, but the
same immutable history and workflow rules apply. Eligible assignees must have
the Facility/Maintenance Staff role and be active; administrator status alone
does not make someone a technician.

The only transitions are Open to In Progress, then In Progress to Resolved.
Resolving records the server timestamp and nonblank resolution notes. Resolved
requests cannot be edited, reassigned, or reopened by any role. Assignment does
not advance status. An eligible active maintenance staff assignee is required before
starting or resolving work. If the assignee becomes inactive or loses the staff
role, reassign before progressing. There is no
maintenance deletion endpoint. Facility/equipment references and reporting
identity cannot be changed after creation. Existing inactive assets can still
be reported for maintenance; creating requests never changes asset availability.

Descriptions and resolution notes are trimmed and limited to 2000 characters.
IDs must be positive integers referring to existing records. Either asset ID or
both can be supplied; supplied IDs cannot be null. Priorities are Low, Normal,
High, Urgent (default Normal). Unknown or unauthorized fields, including
reportedBy, userId, roleId, resolvedAt, and inline status/assignment fields,
are rejected with 400. Forbidden ownership/actions return 403, missing records
404, and invalid transitions or edits to closed requests 409. Faculty cannot
set priority; staff triage their reports.

The additive 20261018020000_maintenance_audit migration attaches the existing
audit_change function to MaintenanceRequest inserts, updates and deletes.
It changes no models, columns, existing rows, or AuditLog relationships and does
not backfill historical events. Apply it after the existing integrity migration
through the normal reviewed deployment process. API writes use the existing
serializable transaction helper, which supplies app.user_id for audit attribution.
Concurrent conflicting edits return 409 and can be retried after reloading.
Direct database writes are also audited; without actor context changedBy is null.
The new maintenance integrity migration also enforces field, workflow, assignment
and history invariants in PostgreSQL. Role/ownership permissions are enforced by
the API; direct database access must remain
restricted to trusted operators.

Legacy In Progress and Resolved reports may retain missing staff assignments.
Resolved history stays immutable; staff/admin can assign eligible active staff to
legacy work in progress. Every new status transition requires that assignment in
both the API and PostgreSQL. There is no row-wide assignment CHECK that would
reject valid legacy updates. Historical facility/equipment locations are preserved
even after relocation; matching the current location is required only on creation
(portable equipment with no home facility is accepted). The read-only preflight
reports historical missing/ineligible assignees and location differences as review
warnings, while invalid fields and resolution metadata still block deployment.

Maintenance unit tests cover validation, ownership, field restrictions, assignment,
transitions, resolution, and history serialization. The PostgreSQL integration
suite additionally exercises every authenticated endpoint, actual audit snapshots,
actor IDs, atomic rollback, concurrent transitions, and unchanged asset stock.

## Final backend hardening

Equipment now has isActive independently of conditionStatus. DELETE deactivates
without overwriting physical condition; PUT may reactivate with a verified physical
condition. Legacy Inactive conditions become inactive records with null (unknown)
physical condition, never an invented condition. Inactive equipment cannot be
borrowed or allocated to new reservations. Existing inventory protections remain.

Maintenance creation checks that equipment's known home matches the supplied
facility; portable equipment with no home is allowed. Database constraints and
triggers also protect direct writes, resolution metadata and immutable history.

Read [the deployment and recovery guide](docs/backend-hardening-deployment.md)
before applying any migrations. It includes migration order, read-only preflight,
legacy data cleanup, backup, deployment and recovery steps. Shared Supabase work
requires explicit approval.
