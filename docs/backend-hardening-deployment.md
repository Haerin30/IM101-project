# Backend hardening deployment and recovery

> Historical deployment instructions for the superseded backend-hardening design.
> Do not execute this migration sequence against Supabase V2. The old database
> and its backup remain separate. See the
> [V2-only baseline setup](approved-schema-migration.md) and
> [historical migration archive](migration-archive/README.md).

No shared Supabase inspection or migration was performed while implementing this change.
The local integration suite uses a separate loopback PostgreSQL database and random schemas.
Production data quality and applied migration history remain unverified until an approved operator inspects them.

## What changed and why

Maintenance progression now requires an assigned, active Facility/Maintenance Staff user.
The API checks this before both transitions, and a PostgreSQL trigger rechecks under a
shared user-row lock. Deactivation or role changes serialize with those checks. A user may
still be deactivated after a transition commits; the next transition is blocked until an
eligible staff member is assigned. Staff/admin can reassign Open and In Progress requests,
including historical In Progress requests that have no assignee. No row-wide assignment
constraint rejects old In Progress or Resolved records. The trigger requires an assignee
on every new transition, then checks eligibility under the same user-row lock.
Resolution needs nonblank notes and a timestamp. Resolved rows cannot be updated or deleted.
Reporting identity, asset references, and reported time are immutable. All maintenance
requests are retained; the API still enforces role and reporter ownership restrictions.

When both asset IDs are supplied, creation checks equipment's homeFacilityId. A known
home must match; null means portable/unassigned and is accepted. This is checked again by
a database trigger on insert. Later equipment relocation does not rewrite old reports.
No maintenance endpoint changes equipment location, inventory, or facility availability.

Equipment gains isActive (default true), independent of physical condition. DELETE is
soft deactivation and keeps the physical condition. PUT may set isActive to a boolean;
reactivation of unknown legacy condition requires a verified Good/Fair/Damaged condition
in the same update or beforehand. New equipment always defaults active; create does not
accept isActive. Inactive equipment cannot consume stock for loans or reservation items.
Returning loans, releasing bookings and recording repairs continue using existing stock
triggers. Deactivation with outstanding commitments remains forbidden.

Legacy conditionStatus='Inactive' becomes isActive=false and conditionStatus=NULL.
NULL explicitly represents unknown historical physical condition; it is allowed only
while inactive. This avoids inventing a Good/Fair/Damaged condition. The existing audit
trigger records the conversion, including the original Inactive value; changedBy is null
for migration work unless an operator supplied valid actor context. Staff must inspect
these assets and document reliable condition evidence before setting a real condition.
No loans, reservations, repairs or audit records are deleted, and no new entities are added.

## Required migration order

The compatibility fix updates the pending maintenance integrity migration. The
configured database is remote and was not accessed. The isolated local test cluster
has no application migration history; application environments remain unverified.
Before deploying, check `_prisma_migrations` in an approved environment. If the
original maintenance integrity migration has already finished there, do not deploy
this edited file over it or alter its recorded checksum: prepare a reviewed forward
migration that drops `maintenance_assigned` and replaces `maintenance_guard()` with
the transition checks in this version. A forward migration alone cannot fix the
original preflight failure on databases where the original migration is still pending.

Never edit an applied migration. The repository order is:

1. 20260927063702_init
2. 20261004052212_split_user_name
3. 20261018010000_integrity
4. 20261018020000_maintenance_audit
5. 20261018030000_maintenance_integrity (new constraints and workflow/history trigger)
6. 20261018040000_equipment_lifecycle (new field, nullable unknown physical condition,
   audited legacy conversion, replacement equipment_guard/change_stock functions)

Both new migrations use explicit transactions and acquire table locks before preflight.
They fail and roll back on invalid fields or resolution metadata instead of silently
correcting it. Missing historical assignments, currently ineligible historical staff,
and differences from equipment's current location are warnings, not blockers.
No maintenance rows or existing audit records are changed by the maintenance migration.
The original integrity migration also fails on invalid dates, overlaps, quantities, or
unreconciled stock; the original audit migration depends on its audit_change function.
The new migrations do not replace these prerequisites or assume Supabase has them.

## Approved operator procedure

Do not run these steps against shared Supabase until the owner explicitly approves.

1. Schedule a maintenance window and stop API writes/background jobs. New database
   constraints reject old application deactivation behavior; deploy database and code together.
