# Campus Facility Management System

An IM101 project for managing campus facilities, equipment, reservations, loans, and maintenance. The V2 backend provides login, protected profile access, role checks, and Buildings CRUD.

The stack is Node.js 24, Express 5, JavaScript (CommonJS), Prisma 7.10.1, and PostgreSQL.

## Folders

- `src/`: the Express app, server, database connection, authentication, and Buildings routes.
- `tests/`: database-free authentication, role, Buildings, and operator-tool tests with controlled fixtures.
- `prisma/`: the approved Prisma schema and V2 initial migration.
- `docs/`: the [professor-approved database design](docs/professor-approved-schema.dbml).
- `scripts/`: quality checks, read-only database/login verification, and operator-only account provisioning and password recovery.
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

Run `npm run quality` for schema validation, formatting, JavaScript syntax, lint checks, and the full automated test suite. `npm test` runs only the database-free tests. `npm run audit` checks dependency advisories.

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

The operator confirmed a successful real System Administrator login against Supabase V2: login HTTP 200, JWT verified, profile HTTP 200, the correct database role, and no password/hash fields in responses. This is operator-reported verification; it was not repeated during the final review. Historical code used bcrypt; `bcryptjs` supports its `$2a$` and `$2b$` hashes in the existing 255-character password column without schema changes. Plaintext and other formats are rejected. Authentication creates no accounts or role assignments. Automated tests use mocked Prisma reads and real bcrypt/JWT operations.

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

## Initial account provisioning (operator only)

This local command is not wired into the server, installation, or migrations. Automated tests use mocks or invoke the CLI without confirmation, which prevents database access. It exposes no registration API. After reviewing and approving the change, an operator can initialize the exact three approved roles and the first System Administrator. Nothing is created until the operator runs the command and types its exact confirmation phrase in an interactive terminal. Piped input and `--yes` are not supported.

First run `npm ci` and `npm run prisma:generate`. Privately verify that `DATABASE_URL` targets the intended Supabase V2 database, uses `sslmode=verify-full`, and has the required read/insert permissions. Set `NODE_EXTRA_CA_CERTS` to the external certificate documented above before starting Node; do not disable TLS verification. This command deliberately refuses weaker SSL modes. No migration or database reset is needed.

The modes are:

- `npm.cmd run provision:initial -- roles`: type `INITIALIZE ROLES` to upsert the approved role names. Existing roles keep their IDs and values, including unrelated roles. Repeating this mode does not create duplicate roles.
- `npm.cmd run provision:initial -- admin`: type `CREATE FIRST ADMINISTRATOR` to ensure those roles and create one active administrator. This mode also initializes roles, so running the roles mode first is optional. It rejects an existing exact email or any existing System Administrator, including an inactive one; it never promotes an existing account, resets a password, or replaces records.

For the first real account, run the following yourself in a trusted, non-recorded PowerShell terminal after approval. Values come from prompts, not command arguments or checked-in files. Use a strong unique password with at least 15 characters and at most 72 UTF-8 bytes. Names are limited to 60 characters and email to 150; surrounding name/email whitespace is removed, passwords are preserved, and email matching stays case-sensitive like login.

```powershell
$env:PROVISION_ADMIN_EMAIL = Read-Host "Administrator email"
$env:PROVISION_ADMIN_FIRST_NAME = Read-Host "First name"
$env:PROVISION_ADMIN_LAST_NAME = Read-Host "Last name"
$provisionPassword = Read-Host "Administrator password" -AsSecureString
$provisionPointer = [IntPtr]::Zero
try {
    $provisionPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($provisionPassword)
    $env:PROVISION_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($provisionPointer)
    npm.cmd run provision:initial -- admin
    # At the command's prompt, type: CREATE FIRST ADMINISTRATOR
} finally {
    if ($provisionPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($provisionPointer)
    }
    $provisionPassword.Dispose()
    Remove-Item Env:PROVISION_ADMIN_PASSWORD, Env:PROVISION_ADMIN_EMAIL, Env:PROVISION_ADMIN_FIRST_NAME, Env:PROVISION_ADMIN_LAST_NAME -ErrorAction SilentlyContinue
}
```

