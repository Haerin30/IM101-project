# Approved schema realignment: Task B2 review draft

## Status and authorization

Prepared for review only. No database connection, SQL execution, migration run,
Prisma command, cancellation, database test, commit or push was performed in
Task B2. Do not execute these files until the owner approves testing/execution.
The live Supabase database and `im101_restore_test` must remain untouched under
the present authorization. Rehearse later on a separately restored staging copy.

Source of truth: `professor-approved-schema.dbml` and `../prisma/schema.prisma`.
The target has 16 application entities, 97 physical fields, 24 FKs, 16 primary
keys (two composite), nine unique indexes and six nonunique indexes. Prisma's
`_prisma_migrations` is infrastructure, not an application entity.

## Prepared files and active history

The active `prisma/migrations` sequence is now:

1. `20260927063702_init/migration.sql` (unchanged bytes).
2. `20261004052212_split_user_name/migration.sql` (unchanged bytes).
3. `20261019010000_approved_schema_realignment/migration.sql` (new draft).

The four formerly pending files were moved unchanged to
`migration-archive/old-backend-hardening/`, outside Prisma's active migration path.
Their old SQL remains historical source, not deployable prerequisites. The
archive's `source-checksums.json` records the original SHA-256 source bytes and
locations, including the two applied files, the configuration, provider lock,
Task A schema and DBML. Local hashes are not evidence of live database access.

`prisma7.config.ts` still uses `prisma/migrations`, the existing seed path and
PostgreSQL datasource configuration. `migration_lock.toml` remains PostgreSQL.
Neither configuration nor provider was changed. No new migration tool or
Supabase CLI history is introduced.

The owner reports only the first two migrations applied in the known retained
environments (Supabase and the restored backup). Reconfirm this immediately
before any later execution. If another retained environment has applied any
archived file, stop: it needs a separately reviewed forward reconciliation path.
Do not edit its checksums, delete history rows, mark archived SQL applied, reset
its database or silently switch its migration lineage.

The draft checks both original migration names, completion state and source
checksums, accepting the preserved LF/CRLF representations. It allows Prisma's
own current in-progress record while requiring exactly two other completed
original entries. It compares those original rows internally before/after and
never writes `_prisma_migrations`. Only Prisma should record successful execution
of the realignment migration later; do not run it manually and then pretend
Prisma already recorded it. Failed-attempt metadata must be investigated before
retrying, rather than repaired automatically.

## Execution gates: deliberately unset

The migration requires these custom PostgreSQL settings in the same database
session that will execute it. None has been configured or used by Task B2:

| Setting | Required value or decision |
| --- | --- |
| `im101.schema_realignment_approved` | `yes`, only after execution approval |
| `im101.no_action_approved` | `yes`, only after final FK policy approval |
| `im101.migration_profile` | `legacy_restore` or `empty_replay` |
| `im101.user_created_at_timezone` | Reviewed PostgreSQL timezone name for existing user creation values |

Session settings can be supplied by a trusted operator through an approved
same-session runner or supported direct/session connection startup settings.
Do not assume a setting on one connection reaches another connection used by
Prisma. Do not use a transaction pooler, put credentials in SQL, or remove the
guards to make a test pass. A failed guard aborts the transaction before data or
schema transformations. The settings are technical gates, not substitutes for
actual user approval. No runnable deployment command is prescribed at this stage.

### Timezone interpretation still requiring clarification

The owner approved UTC for the known reservation start/end wall-clock values.
The SQL uses explicit `AT TIME ZONE 'UTC'`, not session-dependent casts, and
preserves those original wall-clock representations in its before/after check.

That approval did not establish the timezone of existing `User.createdAt` values.
The draft refuses to guess: `legacy_restore` requires an explicit, independently
reviewed timezone. A server/session timezone by itself does not prove the
historical convention. User creation wall-clock values and the selected
interpretation are recorded as non-secret initialization provenance. If reliable
evidence supports UTC, approve and configure UTC explicitly; otherwise stop and
resolve the interpretation before testing on populated data.

Other converted timestamp columns belong to asserted-empty loans, maintenance
and audit tables; UTC conversion there changes types without interpreting any
historical rows. `empty_replay` has no user dates to interpret either.

## Preconditions and transaction behavior

