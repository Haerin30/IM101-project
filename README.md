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

Start the API separately with `npm start`, a private random `JWT_SECRET`, and the same database/CA configuration. Then use an unrecorded local session to sign in without printing the password or token:

```powershell
$loginCredentials = Get-Credential -Message "Enter the provisioned administrator credentials"
try {
    $loginBody = @{
        email = $loginCredentials.UserName
        password = $loginCredentials.GetNetworkCredential().Password
    } | ConvertTo-Json
    $loginResult = Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/auth/login" -ContentType "application/json" -Body $loginBody
    $profileResult = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/me" -Headers @{ Authorization = "Bearer $($loginResult.token)" }
    $profileResult.user
} finally {
    $loginBody = $null
    $loginResult = $null
    $loginCredentials = $null
}
```

Expect an HTTP 200 profile with the database role `System Administrator` and no password/hash. Keep the JWT private; use HTTPS for any non-local deployment. This task does not run these operator commands or create real accounts.