The password exists briefly in the operator process environment and child process memory; use a trusted local session and never echo or persist these variables. The command stores only a bcrypt hash with cost 12 and prints sanitized status messages, never supplied credentials, hashes, connection strings, or raw database errors. Exit code 0 means completion; 1 means refusal or failure. Input and confirmation are checked before the database client is opened. Malformed Unicode is rejected; names and emails also reject control characters. Exactly one `sslmode=verify-full` parameter is required, preventing conflicting duplicate TLS settings.

Role upserts and administrator creation share one Serializable transaction with a 10-second acquisition limit and a 30-second transaction limit; the database adapter also bounds connection/query waits to 10 seconds. Password hashing happens before the transaction starts. Failed transactions roll back their record changes, although PostgreSQL sequences can retain gaps. Concurrent initial-administrator attempts use the same Serializable existence check and insertion; a conflicting attempt must abort rather than create a second administrator. This protects cooperating provisioning transactions, not arbitrary external writes or future administrator-management code. Serialization conflicts are reported without automatic retries; review state before rerunning. If cleanup or connection failure makes the outcome uncertain, verify the database state before retrying. Tests cover simulated concurrent commit conflicts and real Prisma queries through an isolated adapter; actual PostgreSQL write concurrency remains unverified. Existing approved roles keep their IDs and values when creating the first administrator; role initialization need not be rerun first.

### Test a real login after provisioning

From the repository root, run this yourself in a fresh, trusted, non-recorded **PowerShell 7.6.7** terminal (`pwsh` on PATH) with Node.js 24 and dependencies installed:

```powershell
npm.cmd run verify:admin
```

The script uses the trusted CA at `$HOME\Documents\IM101-Backups\supabase-v2-ca.crt` by default. If yours is elsewhere, set `NODE_EXTRA_CA_CERTS` to that private certificate path first. Ensure the private `.env` (or process environment) contains the intended V2 `DATABASE_URL`. At the prompts, enter the V2 project reference obtained independently from its dashboard, then the existing administrator email and password using the private credential prompt. Do not run this through Codex or share credentials, tokens, raw responses, or errors.

`scripts/verify-admin-login.ps1` retains the reviewed verification procedure (PowerShell 7.3+ compatible). It validates the effective Supabase V2 host/user, exactly one `sslmode=verify-full`, and TLS verification before starting the existing backend on a temporary loopback port. It sends exactly one login request and one profile request, verifies the JWT signature, issuer, audience, subject and 15-minute lifetime, checks the System Administrator database role and exact response fields, then stops the server and disconnects automatically. The handlers perform database reads only; no provisioning, schema changes, or record writes occur. Credentials travel through standard input, never command arguments or files. The random JWT secret exists only in the child process and is never written to `.env`.

Exit code 0 means PASS; 1 means refusal or failure. Report only PASS or the sanitized failure stage. A configuration failure requires checking private V2 settings, not disabling TLS. Close the temporary terminal afterward: clearing variables does not guarantee erasure of immutable strings. HTTP is used only on loopback; use HTTPS for non-local deployment.

`/api/auth/me` verifies authentication and reloads the database role. Buildings endpoints now apply the read/write permissions below using the same middleware. Database-free tests cover all approved roles, denials, spoofed claims, and role changes; Buildings permissions have not been tested against live Supabase records. Public deployment still requires login throttling; this foundation has no individual token logout/revocation.

### Existing administrator password recovery

For a forgotten password, follow the [local administrator recovery procedure](docs/administrator-password-recovery.md). `npm.cmd run reset:admin-password` privately prompts for a new password twice and requires an exact confirmation naming the email and V2 project before database access. It refuses missing, inactive or non-administrator accounts and updates only the selected existing user's password hash in a serializable transaction. It does not create administrators, assign roles, expose a public reset API, or invalidate existing JWTs. Failures print sanitized stages; uncertain commit or cleanup outcomes require private verification before retrying. Recovery is manual and is not part of login, installation, tests or migrations.

### Phase 6 dependency security review

The lockfile updates `body-parser` from 2.3.0 to 2.4.0 (compressed-body denial of service) and development-only `fast-uri` from 3.1.8 to 3.1.9 (URI parsing/normalization advisories). The parser's required `qs` dependency also moves from 6.16.0 to 6.16.1. These updates fit the existing dependency ranges; Express and Prisma versions and direct dependency declarations are unchanged. See the upstream [body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828) and [fast-uri advisory](https://github.com/advisories/GHSA-wjr9-j795-jxcr). Use `npm ci` to install the reviewed lockfile and `npm run audit` to check current advisories.

