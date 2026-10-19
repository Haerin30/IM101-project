# Campus Facility Management System

An IM101 project for managing campus facilities, equipment, reservations, loans, and maintenance. This branch adds minimal login and protected profile access to the clean V2 foundation.

The stack is Node.js 24, Express 5, JavaScript (CommonJS), Prisma 7.10.1, and PostgreSQL.

## Folders

- `src/`: the Express app, server, database connection, and authentication.
- `tests/`: database-free HTTP authentication tests with controlled fixtures.
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

Set a private `JWT_SECRET` containing at least 32 bytes of cryptographically random secret material in `.env` or the process environment before starting. No default secret is provided; invalid configuration prevents startup. Open http://localhost:5000/api/health. Use `npm start` to run without automatic restarts. The health endpoint does not access PostgreSQL and does not check database readiness.

Run `npm run quality` for schema validation, formatting, JavaScript syntax, lint checks, and authentication tests. `npm test` runs only the database-free tests. `npm run audit` checks dependency advisories.

## Database connection

Keep the V2 Session pooler `DATABASE_URL` in your private local `.env` or process environment. Confirm the Supabase project reference is V2 before running `npm run db:check`. Never commit credentials.

The unchanged `prisma-client-js` generator produces CommonJS-compatible JavaScript in `node_modules/.prisma/client`, exposed through `@prisma/client`. Prisma 7.10.1 uses `@prisma/adapter-pg` and the `pg` driver for PostgreSQL; both are already dependencies. No ESM conversion or schema change is needed.

`src/db.js` exports `getPrisma()`. It loads environment variables quietly and creates one reusable client on first use, with one adapter-owned pool capped at five connections and ten-second connection/query timeouts. Importers share this client through the CommonJS module cache. Callers must catch connection/query failures without exposing raw driver errors and call `await prisma.$disconnect()` when their process finishes using the database.

`npm run db:check` connects, runs only `SELECT 1 AS ok`, and disconnects even after a failure. It prints PASS/FAIL and exits with code 0/1. Failures intentionally omit driver details to protect credentials. It does not read application tables. The Express health endpoint remains independent of this module.

Equipment, reservations, loans, maintenance, seed data, audit triggers, and stored procedures require new implementation against the approved schema. Run `npm run prisma:generate` after installing dependencies or updating Prisma Client.

## Authentication

`POST /api/auth/login` accepts JSON `{ "email": "student@example.test", "password": "example-password" }`. Email matching follows the existing unique database field (case-sensitive, with surrounding input whitespace removed). Passwords are never trimmed and must fit bcrypt's 72-byte limit.

Successful responses contain `success`, a `token`, `tokenType: "Bearer"`, `expiresIn: 900`, and `user` with only `userId`, `fname`, `lname`, `email`, and `role: { roleId, roleName }`. Incorrect credentials, inactive users, and unsupported stored hashes receive the same generic 401 response. Invalid input receives 400; internal failures receive a generic 500 without raw database errors.

The approved roles are `System Administrator`, `Facility/Maintenance Staff`, and `Faculty / Student Organization Representative`. Login and profile responses retrieve the actual role through the existing `User.role` relationship; authentication does not assign roles or hardcode role names. Test role IDs are fixture values, not production assignments. For example, a representative's profile can contain:

```json
{
    "userId": 7,
    "fname": "Test",
    "lname": "Representative",
    "email": "representative@example.test",
    "role": {
        "roleId": 3,
        "roleName": "Faculty / Student Organization Representative"
    }
}
```

Bodies larger than 8 KB receive 413; unsupported JSON charsets or content encodings receive 415. Error responses omit parser and database details. The server loads `.env` before reading `PORT` and reports listen failures with a generic message and unsuccessful exit status.

Send `Authorization: Bearer <token>` to `GET /api/auth/me`. It returns `{ "success": true, "user": { ... } }` with the same safe profile fields. Tokens use HS256, a fixed issuer/audience, a user ID subject, and a 15-minute lifetime. The reusable `authenticate` middleware returned by `createAuth` validates tokens and reloads the current active user and role. Authentication responses use `Cache-Control: no-store`.

The read-only V2 inspection found no users. Historical code used bcrypt; `bcryptjs` supports its `$2a$` and `$2b$` hashes in the existing 255-character password column without schema changes. Plaintext and other formats are rejected. No accounts, registration, or role assignment are created here. Automated tests use mocked Prisma reads and real bcrypt/JWT operations; real-user login remains unverified until a separately authorized account-provisioning task.

Keep `JWT_SECRET` private and use HTTPS in deployment. Tokens are bearer credentials and have no individual logout/revocation mechanism in this foundation; rotating the secret invalidates all tokens. Login throttling is still required before public deployment. The dummy password comparison reduces trivial user-existence timing differences but does not guarantee identical timings across stored bcrypt costs. See the upstream [bcrypt documentation](https://github.com/dcodeIO/bcrypt.js) and [JWT documentation](https://github.com/auth0/node-jsonwebtoken).

The previous implementation, historical migrations, and verification tools remain recoverable from branch `backup/pre-clean-rebuild-20261019`, commit `da28eec`. Keep local environment files and database backups private and separate from Git.

## Role checks

`createAuth({ getPrisma, jwtSecret })` also returns `requireRoles(allowedRoles)`. Supply a nonempty array of exact role names when defining a route. It authenticates the bearer token and reloads the current active user and role before checking permission, so it can be mounted directly without a separate `authenticate` call. It returns 401 for failed authentication and 403 with a generic `Access denied.` message when the database role is not permitted. Database failures flow to the app's existing safe error handler.

The middleware uses `roleName`, never a fixed role ID or role sent in a token, header, body, or query string. Multiple allowed names are supported, with no implicit administrator bypass. Invalid configuration throws during route setup, and the middleware copies the allowed list so later array changes do not alter permissions. Tests use isolated Express routes and mocked database reads; no production demonstration routes or business permission matrix are added. Future modules must explicitly choose their permitted roles and enforce any record-level ownership rules.

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
