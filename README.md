# IM101 Campus Facility Management System

Express and JavaScript/CommonJS backend using Prisma 7.10.0 and PostgreSQL
hosted on Supabase. The React frontend is planned.

## Local setup

Use Node.js 24 and run `npm ci`. Create a local `.env` with your development
`DATABASE_URL`; never commit credentials. `npm start` starts the API and
`npm run dev` starts it with nodemon. Database setup and client generation
are separate from quality checks. Do not run seeds or migrations against
a shared database without reviewing their effects.

## Code quality

Run `npm run quality` before requesting review. It runs these mandatory checks:

| Command                   | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `npm run prisma:validate` | Validate the schema with the installed Prisma CLI                 |
| `npm run format:check`    | Check Prettier and Prisma formatting without rewriting files      |
| `npm run check:syntax`    | Parse backend, seed, tooling, and test JavaScript                 |
| `npm run lint`            | Run ESLint's recommended rules for CommonJS, plus strict equality |
| `npm test`                | Run Node's built-in test runner                                   |

Run `npm run format` to fix formatting. Prisma formatting changes whitespace;
it does not apply migrations. Prettier excludes generated files, migrations,
lockfiles, and third-party agent skills. Prisma formats its own schema.
The existing Prisma configuration file is tooling, not a migration of the
JavaScript backend to TypeScript.

The initial tests exercise the real equipment controller with a stubbed Prisma
dependency. They test existing validation, field whitelisting, and safe error
responses without loading `.env` or connecting to any database. They are not
HTTP integration tests and do not prove reservation rules or database integrity.
Authentication, RBAC, and reservation conflict prevention remain future work.

GitHub Actions keeps the required job name **Code Quality**. Missing scripts,
lint errors, formatting differences, syntax errors, or failing tests fail the job.
CI uses a dummy database URL for offline schema checks and needs no Supabase
secrets. A clean installation and the same quality commands run on Node.js 24.

## Local-only files

Keep scratch request payloads under `requests/`, `tmp/`, or in files ending in
`.request.json`. These paths and the legacy `reservation.json` are ignored.
Keep intentional, non-sensitive test fixtures under `tests/fixtures/` instead.
Environment files, dependencies, generated clients, coverage, and logs are ignored.
