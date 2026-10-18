# Supabase V2: fresh professor-approved database baseline

## Scope and current status

This setup is exclusively for the NEW, empty Supabase V2 PostgreSQL database.
It is not an upgrade, repair, squash or baseline operation on Supabase V1.
Preserve V1, its database migration history and the verified backup separately.
No V1 test reservations, users, credentials, timestamps or inventory are copied
to V2. The retired reservation-cancellation draft is not part of V2 setup.

Preparation only: neither Supabase project nor any local database was contacted.
No SQL was executed and no migration was applied. The schema and DBML were not
modified. No real credentials were generated or stored.

The only active migration is:

`prisma/migrations/20261019020000_supabase_v2_init/migration.sql`

The PostgreSQL provider lock and `prisma7.config.ts` remain unchanged; the active
path is still `prisma/migrations`. The existing configured seed is not ready for
V2 and must not be run as part of this setup.

## Baseline structure

| Property                           | Generated SQL                    |
| ---------------------------------- | -------------------------------- |
| Application tables / Prisma models | 16                               |
| Approved physical columns          | 97                               |
| Foreign keys                       | 24                               |
| Primary keys                       | 16, including two composite keys |
| Unique indexes                     | 9                                |
| Additional nonunique indexes       | 6                                |

Tables are `roles`, `facility_types`, `equipment_categories`,
`reservation_status`, `users`, `buildings`, `facilities`, `equipment`,
`reservations`, `reservation_equipment`, `equipment_loans`, `loan_items`,
`facility_staff_assignments`, `maintenance_requests`, `maintenance_logs`, and
`audit_logs`.

All physical names follow the approved snake_case mappings. The SQL includes
approved varchar limits, smallint floor fields, date fields, JSONB audit fields,
`fname`/`lname` as varchar(60), separate loan items and maintenance logs, and the
approved keys, defaults and indexes. There are no authentication, login-attempt
or repair persistence tables, nor any additional application columns.

Prisma manages its normal `_prisma_migrations` infrastructure separately. This
table is not one of the 16 application tables and is not manually created in the
baseline SQL. Supabase-managed system schemas likewise do not count as these
16 application entities and must not be removed to make a count match.

The migration creates structure only. It inserts no accounts, roles, lookup
values, business events, initialization events, test records or audit events.
Those records require separately reviewed seed/application work.

## Generation and database-free validation

The installed Prisma CLI version is 7.10.1. Its help confirms support for an empty
datamodel to schema-file diff. The actual generation used:

```text
node node_modules/prisma/build/index.js migrate diff --from-empty --to-schema prisma/schema.prisma --script --config prisma7.config.ts --output prisma/migrations/20261019020000_supabase_v2_init/migration.sql
```

No datasource or migrations-directory input was used, so no database or shadow
database was required. CLI configuration was loaded with a process-only,
noncredential, loopback port-1 placeholder for `DATABASE_URL`, preventing a real
configured URL from being used. No connection was made. Update/skills checks
were disabled for these invocations. The file is the unmodified generated SQL.

Database-free Prisma format check and schema validation passed. An in-memory
static comparison checked the generated SQL against every DBML column, native
type, nullability, default, primary key, unique index, ordinary index and FK
endpoint. It also checked the 16-model mapped field inventory and absence of
unapproved entities, DML and a manually created Prisma history table.
See [the static result](supabase-v2-static-validation.json), which includes the
SQL SHA-256 and per-table column counts.

Static checks are not database execution tests. PostgreSQL application, catalog
verification, permissions, Supabase deployment and application workflows have
not been tested or verified. No backend test result is claimed.

## Preserved historical migration sequences

All six original V1 migrations are preserved outside the active path:

- The initial migration and name split are in `migration-archive/supabase-v1/`.
- The four old pending hardening migrations remain in
  `migration-archive/old-backend-hardening/`.