The entire schema/data transformation is enclosed in an explicit transaction and
a PL/pgSQL block. It sets bounded lock/statement timeouts and locks all original
application tables before reading the preservation snapshots. Unexpected
conditions raise redacted exceptions and roll back all changes in that
transaction. Sequence allocations can leave gaps on rollback; no test should
require gapless audit IDs. Existing application sequence values are not reset.

Both profiles require exactly the original 14 public application tables and
their exact original columns after the name split. Unknown public tables,
extension-owned public tables, columns, user-defined application triggers,
timestamp representations, migration history or checksums cause a stop for
review. Managed Supabase schemas outside `public` are not modified. This strict
baseline is intentional; do not broaden it without reviewing the actual drift.

`legacy_restore` requires:

- Three users, three canonical roles, one facility, one equipment record and two
  reservations.
- The one equipment record is exactly `Projector`, total 15 and available 15.
- Reservations 1 and 2 are still Pending; the migration never cancels them.
- Zero loans, maintenance requests, reservation-equipment rows and audit rows.
- The original long third-role label exists exactly once and the approved new
  label is not an additional fourth role.
- Every existing value fits its approved varchar length after the approved role
  correction. Values, especially password hashes, are not logged on overflow.
- Facility identity uniqueness and smallint floor ranges are valid.

The empty-table checks protect every removed legacy payload column, including
loan equipment/quantity/condition/checkout fields, allocation notes and request
resolution notes. If any rows appear, stop. This draft intentionally does not
guess loan request times, approved quantities, repair histories or maintenance
events for an inventory that differs from the reviewed empty tables.

`empty_replay` requires every original application table to be empty, including
lookups and facility assignments. It supports a fresh installation after the two
original migrations; it is not an alternative for bypassing populated-data
checks. No users, roles or fictitious business events are seeded by this profile.

## Transformations and preservation evidence

The new SQL uses explicit table and column renames. It preserves IDs, table data
and sequence ownership, aligns sequence/primary-key/index names, replaces the
original 21 FKs with the 24 approved FKs and adds only the two approved missing
tables: `loan_items` and `maintenance_logs`.

It corrects the existing third-role row to
`Faculty / Student Organization Representative` (45 characters) before narrowing
the field to varchar(50). The role ID and all user role references remain intact.
It does not deactivate users, reset passwords or create replacement roles.

Approved missing fields are added with their native types, nullability and
defaults. Optional historical metadata remains NULL (serial number, location
note, assignment shift/end date, approved quantities and condition fields).
`condition_status` stays required with default Good; its existing value is
preserved. Equipment activity/damage fields, schedule flags, auth tables and
repair tables are never introduced. No existing table is dropped or recreated.

Internally, the migration snapshots every original application row and the two
original migration records. At the end it reconstructs the original row shapes
from the renamed target columns, reversing only the approved role label and
timestamp representation for comparison. Any difference aborts the transaction.
This checks all user IDs and password hashes, lookup rows, assignments, facilities,
equipment quantities and reservation details without exposing credentials.
Snapshots exist only in PL/pgSQL memory and are never placed in audit payloads,
settings, files, notices or result sets.

### Initialization timestamp policy

For existing populated records lacking reliable historical metadata, newly added
required timestamps receive the transaction's actual initialization time:

| Target field | Reviewed rows | Meaning |
| --- | --- | --- |
| `users.updated_at` | 3 | Metadata tracking initialized; prior last-update time is unknown |
| `facilities.created_at` | 1 | Initialization marker; historical creation time is unknown |
| `equipment.created_at` | 1 | Initialization marker; historical creation time is unknown |
| `reservations.created_at` | 2 | Initialization marker; historical creation time is unknown |

These values must not be presented as verified historical creation/update dates.
The approved schema has no separate provenance columns, so the approved audit
table records seven `INITIALIZE` events with explicit policy text, affected IDs,
NULL historical metadata and the initialized values. `INITIALIZE` is ten
characters, within the approved varchar(10). These are actual migration metadata
events, not fabricated repairs, approvals, reports or historical user actions.
`changed_by` is NULL to identify the migration operation rather than inventing a
staff actor. No credential fields enter those audit payloads.

One additional `UPDATE` audit event records the actual role-label correction.
Consequently the reviewed restore has eight audit rows immediately after
realignment, not zero. `empty_replay` generates none. All seven new timestamp
values use the same transaction timestamp, retain approved defaults for future
inserts, and `updated_at` has no automatic-update trigger or Prisma `@updatedAt`.

