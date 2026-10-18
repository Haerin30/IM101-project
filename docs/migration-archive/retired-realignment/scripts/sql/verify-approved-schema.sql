-- REVIEW DRAFT: read-only verification, not executed or tested.
-- Run on an approved local staging copy only, after execution is separately authorized.
-- Set im101.verification_phase to before_cancel, after_cancel or empty_replay.
-- Every matches/passed value must be true; empty discrepancy result sets are expected.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL statement_timeout = '60s';
SET LOCAL TIME ZONE 'UTC';
SELECT current_database() AS database_name, current_setting('transaction_read_only') AS read_only,
    current_setting('im101.verification_phase',true) IN ('before_cancel','after_cancel','empty_replay') AS phase_selected;

-- Exact table set, including unexpected public application tables.
WITH expected(table_name) AS (VALUES ('roles'), ('facility_types'), ('equipment_categories'), ('reservation_status'), ('users'), ('buildings'), ('facilities'), ('equipment'), ('reservations'), ('reservation_equipment'), ('equipment_loans'), ('loan_items'), ('facility_staff_assignments'), ('maintenance_requests'), ('maintenance_logs'), ('audit_logs')),
actual AS (SELECT c.relname::text AS table_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations')
SELECT COALESCE(e.table_name,a.table_name) AS table_name,
    CASE WHEN e.table_name IS NULL THEN 'unexpected' ELSE 'missing' END AS discrepancy
FROM expected e FULL JOIN actual a USING(table_name) WHERE e.table_name IS NULL OR a.table_name IS NULL;

-- Exact 97 columns, physical types, nullability, lengths, precision and defaults.
WITH expected(table_name,column_name,udt_name,nullable,max_length,time_precision,default_kind,default_value) AS (
VALUES
    ('roles', 'role_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('roles', 'role_name', 'varchar', false, 50, NULL, 'none', NULL),
    ('facility_types', 'facility_type_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('facility_types', 'type_name', 'varchar', false, 50, NULL, 'none', NULL),
    ('equipment_categories', 'category_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('equipment_categories', 'category_name', 'varchar', false, 50, NULL, 'none', NULL),
    ('reservation_status', 'status_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('reservation_status', 'status_name', 'varchar', false, 30, NULL, 'none', NULL),
    ('users', 'user_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('users', 'role_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('users', 'fname', 'varchar', false, 60, NULL, 'none', NULL),
    ('users', 'lname', 'varchar', false, 60, NULL, 'none', NULL),
    ('users', 'email', 'varchar', false, 150, NULL, 'none', NULL),
    ('users', 'password_hash', 'varchar', false, 255, NULL, 'none', NULL),
    ('users', 'id_number', 'varchar', true, 30, NULL, 'none', NULL),
    ('users', 'contact_number', 'varchar', true, 20, NULL, 'none', NULL),
    ('users', 'is_active', 'bool', false, NULL, NULL, 'boolean', NULL),
    ('users', 'created_at', 'timestamptz', false, NULL, 6, 'now', NULL),
    ('users', 'updated_at', 'timestamptz', false, NULL, 6, 'now', NULL),
    ('buildings', 'building_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('buildings', 'building_name', 'varchar', false, 100, NULL, 'none', NULL),
    ('buildings', 'floor_count', 'int2', false, NULL, NULL, 'none', NULL),
    ('buildings', 'location_note', 'varchar', true, 150, NULL, 'none', NULL),
    ('facilities', 'facility_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('facilities', 'building_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('facilities', 'facility_type_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('facilities', 'facility_name', 'varchar', false, 100, NULL, 'none', NULL),
    ('facilities', 'floor_number', 'int2', false, NULL, NULL, 'none', NULL),
    ('facilities', 'capacity', 'int4', false, NULL, NULL, 'none', NULL),
    ('facilities', 'status', 'varchar', false, 20, NULL, 'string', 'Available'),
    ('facilities', 'created_at', 'timestamptz', false, NULL, 6, 'now', NULL),
    ('equipment', 'equipment_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('equipment', 'category_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('equipment', 'home_facility_id', 'int4', true, NULL, NULL, 'none', NULL),
    ('equipment', 'equipment_name', 'varchar', false, 100, NULL, 'none', NULL),
    ('equipment', 'serial_number', 'varchar', true, 60, NULL, 'none', NULL),
    ('equipment', 'total_quantity', 'int4', false, NULL, NULL, 'none', NULL),
    ('equipment', 'available_quantity', 'int4', false, NULL, NULL, 'none', NULL),
    ('equipment', 'condition_status', 'varchar', false, 20, NULL, 'string', 'Good'),
    ('equipment', 'created_at', 'timestamptz', false, NULL, 6, 'now', NULL),
    ('reservations', 'reservation_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('reservations', 'facility_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('reservations', 'requested_by', 'int4', false, NULL, NULL, 'none', NULL),
    ('reservations', 'approved_by', 'int4', true, NULL, NULL, 'none', NULL),
    ('reservations', 'status_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('reservations', 'purpose', 'varchar', false, 255, NULL, 'none', NULL),
    ('reservations', 'start_datetime', 'timestamptz', false, NULL, 6, 'none', NULL),
    ('reservations', 'end_datetime', 'timestamptz', false, NULL, 6, 'none', NULL),
    ('reservations', 'created_at', 'timestamptz', false, NULL, 6, 'now', NULL),
    ('reservation_equipment', 'reservation_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('reservation_equipment', 'equipment_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('reservation_equipment', 'quantity_requested', 'int4', false, NULL, NULL, 'none', NULL),
    ('reservation_equipment', 'quantity_approved', 'int4', true, NULL, NULL, 'none', NULL),
    ('reservation_equipment', 'condition_at_issue', 'varchar', true, 20, NULL, 'none', NULL),
    ('reservation_equipment', 'condition_at_return', 'varchar', true, 20, NULL, 'none', NULL),
    ('equipment_loans', 'loan_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('equipment_loans', 'user_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('equipment_loans', 'approved_by', 'int4', true, NULL, NULL, 'none', NULL),
    ('equipment_loans', 'requested_at', 'timestamptz', false, NULL, 6, 'now', NULL),
    ('equipment_loans', 'due_date', 'timestamptz', false, NULL, 6, 'none', NULL),
    ('equipment_loans', 'return_date', 'timestamptz', true, NULL, 6, 'none', NULL),
    ('equipment_loans', 'loan_status', 'varchar', false, 15, NULL, 'string', 'Pending'),
    ('loan_items', 'loan_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('loan_items', 'equipment_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('loan_items', 'quantity', 'int4', false, NULL, NULL, 'none', NULL),
    ('loan_items', 'condition_out', 'varchar', true, 20, NULL, 'none', NULL),
    ('loan_items', 'condition_in', 'varchar', true, 20, NULL, 'none', NULL),
    ('facility_staff_assignments', 'assignment_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('facility_staff_assignments', 'facility_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('facility_staff_assignments', 'staff_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('facility_staff_assignments', 'assigned_role', 'varchar', false, 30, NULL, 'string', 'Custodian'),
    ('facility_staff_assignments', 'shift', 'varchar', true, 15, NULL, 'none', NULL),
    ('facility_staff_assignments', 'assigned_date', 'date', false, NULL, NULL, 'date', NULL),
    ('facility_staff_assignments', 'unassigned_date', 'date', true, NULL, NULL, 'none', NULL),
    ('maintenance_requests', 'request_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('maintenance_requests', 'facility_id', 'int4', true, NULL, NULL, 'none', NULL),
    ('maintenance_requests', 'equipment_id', 'int4', true, NULL, NULL, 'none', NULL),
    ('maintenance_requests', 'reported_by', 'int4', true, NULL, NULL, 'none', NULL),
    ('maintenance_requests', 'assigned_staff_id', 'int4', true, NULL, NULL, 'none', NULL),
    ('maintenance_requests', 'description', 'text', false, NULL, NULL, 'none', NULL),
    ('maintenance_requests', 'priority', 'varchar', false, 10, NULL, 'string', 'Normal'),
    ('maintenance_requests', 'status', 'varchar', false, 20, NULL, 'string', 'Open'),
    ('maintenance_requests', 'reported_at', 'timestamptz', false, NULL, 6, 'now', NULL),
    ('maintenance_requests', 'resolved_at', 'timestamptz', true, NULL, 6, 'none', NULL),
    ('maintenance_logs', 'log_id', 'int4', false, NULL, NULL, 'sequence', NULL),
    ('maintenance_logs', 'request_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('maintenance_logs', 'staff_id', 'int4', true, NULL, NULL, 'none', NULL),
    ('maintenance_logs', 'action_taken', 'text', false, NULL, NULL, 'none', NULL),
    ('maintenance_logs', 'logged_at', 'timestamptz', false, NULL, 6, 'now', NULL),
    ('audit_logs', 'log_id', 'int8', false, NULL, NULL, 'sequence', NULL),
    ('audit_logs', 'table_name', 'varchar', false, 50, NULL, 'none', NULL),
    ('audit_logs', 'record_id', 'int4', false, NULL, NULL, 'none', NULL),
    ('audit_logs', 'action_type', 'varchar', false, 10, NULL, 'none', NULL),
    ('audit_logs', 'changed_by', 'int4', true, NULL, NULL, 'none', NULL),
    ('audit_logs', 'old_value', 'jsonb', true, NULL, NULL, 'none', NULL),
    ('audit_logs', 'new_value', 'jsonb', true, NULL, NULL, 'none', NULL),
    ('audit_logs', 'changed_at', 'timestamptz', false, NULL, 6, 'now', NULL)
), actual AS (
    SELECT table_name,column_name,udt_name,is_nullable='YES' AS nullable,
        character_maximum_length AS max_length,datetime_precision AS time_precision,column_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations'
), compared AS (
    SELECT COALESCE(e.table_name,a.table_name) AS table_name,COALESCE(e.column_name,a.column_name) AS column_name,
        e.table_name IS NOT NULL AND a.table_name IS NOT NULL
        AND e.udt_name=a.udt_name AND e.nullable=a.nullable
        AND e.max_length IS NOT DISTINCT FROM a.max_length
        AND (e.time_precision IS NULL OR e.time_precision=a.time_precision)
        AND CASE e.default_kind
          WHEN 'none' THEN a.column_default IS NULL
          WHEN 'sequence' THEN a.column_default LIKE 'nextval(%'
          WHEN 'now' THEN lower(a.column_default) IN ('now()','current_timestamp')
          WHEN 'date' THEN lower(a.column_default)='current_date'
          WHEN 'boolean' THEN a.column_default='true'
          WHEN 'string' THEN a.column_default=quote_literal(e.default_value)||'::character varying'
          ELSE false END AS matches
    FROM expected e FULL JOIN actual a USING(table_name,column_name)
)
SELECT * FROM compared WHERE matches IS DISTINCT FROM true ORDER BY table_name,column_name;

-- Exact primary keys, unique indexes and ordinary indexes, with ordered columns.
WITH expected(table_name,key_kind,column_list) AS (
VALUES
    ('roles', 'primary', 'role_id'),
    ('roles', 'unique', 'role_name'),
    ('facility_types', 'primary', 'facility_type_id'),
    ('facility_types', 'unique', 'type_name'),
    ('equipment_categories', 'primary', 'category_id'),
    ('equipment_categories', 'unique', 'category_name'),
    ('reservation_status', 'primary', 'status_id'),
    ('reservation_status', 'unique', 'status_name'),
    ('users', 'primary', 'user_id'),
    ('users', 'unique', 'email'),
    ('users', 'unique', 'id_number'),
    ('buildings', 'primary', 'building_id'),
    ('buildings', 'unique', 'building_name'),
    ('facilities', 'primary', 'facility_id'),
    ('facilities', 'unique', 'building_id,facility_name,floor_number'),
    ('equipment', 'primary', 'equipment_id'),
    ('equipment', 'unique', 'serial_number'),
    ('reservations', 'primary', 'reservation_id'),
    ('reservations', 'index', 'facility_id,start_datetime,end_datetime'),
    ('reservations', 'index', 'requested_by'),
    ('reservation_equipment', 'primary', 'reservation_id,equipment_id'),
    ('equipment_loans', 'primary', 'loan_id'),
    ('loan_items', 'primary', 'loan_id,equipment_id'),
    ('loan_items', 'index', 'equipment_id'),
    ('facility_staff_assignments', 'primary', 'assignment_id'),
    ('facility_staff_assignments', 'index', 'facility_id,staff_id'),
    ('maintenance_requests', 'primary', 'request_id'),
    ('maintenance_requests', 'index', 'status'),
    ('maintenance_logs', 'primary', 'log_id'),
    ('audit_logs', 'primary', 'log_id'),
    ('audit_logs', 'index', 'table_name,record_id')
), actual AS (
    SELECT t.relname::text AS table_name,
        CASE WHEN i.indisprimary THEN 'primary' WHEN i.indisunique THEN 'unique' ELSE 'index' END AS key_kind,
        (SELECT string_agg(a.attname,',' ORDER BY k.ord) FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ord)
         JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum WHERE k.ord<=i.indnkeyatts) AS column_list,
        i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
            AND am.amname='btree' AND i.indnatts=i.indnkeyatts AS ordinary_valid
    FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_class ix ON ix.oid=i.indexrelid JOIN pg_am am ON am.oid=ix.relam
    WHERE n.nspname='public' AND t.relname<>'_prisma_migrations'
)
SELECT COALESCE(e.table_name,a.table_name) AS table_name,
    COALESCE(e.key_kind,a.key_kind) AS key_kind,COALESCE(e.column_list,a.column_list) AS column_list,
    CASE WHEN e.table_name IS NULL THEN 'unexpected' WHEN a.table_name IS NULL THEN 'missing'
         ELSE 'invalid, partial, expression, included-column or non-btree index' END AS discrepancy
FROM expected e FULL JOIN actual a USING(table_name,key_kind,column_list)
WHERE e.table_name IS NULL OR a.table_name IS NULL OR NOT a.ordinary_valid;

-- Exact 24 foreign-key targets, validation and proposed nondeferrable NO ACTION.
WITH expected(source_table,source_column,target_table,target_column) AS (
VALUES
    ('users', 'role_id', 'roles', 'role_id'),
    ('facilities', 'building_id', 'buildings', 'building_id'),
    ('facilities', 'facility_type_id', 'facility_types', 'facility_type_id'),
    ('equipment', 'category_id', 'equipment_categories', 'category_id'),
    ('equipment', 'home_facility_id', 'facilities', 'facility_id'),
    ('reservations', 'facility_id', 'facilities', 'facility_id'),
    ('reservations', 'requested_by', 'users', 'user_id'),
    ('reservations', 'approved_by', 'users', 'user_id'),
    ('reservations', 'status_id', 'reservation_status', 'status_id'),
    ('reservation_equipment', 'reservation_id', 'reservations', 'reservation_id'),
    ('reservation_equipment', 'equipment_id', 'equipment', 'equipment_id'),
    ('equipment_loans', 'user_id', 'users', 'user_id'),
    ('equipment_loans', 'approved_by', 'users', 'user_id'),
    ('loan_items', 'loan_id', 'equipment_loans', 'loan_id'),
    ('loan_items', 'equipment_id', 'equipment', 'equipment_id'),
    ('facility_staff_assignments', 'facility_id', 'facilities', 'facility_id'),
    ('facility_staff_assignments', 'staff_id', 'users', 'user_id'),
    ('maintenance_requests', 'facility_id', 'facilities', 'facility_id'),
    ('maintenance_requests', 'equipment_id', 'equipment', 'equipment_id'),
    ('maintenance_requests', 'reported_by', 'users', 'user_id'),
    ('maintenance_requests', 'assigned_staff_id', 'users', 'user_id'),
    ('maintenance_logs', 'request_id', 'maintenance_requests', 'request_id'),
    ('maintenance_logs', 'staff_id', 'users', 'user_id'),
    ('audit_logs', 'changed_by', 'users', 'user_id')
), actual AS (
    SELECT st.relname::text AS source_table,sa.attname::text AS source_column,
        tt.relname::text AS target_table,ta.attname::text AS target_column,
        c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
            AND c.confupdtype='a' AND c.confdeltype='a'
            AND cardinality(c.conkey)=1 AND cardinality(c.confkey)=1 AS approved_policy
    FROM pg_constraint c JOIN pg_class st ON st.oid=c.conrelid JOIN pg_class tt ON tt.oid=c.confrelid
    JOIN pg_namespace n ON n.oid=st.relnamespace JOIN pg_namespace tn ON tn.oid=tt.relnamespace
    JOIN pg_attribute sa ON sa.attrelid=st.oid AND sa.attnum=c.conkey[1]
    JOIN pg_attribute ta ON ta.attrelid=tt.oid AND ta.attnum=c.confkey[1]
    WHERE c.contype='f' AND n.nspname='public' AND tn.nspname='public'
)
SELECT COALESCE(e.source_table,a.source_table) AS source_table,
    COALESCE(e.source_column,a.source_column) AS source_column,
    COALESCE(e.target_table,a.target_table) AS target_table,
    COALESCE(e.target_column,a.target_column) AS target_column,
    CASE WHEN e.source_table IS NULL THEN 'unexpected' WHEN a.source_table IS NULL THEN 'missing'
         ELSE 'policy or validation differs' END AS discrepancy
FROM expected e FULL JOIN actual a USING(source_table,source_column,target_table,target_column)
WHERE e.source_table IS NULL OR a.source_table IS NULL OR NOT a.approved_policy;

-- Schema totals. System history is excluded; no temporary/persistence entities added.
SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations')=16 AS sixteen_tables,
    (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations')=97 AS ninety_seven_fields,
    (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='f')=24 AS twenty_four_foreign_keys,
    (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='p' AND c.conrelid<>'public."_prisma_migrations"'::regclass)=16 AS sixteen_primary_keys;

-- Reviewed record counts; empty_replay deliberately has no fabricated seed data.
WITH counts(table_name,actual_count,restore_count) AS (
    SELECT 'users',count(*),3 FROM public.users UNION ALL
    SELECT 'facilities',count(*),1 FROM public.facilities UNION ALL
    SELECT 'equipment',count(*),1 FROM public.equipment UNION ALL
    SELECT 'reservations',count(*),2 FROM public.reservations UNION ALL
    SELECT 'equipment_loans',count(*),0 FROM public.equipment_loans UNION ALL
    SELECT 'loan_items',count(*),0 FROM public.loan_items UNION ALL
    SELECT 'maintenance_requests',count(*),0 FROM public.maintenance_requests UNION ALL
    SELECT 'maintenance_logs',count(*),0 FROM public.maintenance_logs UNION ALL
    SELECT 'reservation_equipment',count(*),0 FROM public.reservation_equipment UNION ALL
    SELECT 'audit_logs',count(*),CASE WHEN current_setting('im101.verification_phase',true)='after_cancel' THEN 10 ELSE 8 END FROM public.audit_logs
)
SELECT table_name,actual_count,
    actual_count=CASE WHEN current_setting('im101.verification_phase',true)='empty_replay' THEN 0 ELSE restore_count END AS matches
FROM counts ORDER BY table_name;

-- IDs are safe to display. Exact original user IDs/hash equality is an atomic
-- migration assertion using private in-memory snapshots, never audit/log output.
SELECT array_agg(user_id ORDER BY user_id) AS preserved_user_ids FROM public.users;
SELECT equipment_id,total_quantity,available_quantity,
    equipment_name='Projector' AND total_quantity=15 AND available_quantity=15 AS matches
FROM public.equipment;
SELECT reservation_id,s.status_name,
    reservation_id IN (1,2) AND s.status_name=CASE
      WHEN current_setting('im101.verification_phase',true)='after_cancel' THEN 'Cancelled' ELSE 'Pending' END AS matches
FROM public.reservations r JOIN public.reservation_status s USING(status_id) ORDER BY reservation_id;
SELECT role_id,role_name,char_length(role_name) AS name_length FROM public.roles ORDER BY role_id;
SELECT action_type,table_name,count(*) AS events FROM public.audit_logs GROUP BY action_type,table_name ORDER BY action_type,table_name;
SELECT log_id,record_id,changed_by,
    changed_by IS NOT NULL AND old_value->>'status_id' IS DISTINCT FROM new_value->>'status_id'
      AND old_value-'status_id'=new_value-'status_id' AS only_status_changed
FROM public.audit_logs WHERE table_name='reservations' AND action_type='UPDATE' ORDER BY log_id;

-- History metadata only, never logs or credentials. The original two rows are
-- compared byte-for-byte as JSON inside the migration before it can commit.
SELECT migration_name,checksum,started_at,finished_at,rolled_back_at,applied_steps_count
FROM public."_prisma_migrations" ORDER BY started_at;
SELECT count(*)=3 AND bool_and(finished_at IS NOT NULL AND rolled_back_at IS NULL)
    AND array_agg(migration_name ORDER BY migration_name)=ARRAY[
      '20260927063702_init','20261004052212_split_user_name',
      '20261019010000_approved_schema_realignment']::text[] AS migration_history_matches
FROM public."_prisma_migrations";

-- No unapproved checks/exclusions/triggers/routines may silently replace Task C.
SELECT c.conname,c.contype FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
WHERE n.nspname='public' AND c.contype IN ('c','x');
SELECT c.relname,t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal;
ROLLBACK;