Their SQL bytes and original directory names are preserved. The never-executed
Task B2 realignment SQL, its documentation and its three review/cancellation SQL
scripts are in `migration-archive/retired-realignment/`. None belongs to V2.
The archive index explains their original purposes and locations. Historical
documents may contain paths and commands referring to their former locations;
they are reference only and must not be followed for V2.

`migration-archive/v2-transition-checksums.json` maps the preserved files and
records the unchanged Prisma schema, DBML, configuration and provider lock.
The earlier B2 checksum manifest remains historical evidence of its then-current
paths. Do not edit V1 database history to match the new V2 active directory.
When maintaining V1 later, use its historical code/migration lineage separately.

## Interpretations and remaining risks

The unchanged reviewed Prisma schema specifies `timestamptz(6)` and nondeferrable
`ON UPDATE NO ACTION ON DELETE NO ACTION` on all 24 FKs. No new referential
business rules were silently added during generation. The earlier final-policy
approval question for NO ACTION remains a deployment review item unless the
owner has separately accepted it. Deleting or changing referenced parent IDs
will be blocked; optional child references are not automatically nulled. Existing
child reference changes, including reassignment, remain possible when the new
parent exists. `users.updated_at` defaults to now on insert only, without an
automatic-update trigger.

The generated SQL is not explicitly wrapped in BEGIN/COMMIT. A later deployment
failure may leave partial objects plus a failed Prisma migration entry. Inspect
and recover only under separate approval; do not reset or drop either Supabase
database automatically. No `IF NOT EXISTS` wrappers were added around tables to
hide an unexpectedly nonempty application schema.

The backend is currently incompatible with this baseline. Task C must refactor
auth-session/rate-limit storage, the 45-character approved third-role label and
seed, normalized loans, requested/approved reservation quantities, maintenance
logs, inventory behavior, raw SQL, preflight and integration fixtures. Do not
run the old seed: it still contains the 52-character role label. Do not start the
current backend against V2 or restore removed entities just to satisfy old tests.

The audit table alone does not provide automatic auditing. Triggers, stored
procedures, audit attribution/history access, stock synchronization, concurrency
protection, booking overlaps, lifecycle rules, grants and RLS/Data API exposure
require separate IM101 implementation/security review. The baseline does not
copy old routines that depended on unapproved fields or tables.

## Later application procedure: requires approval, not performed

1. Approve the baseline SQL, the retained schema interpretations and a local
   execution rehearsal. Keep V1 and its backup unchanged.
2. Rehearse on a NEW disposable empty local PostgreSQL database first. Verify
   16 application tables, 97 physical columns, 24 FKs, all keys/indexes/defaults,
   zero business rows and the one new successful Prisma migration record.
3. Obtain separate authorization for V2 access/deployment. Independently verify
   the Supabase project identity and that its application schema is empty, with
   no V1 tables or migration history. Do not infer this from the name of an env
   variable. Preserve Supabase's managed system schemas.
4. Supply only V2's protected migration connection through the operator's secure
   environment. Use a supported direct/session connection, not a transaction
   pooler. Do not commit, print or paste credentials into SQL or documentation.
5. Confirm `prisma/migrations` contains only the new V2 migration and its provider
   lock. Never copy any archived SQL back into the active path. Do not mark the
   V1 migrations applied in V2 or run a reset, db push or V1 reconciliation script.
6. After deployment approval, the intended command is:

    ```text
    npx prisma migrate deploy --config prisma7.config.ts
    ```

    This command is documented for later use only; it was not run during
    preparation. Do not manually execute the SQL and then falsely mark it applied.

7. Verify migration status and actual catalog/data counts on V2 under that
   authorization. Stop on an unexpected target or failed/partial migration and
   review recovery before retrying.
8. Complete and verify Task C, review IM101 procedures/triggers/auditing and
   database access policies, and approve lookup/account provisioning separately
   before enabling application use. Do not run the retired cancellation script.
