# Reservation workflow: offline development and deployment contract

This work is not deployed. Never apply these migrations through the normal quality
suite or against live Supabase without separate operator authorization. The approved
DBML, Prisma schema and original V2 migration remain unchanged.

## PROVISIONAL creation policies: instructor approval required before deployment

POST /api/reservations accepts only facilityId, purpose, startDatetime, endDatetime.
The existing pure structural validator trims purpose, counts Unicode code points,
requires timezone-aware valid timestamps, and rejects precision beyond milliseconds.
The authenticated user is the requester; approvedBy is NULL and the real Pending
lookup ID is resolved in PostgreSQL. All four agreed status names must exist; no
status is inserted or assigned a fixed ID. Pending requests may overlap each other.

PROVISIONAL: start must be strictly future at the database time check; maximum
duration is eight elapsed hours; both endpoints must be within 90 days of that
check; no buffers; creation is rejected if an Approved interval overlaps. Only
the exact existing facility status `Available` is eligible; all other strings are
unavailable. That eligibility interpretation also requires final policy review.
Boundaries are inclusive at eight hours and the 90-day horizon. PostgreSQL checks
these rules again, using its clock after facility locking; it does not trust the
API's clock or structural validation alone. SQL rejects submillisecond inputs too.

Real PostgreSQL verification exposed an eight-hour readback shift when the Windows
cluster's default timezone was Asia/Manila. The installed adapter-pg timestamptz
decoder assumes server UTC. Backend adapter startup options now explicitly pin UTC
for every connection; URL-level `options` overrides are rejected for operator review.
This does not weaken TLS or change credentials. Operators with custom startup options
must review that configuration before deployment. The isolated test retains the
non-UTC server default and uses the same UTC adapter option, so it checks the fix
rather than hiding the mismatch by changing the test server's timezone.

The actual create_reservation PostgreSQL procedure is called through a fixed,
parameterized CALL on the gateway transaction. Its INOUT reservation ID must start
NULL. Prisma receives the database-generated ID, reads the explicit scalar projection
inside that transaction and returns HTTP 201 only after transaction resolution.
Actor, role and status rows are locked during the procedure. Future procedures must
use the same facility locking and Serializable conflict-read protocol.

Only whitelisted SQLSTATE errors map to fixed HTTP 400/401/403/404/409/503 responses.
Serialization/deadlock conflicts return 409 without retries. Unknown errors and lost
commit acknowledgements return generic 500. No response proves rollback after a lost
connection; reconcile before any manual retry. No cleanup writes run after failures.

## Approval

POST /api/reservations/:id/approve accepts no query or body fields. It uses current
System Administrator RBAC and the actual approve_reservation procedure. PostgreSQL
rechecks active role, prohibits self-approval, requires Pending, locks the facility
then the reservation, and rechecks eligibility and all provisional time rules.
Only Approved records block the strict overlap predicate (start < end and end >
start); adjacency is allowed. The original requester is preserved and approvedBy
is the acting administrator. An audit UPDATE is required in the same transaction.

Concurrent callers use independent Serializable transactions, fixed lock ordering,
and conflict predicate reads. A conflicting transaction is refused, never silently
retried. Serializable isolation can conservatively reject otherwise nonconflicting
operations too. A 409 requires reloading; it is not permission to blindly retry a
write. Malformed JSON parser errors also receive Cache-Control: no-store.

## Rejection

POST /api/reservations/:id/reject uses current administrator RBAC and the actual
reject_reservation procedure. Only another user's Pending request may be rejected.
The procedure locks the same actor/status/facility/reservation sequence, changes
status to the real Rejected lookup ID, and leaves approvedBy NULL. AuditLog records
the rejecting actor independently. Duplicate and competing terminal transitions
return conflicts. No free-text rejection reason, editing, or reopening is added.

## Cancellation

POST /api/reservations/:id/cancel accepts no body/query fields. All approved roles
may cancel their own Pending or Approved reservation only before its start, checked
using PostgreSQL clock_timestamp after locks. PROVISIONAL: a current administrator
may also cancel another user's unstarted reservation. Other users' IDs receive the
same 404 as nonexistent IDs, with ownership checked in the procedure lookup itself.
The actual cancel_reservation procedure sets the real Cancelled ID and preserves
approvedBy, including the original approver on an Approved booking. AuditLog records
the cancelling actor. Rejected/Cancelled are terminal; no hard-delete, editing,
rescheduling, reopening or equipment allocation endpoint exists. An unknown commit
outcome never triggers cleanup or retry.

## Audit and role prerequisites

The additive audit migration requires operator-provisioned NOLOGIN, NOSUPERUSER,
NOCREATEROLE, NOCREATEDB, NOREPLICATION, NOBYPASSRLS roles named
`im101_reservation_owner`, `im101_reservation_audit_writer`, and
`im101_reservation_runtime`. These are PostgreSQL roles, not application Role rows.
Runtime must not inherit either privileged role, own protected objects, or have
effective reservation mutation/trigger/TRUNCATE or audit access privileges. The
migration rejects those unsafe runtime grants instead of revoking unrelated grants.
The deployment operator must inspect actual login memberships, schema CREATE rights,
column grants, ownership, default privileges, API exposure and RLS before deployment.
Do not use the database owner or a superuser as the application login.

The audit function runs as a dedicated definer with only audit INSERT/sequence USAGE
and user ID/activity reads. Its search_path is fixed; object references and snapshot
keys are explicit. PUBLIC function execution is revoked in the installation
transaction. Application callers cannot invoke it as an ordinary audit-write API.
No runtime audit SELECT, INSERT, UPDATE, DELETE or TRUNCATE is granted. Any audit
reader role, retention process or privileged correction requires separate review.
Existing management API grants are not broadly changed.

The AFTER ROW trigger records every INSERT, UPDATE (including no-ops), and DELETE.
Snapshots contain exactly reservation_id, facility_id, requested_by, approved_by,
status_id, start_datetime, end_datetime, created_at. Purpose is excluded. Timestamps
use UTC with six fractional digits. INSERT old_value and DELETE new_value are SQL
NULL. changed_at keeps the approved transaction-time default. Audit sequence gaps
are normal after rollback. Audit insertion failures abort the business write.
Rolled-back/failed attempts do not persist an audit row. TRUNCATE and privileged
DDL are not audited by this row trigger and must be denied to runtime.

The actor setting is a trusted backend claim, not independent authentication.
Existing JWT/database-backed RBAC remains required. The trigger checks a canonical
positive PostgreSQL integer actor and an existing active user. Any database caller
with suitable credentials can forge the setting; least-privilege login and procedure
access are essential. Owners/superusers can bypass protections and remain trusted.
No maintenance bypass or default actor is provided. No live statuses are provisioned.

Run isolated verification explicitly with `IM101_TEST_PG_BIN` set to the directory
containing trusted local PostgreSQL 17 binaries, then
`node scripts/test-reservations-postgres.js --local`. It creates a new private test
cluster, binds only 127.0.0.1 on a fresh port, generates SCRAM credentials, verifies
the server data directory, and creates a randomly named disposable database. It
never accepts a connection URL or uses DATABASE_URL. It stops its own cluster and
removes only its marker-verified temporary directory. No installed service is used.
The database fixtures and roles exist only inside that fresh cluster. Ordinary
quality tests do not launch this harness or execute migrations.