## Buildings API (Phase 7)

Every Buildings request requires `Authorization: Bearer <token>`. JWT verification reloads the current active user and their actual database role before checking permissions. Request bodies, headers and token role claims cannot grant permissions.

| Endpoint                             | Permission               | Success                  |
| ------------------------------------ | ------------------------ | ------------------------ |
| `GET /api/buildings?page=1&limit=20` | All three approved roles | 200: paginated buildings |
| `GET /api/buildings/:id`             | All three approved roles | 200: one building        |
| `POST /api/buildings`                | System Administrator     | 201: created building    |
| `PUT /api/buildings/:id`             | System Administrator     | 200: updated building    |
| `DELETE /api/buildings/:id`          | System Administrator     | 200: deleted building    |

The read roles are `System Administrator`, `Facility/Maintenance Staff`, and `Faculty / Student Organization Representative`. Other roles receive 403. Missing/invalid tokens and inactive/deleted users receive 401. Unexpected database errors return a generic 500 without driver details.

Creation requires `buildingName` and `floorCount`; `locationNote` is optional. For example:

```json
{
    "buildingName": "Science Building",
    "floorCount": 3,
    "locationNote": "Near the main gate"
}
```

Building names are trimmed, nonempty strings of at most 100 Unicode characters. Floor count must be a JSON integer from 1 to 32,767 (positive values within the approved PostgreSQL SmallInt range). Location notes are trimmed strings of at most 150 Unicode characters or `null`; empty notes are allowed, and omission on creation stores `null`. Text rejects malformed Unicode, NUL and other control characters. IDs must be positive decimal integers up to 2,147,483,647; signs, decimals, exponents and leading zeros are rejected. Invalid inputs receive 400. Unknown writable fields, including IDs, roles and nested facilities, are rejected.

`PUT` accepts a nonempty set of supplied fields, validates each one, and preserves omitted fields. For example, `{ "floorCount": 4 }` changes only the floor count, and `{ "locationNote": null }` clears the note. It never creates a missing building. Create, get, update and delete successes return `{ "success": true, "building": { "buildingId", "buildingName", "floorCount", "locationNote" } }` (field names shown here as an outline). These are the only selected Building fields.

List responses contain `success`, `buildings` and `pagination: { page, limit, hasMore }`. Page defaults to 1; limit defaults to 20 and is capped at 100. Both must be positive decimal integers. Duplicate or unknown query parameters and offsets exceeding 2,147,483,647 are rejected with 400. Results are ordered by `buildingId` ascending. The API fetches one extra row to calculate `hasMore`; it does not issue a total-count query. A page beyond available rows returns an empty array. Offset pagination can shift between requests when buildings are added or deleted.

Missing buildings return 404. PostgreSQL's existing unique building-name constraint is the final check for duplicates, including concurrent requests, and produces a safe 409 response. Matching follows the existing database constraint and is case-sensitive. Deletion uses a single Prisma delete and relies on the approved `NO ACTION` foreign key: any referencing facility blocks the delete with 409. This also protects against a concurrent facility insertion. The API never deletes facilities, uses nested deletes, or changes schema/migrations. CRUD statements are atomic database operations; no extra transaction or preliminary existence/duplicate check is needed.

The request path is: Express parses JSON → existing JWT middleware verifies the token and reloads the active user → `requireRoles` checks the stored role → Buildings validates the ID/query/body → Prisma builds the database query → PostgreSQL enforces unique and foreign-key constraints → Express returns a safe JSON result. Automated tests inject mocked Prisma responses while exercising real local HTTP, JWT and RBAC code; they insert no Supabase test records. Additional mocks simulate simultaneous duplicate creates and a facility arriving during deletion, and verify expired-token rejection and that signed role claims cannot grant write access. These mocks verify API behavior, not live PostgreSQL concurrency. Facilities CRUD and live Buildings verification are separate future work. The shared 8 KB JSON body limit and existing 413/415 parser responses still apply.
