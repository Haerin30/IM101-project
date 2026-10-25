# Reservation workflow: offline development and deployment contract

This work is not deployed. Never apply these migrations through the normal quality
suite or against live Supabase without separate operator authorization. The approved
DBML, Prisma schema and original V2 migration remain unchanged.

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
