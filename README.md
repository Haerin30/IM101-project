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