The migration is not a workflow-hardening migration. It adds no CHECK/exclusion
constraints, custom triggers, procedures, RLS policies or grants beyond the
approved structural keys and FKs. Existing grants/policies/dependencies must be
reviewed in staging; do not enable application or public Data API access to new
tables without a separately approved security design. Task C must port necessary
workflow, stock and audit protections before application deployment.

## Proposed NO ACTION policy: final approval pending

All 24 relationships use nondeferrable `ON UPDATE NO ACTION ON DELETE NO ACTION`.
Nothing executes unless the final FK policy approval gate is explicitly set.
This replaces the original CASCADE-on-update and optional SET-NULL-on-delete
behavior. Nullable FKs still accept NULL, but do not automatically become NULL
when a referenced row is deleted.

| Relationship group | Legitimate workflows affected or preserved |
| --- | --- |
| Users to roles | Role label edits work; changing/deleting a referenced role ID is blocked |
| Facilities to buildings/types | Editing metadata works; deleting a referenced building/type requires an explicit retention/reassignment decision |
| Equipment to category/home facility | Equipment relocation to another existing facility works; deleting a home facility no longer clears its equipment references automatically |
| Reservations to facility/requester/approver/status | Cancellation by changing the child status reference works; deleting referenced history actors/facilities/statuses is blocked |
| Reservation-equipment to both parents | Allocation child changes remain possible; deleting a parent with items is blocked |
| Loan headers to borrower/approver | Return/status updates remain possible; deleting a referenced user is blocked |
| Loan items to loan/equipment | Child records can reference existing parents; deleting a loan/equipment with items is blocked |
| Facility assignments to facility/staff | Reassignment/end-date operations work; referenced parent deletion is blocked |
| Maintenance requests to optional facility/equipment/reporter/assignee | Eligible reassignment and relocation workflows can work; removing assets/users no longer silently nulls historical references |
| Maintenance logs to request/optional staff | Appending work logs works; deleting referenced requests/staff is blocked |
| Audit logs to optional actor | Audit attribution is retained; referenced actor deletion no longer clears attribution |

User deactivation through the approved `users.is_active` remains possible.
Facility soft deactivation through approved `facilities.status` remains possible.
Equipment has no approved independent activity flag: Task C must resolve that
workflow rather than forcing physical deletion or restoring `is_active`.
Changing primary keys is intentionally blocked while referenced. These effects
need final approval, especially any requirement for deleting users/assets.

## Separate cancellation draft

`../scripts/sql/cancel-approved-test-reservations.sql` is outside the migration
path and must run only after separately approved realignment and separate
cancellation authorization. It is prepared specifically for the before-Task-C
state without custom reservation/audit triggers. It refuses unexpected triggers
to prevent duplicate audits or unreviewed side effects.

The purposes, facility IDs, exact UTC schedules and actor ID were not supplied,
so no values are guessed. After read-only staging review, configure these
same-session settings with independently verified values:

- `im101.cancellation_approved`: `yes` only after separate approval.
- `im101.cancel_actor_id`: existing active System Administrator ID.
- `im101.cancel_purpose_1`, `im101.cancel_purpose_2`: exact purpose text.
- `im101.cancel_facility_1`, `im101.cancel_facility_2`: exact facility IDs.
- `im101.cancel_start_1`, `im101.cancel_end_1`, `im101.cancel_start_2`,
  `im101.cancel_end_2`: exact timestamps, with explicit `+00:00` offsets.

The script requires exactly the two reviewed Pending reservations, empty
commitments, Projector 15/15 stock and eight realignment audit events. It locks
the relevant tables and rows, looks up status IDs by unique names, verifies the
independent expectations, updates only status IDs, inserts two full reservation
before/after audit snapshots attributed to the approved actor, and checks exactly
two updates plus two audit inserts. It compares every other reservation field
and equipment/loan/allocation snapshot before committing.

Missing/mismatched settings, an inactive actor, missing status lookup, changed
inventory or any preservation failure aborts the whole cancellation transaction.
Repeated execution after cancellation fails the Pending check without adding
events. Purposes, facility/requester/approver IDs, scheduled times and initialized
creation times stay unchanged. Historical overlap remains; no reservation is
deleted. Audit count becomes ten after cancellation. The migration itself still
leaves both reservations Pending.

## Verification plan: not yet run

1. Obtain approval for testing, NO ACTION and the user-created timezone. Confirm
   the retained environment inventory. Compare preserved source hashes to the
   archive manifest. Do not modify the two applied files to match a database.
