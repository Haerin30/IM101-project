# Archived unapplied backend-hardening migrations

> V2 update: the original two migrations and the Task B2 realignment draft are
> now archived too. This folder remains historical source. See the
> [archive index](../README.md) and [V2 setup](../../approved-schema-migration.md).

These four SQL files are historical source, not deployable migrations for the
professor-approved schema. They were moved here without editing their bytes:

- `20261018010000_integrity/migration.sql`
- `20261018020000_maintenance_audit/migration.sql`
- `20261018030000_maintenance_integrity/migration.sql`
- `20261018040000_equipment_lifecycle/migration.sql`

The owner reports that none was applied in the known retained environments:
Supabase and the local restored backup. No database was contacted to confirm that
claim during Task B2. If an additional retained environment has applied any of
them, stop and design its forward reconciliation path. Do not remove or alter
that environment's recorded history, mark these migrations applied, or use reset.

`source-checksums.json` records SHA-256 hashes before moving files. It also records
the two unchanged applied migration files, the unchanged Prisma configuration,
provider lock, Task A schema and approved DBML. These are filesystem evidence,
not database verification. Original LF/CRLF variants are accepted explicitly in
the replacement SQL's original-migration checksum guards.

During Task B2 the active Prisma directory contained the original two migrations
and its review draft; V2 now replaces that active sequence entirely. Keep this
archive outside `prisma/migrations`; renaming an
old folder inside the active directory would not prevent Prisma from discovering
its SQL. Preserve `prisma/migrations/migration_lock.toml` with provider PostgreSQL.

The archive includes old audit, stock, authentication and workflow routines.
They were deliberately not copied blindly into the target migration. Porting
compatible protections belongs to Task C and must not restore unapproved tables
or columns. See [the migration review plan](../../approved-schema-migration.md).
