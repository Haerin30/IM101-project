# Core modules: provisional policy and deployment contract

These features are local/offline development artifacts, not a live deployment.
The approved DBML, Prisma schema, original migration and six reservation migrations
are immutable. All new SQL uses separate additive migrations. No live statuses,
roles, credentials, grants, or database records are provisioned by development.

## Equipment loans

GET /api/loans lists bounded, paginated history; GET /api/loans/:id includes only
approved loan/item scalars. Representatives see their own requests; administrators
and maintenance staff may review all. POST /api/loans accepts dueDate and up to 50
unique `{ equipmentId, quantity }` items. Identity comes from authentication.
Dates must be explicit timezone-aware timestamps with millisecond precision;
PROVISIONAL maximum loan horizon is 90 days. Only exact Good equipment is eligible.

POST /:id/approve, /reject, and /return are administrator/staff operations with no
self-review, including self-recorded returns. Approval/rejection bodies are empty.
Return requires exactly all original item IDs with conditionIn Good or Damaged.
Partial returns are not representable by the approved loan-level return_date and
are deferred. Rejected/Returned are terminal; history has no deletion/edit endpoint.

A database BEFORE trigger, not a JavaScript stock calculation, performs approval
and return inventory updates. Equipment rows lock by ascending ID in one Serializable
transaction. Duplicate transitions cannot adjust stock twice. The database refuses
out-of-range quantities. Conditions at issue come from locked equipment. Returns
restore quantity; PROVISIONAL damaged returns mark the whole equipment pool Damaged
until an administrator clears it, because the schema has one condition per pool.

All these review, return, eligibility and horizon policies require final instructor
approval. Runtime actor context is a trusted backend claim, never independent JWT
verification. Existing JWT/database-backed RBAC remains mandatory. New context lookup
locks current user/role and exposes no password/email/contact fields.

## Deployment roles

Fresh NOLOGIN/NOSUPERUSER/NOCREATEROLE/NOCREATEDB/NOREPLICATION/NOBYPASSRLS roles
im101_core_owner, im101_core_runtime, im101_core_audit_writer are explicit operator
prerequisites. They must not inherit other roles or own existing public tables.
Core routine ownership has narrowly scoped loan/item/inventory and user/role-lock
permissions; secure search_path and qualified references are fixed. PUBLIC routine
execution is revoked. No normal core runtime DELETE privilege is granted. Existing
reservation ownership and grants are not modified. Operator review must bind the
actual backend login to the needed roles and retain existing authentication and
management permissions. Do not use a database owner login. Existing equipment CRUD
write permissions are a trusted backend boundary; direct credential access is not
equivalent to authorization through HTTP. Hosted effective grants, role memberships,
PUBLIC/default privileges, RLS and Data API exposure require separate live approval.
