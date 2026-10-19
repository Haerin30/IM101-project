# Campus Facility Management System

An IM101 project for managing campus facilities, equipment, reservations, loans, and maintenance. This branch is a clean V2 foundation. Business features have not been rebuilt yet.

The stack is Node.js 24, Express 5, JavaScript (CommonJS), Prisma 7.10.1, and PostgreSQL.

## Folders

- `src/`: the Express app and server; only `GET /api/health` is available.
- `prisma/`: the approved Prisma schema and V2 initial migration.
- `docs/`: the [professor-approved database design](docs/professor-approved-schema.dbml).
- `scripts/`: the JavaScript syntax checker and read-only database check.
- `.github/workflows/`: database-free quality checks for GitHub Actions.

The approved design has 16 application entities, 97 physical fields, and 24 foreign keys. The Prisma schema and V2 migration are preserved unchanged. These setup commands do not apply migrations.

## Install and run

Install Node.js 24, then run:

```sh
npm ci
npm run prisma:generate
npm run dev
```

Open http://localhost:5000/api/health. Use `npm start` to run without automatic restarts. The health endpoint does not access PostgreSQL and does not check database readiness. No database credentials are needed to run it.

Run `npm run quality` for schema validation, formatting, JavaScript syntax, and lint checks.

## Database connection

Keep the V2 Session pooler `DATABASE_URL` in your private local `.env` or process environment. Confirm the Supabase project reference is V2 before running `npm run db:check`. Never commit credentials.

The unchanged `prisma-client-js` generator produces CommonJS-compatible JavaScript in `node_modules/.prisma/client`, exposed through `@prisma/client`. Prisma 7.10.1 uses `@prisma/adapter-pg` and the `pg` driver for PostgreSQL; both are already dependencies. No ESM conversion or schema change is needed.

`src/db.js` exports `getPrisma()`. It loads environment variables quietly and creates one reusable client on first use, with one adapter-owned pool capped at five connections and ten-second connection/query timeouts. Importers share this client through the CommonJS module cache. Callers must catch connection/query failures without exposing raw driver errors and call `await prisma.$disconnect()` when their process finishes using the database.

`npm run db:check` connects, runs only `SELECT 1 AS ok`, and disconnects even after a failure. It prints PASS/FAIL and exits with code 0/1. Failures intentionally omit driver details to protect credentials. It does not read application tables. The Express health endpoint remains independent of this module.

Authentication, roles, equipment, reservations, loans, maintenance, seed data, audit triggers, and stored procedures require new implementation against the approved schema. Run `npm run prisma:generate` after installing dependencies or updating Prisma Client.

The previous implementation, historical migrations, and verification tools remain recoverable from branch `backup/pre-clean-rebuild-20261019`, commit `da28eec`. Keep local environment files and database backups private and separate from Git.

### Local database connection

The backend connects to Supabase PostgreSQL through Prisma.

Before running the backend on Windows, configure the database connection in your private `.env` file.

If Node.js requires the Supabase CA certificate, download the certificate from the Supabase dashboard, save it outside the repository, and set the environment variable in PowerShell:

```powershell
$env:NODE_EXTRA_CA_CERTS = "$HOME\Documents\IM101-Backups\supabase-v2-ca.crt"
```

Then verify the database connection:

```powershell
npm.cmd run db:check
```

Never commit `.env`, database passwords, or private certificate files. Keep TLS certificate verification enabled.