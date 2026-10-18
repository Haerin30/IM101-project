# V2 backend refactoring checklist

Planning checklist only: the work below is not implemented. Keep the
[approved DBML](professor-approved-schema.dbml), [Prisma schema](../prisma/schema.prisma)
and [V2 baseline](approved-schema-migration.md) unchanged unless a separate change
is approved. Do not restore V1 entities or fields to satisfy old code or tests.

- [ ] **Authentication and roles**
    - Files: `src/auth.js`, `src/auth-store.js`, `src/app.js`, `tests/auth.test.js`.
    - Remove dependency on `AuthSession`/`LoginAttempt` and the old 52-character role label.
    - V2: preserve three-role access control and account checks; use
      `Faculty / Student Organization Representative`. Approve session, logout,
      revocation and rate-limit storage behavior without adding database entities.

- [ ] **Equipment and facilities**
    - Files: `src/controllers/equipment.controller.js`, `src/routes/equipment.routes.js`,
      `src/controllers/facility.controller.js`, `tests/equipment-validation.test.js`.
    - Remove equipment `isActive`, `damagedQuantity` and `EquipmentRepair` assumptions.
    - V2: use approved equipment fields, required condition and optional serial number;
      enforce approved name lengths and facility identity uniqueness. Review stock,
      repair and deactivation behavior before implementing replacements.

- [ ] **Reservations**
    - Files: `src/controllers/reservation.controller.js`, `src/routes/reservation.routes.js`,
      `tests/reservation-validation.test.js`.
    - Remove `blocksSchedule`, single allocation `quantity`, and reliance on the absent
      `transition_reservation` procedure and old exclusion constraint.
    - V2: use reservation status and approved requested/approved quantities and issue/return
      conditions; limit purpose to 255 characters. Approve when stock is held and implement
      concurrent booking protection without adding columns.

- [ ] **Equipment loans and loan items**
    - Files: `src/routes/loan.routes.js`, `tests/integration/workflows.test.js`.
    - Remove header-level equipment, quantity, condition and `checkoutDate` assumptions,
      including the old default of immediately Borrowed loans.
    - V2: keep request/user/approval/due/return/status data in `EquipmentLoan`; store
      equipment, quantity and conditions in `LoanItem`. Preserve the Pending default;
      approve multi-item approval/return rules and make stock changes transactional.

- [ ] **Maintenance requests and maintenance logs**
    - Files: `src/controllers/maintenance.controller.js`, `src/routes/maintenance.routes.js`,
      `tests/maintenance.test.js`, `tests/integration/historical-maintenance.js`.
    - Remove request-level `resolutionNotes` and old physical table-name assumptions.
    - V2: record work in `MaintenanceLog.actionTaken`, related request, optional staff
      and logged time. Preserve role/ownership controls and review assignment,
      resolution and history rules against the approved nullable fields.

- [ ] **Auditing and database procedures**
    - Files: `src/validation.js`, reservation/maintenance controllers,
      `src/prisma.js`, `scripts/preflight.js`; archived SQL is reference only.
    - Remove reliance on old audit table-name strings, V1 raw SQL, absent triggers
      and stored procedures. The V2 `audit_logs` table does not audit automatically.
    - V2: review compatible procedures/triggers, before/after audit records, actor
      attribution, history reads and stock integrity; rewrite or retire V1 preflight.
      Approve FK actions and database access policies separately. No credentials in audits.

- [ ] **Seed data**
    - Files: `prisma/seed.js`, `src/auth.js`, `tests/seed.test.js`, `prisma7.config.ts`.
    - Remove the old role label and any V1 data assumptions. Do not run the current seed on V2.
    - V2: create approved lookup values and separately authorized accounts; keep repeat
      runs from resetting passwords, roles or activity. Match approved field lengths
      and never copy V1 test records automatically.

- [ ] **Tests and CI**
    - Files: `tests/*.test.js`, `tests/helpers.js`, `tests/integration/workflows.test.js`,
      `hardening.js`, `historical-maintenance.js` in that integration folder,
      `.github/workflows/quality-check.yml`, `package.json`.
    - Replace archived migration paths, mixed-case SQL tables and removed entity/field assertions.
    - V2: test the one active baseline and approved workflows in isolated PostgreSQL
      test schemas/databases. Keep Code Quality checks and audit; never use Supabase
      for CI. Keep `scripts/verify-local-v2-schema.ps1` for its separate read-only local check.

Manual review before coding: authentication storage, stock/repair/deactivation rules,
reservation quantity timing, multi-item loan returns, maintenance transitions,
`NO ACTION` referential policy and database security. Complete items only after the
replacement behavior and relevant tests are verified. Preserve historical archives
and distinguish static schema checks from actual database/application test results.
