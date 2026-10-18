# Campus Facility Management System

An IM101 project for managing campus facilities, equipment, reservations, loans, and maintenance. This branch is a clean V2 foundation. Business features have not been rebuilt yet.

The stack is Node.js 24, Express 5, JavaScript (CommonJS), Prisma 7.10.1, and PostgreSQL.

## Folders

- `src/`: the Express app and server; only `GET /api/health` is available.
- `prisma/`: the approved Prisma schema and V2 initial migration.
- `docs/`: the [professor-approved database design](docs/professor-approved-schema.dbml).
- `scripts/`: the JavaScript syntax checker.
- `.github/workflows/`: database-free quality checks for GitHub Actions.

The approved design has 16 application entities, 97 physical fields, and 24 foreign keys. The Prisma schema and V2 migration are preserved unchanged. The initial migration is for a new empty V2 database; this setup does not apply migrations or connect to a database.

## Install and run

Install Node.js 24, then run:

```sh
npm ci
npm run dev
```

Open http://localhost:5000/api/health. Use `npm start` to run without automatic restarts. The health endpoint does not access PostgreSQL and does not check database readiness. No database credentials are needed to run it.

Run `npm run quality` for schema validation, formatting, JavaScript syntax, and lint checks. There are no business-feature tests or database integration tests in this foundation.

Authentication, roles, equipment, reservations, loans, maintenance, seed data, audit triggers, and stored procedures require new implementation against the approved schema. Installing dependencies does not generate Prisma Client; generate it when database-backed code is introduced.

The previous implementation, historical migrations, and verification tools remain recoverable from branch `backup/pre-clean-rebuild-20261019`, commit `da28eec`. Keep local environment files and database backups private and separate from Git.
