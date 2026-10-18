# Migration archive: V1 and retired realignment drafts

This directory is OUTSIDE Prisma's active migration path. All SQL here is
historical reference, never input to Supabase V2 deployment. The old Supabase
database and its history were not accessed, changed or baselined during V2 work.

## Original six-migration V1 sequence

| Original directory name                | Preserved location                                                         | Historical purpose                                                     |
| -------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `20260927063702_init`                  | `supabase-v1/20260927063702_init/migration.sql`                            | Original 14-table application schema; applied on V1 according to owner |
| `20261004052212_split_user_name`       | `supabase-v1/20261004052212_split_user_name/migration.sql`                 | Applied V1 full-name split; preserve without rewriting                 |
| `20261018010000_integrity`             | `old-backend-hardening/20261018010000_integrity/migration.sql`             | Unapplied hardening, legacy stock/workflows, extra persistence tables  |
| `20261018020000_maintenance_audit`     | `old-backend-hardening/20261018020000_maintenance_audit/migration.sql`     | Unapplied maintenance audit trigger relying on old functions           |
| `20261018030000_maintenance_integrity` | `old-backend-hardening/20261018030000_maintenance_integrity/migration.sql` | Unapplied maintenance constraints and legacy compatibility             |
| `20261018040000_equipment_lifecycle`   | `old-backend-hardening/20261018040000_equipment_lifecycle/migration.sql`   | Unapplied extra equipment lifecycle state                              |

Original SQL contents and directory names are unchanged. Do not use the V2
configuration/active history to maintain V1. Its historical lineage and backup
must remain separate; no database history rows need to be deleted or rewritten.

## Retired Task B2 artifacts

`retired-realignment/` preserves uncommitted preparation work that is no longer
needed for an empty V2 rebuild:

- `20261019010000_approved_schema_realignment/migration.sql`
- `approved-schema-migration.md`
- `scripts/sql/cancel-approved-test-reservations.sql`
- `scripts/sql/review-legacy-realignment-inputs.sql`
- `scripts/sql/verify-approved-schema.sql`

These files were moved without editing their contents. Their relative links and
historical command paths describe their former locations. Their guards and
assumptions are for the proposed V1 data migration, not V2. In particular, do not
cancel any original reservations or import initialization/audit data into V2.

## Integrity and current setup

`v2-transition-checksums.json` records SHA-256 file hashes and old/new locations
for all six original SQL files and the five retired draft artifacts. It also
records the unchanged approved Prisma schema, DBML, configuration and provider
lock. Source checksums are not proof of database state or database execution.
`old-backend-hardening/source-checksums.json` remains the earlier B2 evidence;
some of its then-active paths have now been archived.

The current setup is [the V2-only baseline](../approved-schema-migration.md).
The active migration directory must contain only
`20261019020000_supabase_v2_init/migration.sql` and `migration_lock.toml`.