2. Take a verified backup including schema, functions/triggers, migration history and data.
   Restore it into a separate staging database and prove recovery before changing production.
3. Use Node 24 and npm ci. Configure a protected DATABASE_URL using a supported direct or
   session connection for migrations, not a transaction pooler. Never paste credentials
   into committed files, shell command arguments, reports or logs.
4. Run npx prisma migrate status --config prisma7.config.ts. Inspect _prisma_migrations,
   pending/failed entries, actual columns, constraints and triggers. If schema exists but
   Prisma migration history does not match, stop and reconcile/baseline with a DBA after
   proving exact schema parity. Do not mark missing migrations as applied merely to proceed.
5. Separately set PREFLIGHT_DATABASE_URL in the process environment for the database being
   reviewed and run node scripts/preflight.js. The script never loads .env or falls back
   to DATABASE_URL; it runs a repeatable-read, read-only transaction and prints IDs/check
   names, legacy inactive equipment IDs, and migration metadata, never passwords/hashes.
   The report separates issues (blocking errors) from warnings (historical differences).
   Only issues cause nonzero exit; warnings must be reviewed without automatic repair.
   Nonzero exit or missing tables requires review. It reports data issues but does not
   prove full schema parity or replace migration status/backup verification.
6. Review every incompatible row. Reconcile outstanding stock from actual loans,
   reservations and damage; never invent availability. Resolve maintenance fields,
   priorities and incomplete resolution metadata against evidence. Missing historical
   assignments, currently inactive/ineligible assignees, and differences between a report
   location and equipment's present location are review warnings, not migration blockers.
   Preserve these historical values. Do not invent assignments or rewrite old facility IDs.
   Historical In Progress requests may receive eligible staff assignment; only new status
   transitions require an eligible active assignee. Resolved requests stay immutable.
   If resolved records cannot satisfy constraints without falsifying history, stop deployment
   and agree an explicit data reconciliation strategy. Record approved corrections in
   existing audit infrastructure, with actor context, before retrying. Do not fabricate notes,
   dates, assignees, or physical conditions to make preflight pass.
7. Rehearse all pending migrations and application smoke tests on the restored staging
   database. With approval and production writes still paused, run:

    ```text
    npx prisma migrate deploy --config prisma7.config.ts
    npx prisma generate --config prisma7.config.ts
    npx prisma migrate status --config prisma7.config.ts
    ```

8. Deploy this version, verify health/login/RBAC, facility/equipment reads, maintenance
   creation/assignment/progression/resolution/history, and rejected inactive stock requests.
   Check audit actor IDs and run preflight again. Resume writes only after verification.
   Do not seed accounts as part of deployment or run migrate dev, migrate reset, or db push.

## Failure and recovery

On preflight or SQL failure keep writes paused. Explicit transactions roll back schema/data
changes from that individual new migration, not earlier successfully applied migrations.
Inspect both PostgreSQL catalog and _prisma_migrations before retrying. If a failed migration
is confirmed fully rolled back and its data blocker is corrected, an approved operator may
run npx prisma migrate resolve --rolled-back MIGRATION_NAME --config prisma7.config.ts,
then migrate deploy. Never use --applied for SQL that did not actually finish.

After success prefer a reviewed forward fix. Rolling back only the API is incompatible
with the new condition constraint. Do not drop isActive, coalesce unknown conditions to
Good, disable guards, remove audit records, or reverse the legacy conversion without an
approved reconciliation plan. If full recovery is needed, restore the verified backup into
a separate database, validate it, and coordinate connection/application rollback; reconcile
any post-backup writes rather than silently losing them. Preserve the failed system and
logs for diagnosis. The old migration files remain unchanged.

## Verification

Use npm run quality, npm run audit, and npm run test:integration. Integration tests require
TEST_DATABASE_URL for loopback PostgreSQL with a database name ending in _test, never the
shared DATABASE_URL. Tests apply all migrations to random schemas and cover direct-SQL
integrity, atomic rollback on bad legacy data, null-condition conversion/auditing, assignment
eligibility, ownership/RBAC, asset matching, inactive equipment, loans/returns/repairs,
reservations, stock protection, and persistent authentication. GitHub Actions retains the
Code Quality job, Node 24, PostgreSQL 16 service, client generation, and audit steps.