2. Restore the verified backup again into a NEW local staging database, for
   example `im101_approved_schema_stage_test`. Leave `im101_restore_test` alone.
   Keep staging API writes stopped. Do not reuse a shared/production connection.
3. After authorization, use `review-legacy-realignment-inputs.sql` read-only on
   that staging copy. Save reviewed IDs, role labels and reservation expectations
   without exporting credentials. Inspect actual grants, RLS, triggers, functions,
   dependent views and sequence ownership/state. Metadata counts alone do not
   establish schema parity or timezone provenance.
4. Recheck the exact inventory and all length/range guards. Review the new SQL,
   especially the explicit conditional role correction, removals protected by
   empty-table assertions and timezone expression. Do not create an ad hoc
   baseline or run the archived files.
5. Only after separate execution approval, supply the same-session gates and
   rehearse the new active Prisma sequence using `legacy_restore`. Let Prisma
   record the new migration. The SQL's private equality assertions verify the
   original user IDs/hashes and migration rows before commit, without printing
   them. Hash equality cannot be independently inferred from row counts alone.
6. Set `im101.verification_phase` to `before_cancel` on a read-only verification
   connection and run `verify-approved-schema.sql`. Its discrepancy queries must
   return no rows, all `matches`/boolean checks must be true, and the phase must
   be selected. Expected counts are 16/97/24, 3 users, 1 facility, 1 equipment,
   2 Pending reservations, zero business child/history rows, and 8 audit rows.
   The index comparison checks ordered columns, validity, uniqueness, primary
   keys, no unexpected indexes and ordinary nonpartial btree structure. The FK
   comparison checks actual endpoints, validation and the proposed actions.
7. Compare user IDs to the recorded baseline; independently verify credential
   equality inside trusted tooling if requested, returning only a mismatch count
   or boolean. Never print password hashes or serialize user snapshots to logs.
   Verify Projector IDs/relationships/conditions and 15/15 counts, unchanged
   reservation purposes/facilities/schedules, original migration IDs/checksums/
   timestamps and unchanged original migration files. Verify sequence ownership
   and that next generated IDs cannot collide; do not reset sequences blindly.
8. After separate cancellation approval, configure the exact reviewed inputs and
   rehearse cancellation on staging only. Use verification phase `after_cancel`:
   reservations 1 and 2 still exist as Cancelled, exactly two new attributable
   audit events changed only status, audit count is 10, stock remains 15/15.
9. After testing authorization, rehearse negative cases on separate disposable
   fixtures: absent approval gates; mismatched checksums/history; unexpected
   rows in removable-column tables; varchar overflow; duplicate facilities;
   unknown timestamp representation/timezone; changed purposes/facilities/times;
   missing/inactive cancellation actor; already-cancelled reservations. Verify
   transactional rollback, not just error messages. Do not corrupt the backup.
10. Rehearse a fresh empty database through the original two files, then the new
    migration with `empty_replay`. Do not insert users before the original split
    migration, which has no historical name backfill. Verify the same target
    structure with zero seeded records and no fabricated initialization events.
11. Task C must update the backend, seed, preflight and tests for this schema
    before normal quality/integration suites or deployment readiness are claimed.
    Existing integration fixtures refer to archived migration names and old
    entities/fields, and cannot validate this new path unchanged. No tests have
    been run in Task B2, including SQL parsing or database integration tests.

If a migration fails, keep writers stopped, preserve diagnostics without secrets
and inspect schema plus migration state. SQL transaction rollback does not erase
Prisma's separately recorded failed-attempt metadata. Any later resolve/retry is
a separately reviewed action after proving rollback. Never mark failed SQL
applied. After success, prefer a reviewed forward fix; rolling back only the old
API is incompatible. A backup recovery rehearsal must reconcile any subsequent
writes rather than silently losing them.

## Remaining review items

- Final NO ACTION update/delete policy approval.
- Original user creation timestamp timezone (reservation UTC is already approved).
- Exact cancellation purposes, facility IDs, UTC schedules and authorized actor.
- Separate authorization to test/execute on a new local staging copy.
- Task C authentication storage, stock/lifecycle behavior, routine/audit/security
  implementation and deployment coordination, without restoring unapproved data
  entities or columns.

References: [Prisma migration histories](https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/migration-histories),
[PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html),
[PostgreSQL session settings](https://www.postgresql.org/docs/17/sql-set.html).
