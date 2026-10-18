# IM101 Campus Facility Management System

This BSIT project helps a campus manage rooms and equipment, reserve facilities,
record equipment loans, assign facility staff, and track maintenance work and
changes. It supports administrators, maintenance staff, and faculty/student
organization representatives.

## Technology stack

Node.js 24, Express, JavaScript/CommonJS, Prisma 7.10.1, and PostgreSQL hosted on
Supabase. The frontend is planned; this repository currently contains the backend.

## Start here: Supabase V2

The project is rebuilding around the professor-approved Revision 2 design:
**16 application tables, 97 physical fields, and 24 foreign keys**.

- [Approved database design (DBML)](docs/professor-approved-schema.dbml)
- [Matching Prisma schema](prisma/schema.prisma)
- [V2 setup and migration instructions](docs/approved-schema-migration.md)
- [Backend refactoring checklist](docs/v2-backend-refactor-checklist.md)

The only active migration is
[`20261019020000_supabase_v2_init`](prisma/migrations/20261019020000_supabase_v2_init/migration.sql).
It creates a fresh database structure; it does not import V1 records or add seed
accounts. Static schema/SQL checks passed. Its successful application to local
`im101_v2_schema_test` was reported by the project owner; direct catalog
verification remains pending because local authentication was unavailable during
review. The [static report](docs/supabase-v2-static-validation.json) is not proof
of a successful Supabase deployment.

For a read-only check of that local database, use
[`scripts/verify-local-v2-schema.ps1`](scripts/verify-local-v2-schema.ps1).
It prompts for credentials and is restricted to `127.0.0.1:5432/im101_v2_schema_test`.
No Supabase V2 deployment is verified by this documentation cleanup.

Use Node.js 24 and `npm ci` to install dependencies. Before running migrations,
follow the V2 setup document and obtain the required approval. Keep database
credentials private and outside version control.

## Main folders

| Location                             | What it contains                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `src/`                               | Backend application. `server.js` starts it; `app.js` connects its parts.                 |
| `src/routes/`                        | API addresses, such as reservations and equipment.                                       |
| `src/controllers/`                   | Code that handles requests and calls the database.                                       |
| `prisma/`                            | Target schema, active V2 migration, provider lock, and seed script awaiting refactoring. |
| `scripts/`                           | Developer checks, the local schema verifier, and the old V1 preflight script.            |
| `tests/`                             | Automated tests and helpers; V1-dependent cases need updating.                           |
| `.github/workflows/`                 | GitHub Actions checks, including the Code Quality job.                                   |
| `docs/`                              | Approved design, current setup, checklist, and verification evidence.                    |
| `docs/migration-archive/`            | Preserved V1 SQL and retired migration drafts; never run them on V2.                     |
| `.agents/`, `.claude/`, `.windsurf/` | AI assistant instructions and tool links; not backend features.                          |

`package.json` lists commands and dependencies; `package-lock.json` fixes their
versions. `prisma7.config.ts` tells Prisma where the schema and migrations are.
Ignored `node_modules/` and `tmp/` are local dependency/scratch material, not
application source; local database backups or clusters must be preserved.

## Backend compatibility: work still required

**Do not start the existing backend or run the seed against V2 yet.** Authentication
still uses removed session/login-attempt tables. Equipment uses removed activity
and repair fields. Reservations depend on an old schedule flag and procedure.
Loans still store item details on the loan header. Maintenance still stores
resolution notes on the request instead of maintenance logs.

The role label, auditing, seed, preflight, tests and CI also need review. The V2
baseline creates tables and keys, but does not install the old workflow triggers,
stored procedures or automatic auditing. Track this work in the
[V2 backend checklist](docs/v2-backend-refactor-checklist.md); do not restore
unapproved tables or fields to make old code pass.

## Historical V1 material

V1 and its backup are preserved separately. Its six migrations and retired B2
scripts are indexed in the [historical archive](docs/migration-archive/README.md).
The [old backend-hardening guide](docs/backend-hardening-deployment.md) is historical
reference only. Its deployment commands and V1 assumptions are not V2 instructions.
Do not copy archived SQL into the active migration folder or reset V1 history.
