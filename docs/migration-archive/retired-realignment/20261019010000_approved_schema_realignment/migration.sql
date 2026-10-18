-- REVIEW DRAFT. Not executed or database-tested. Read docs/approved-schema-migration.md.
-- No implicit authorization: both approval settings must be supplied after approval.
-- Applies only after the two original migrations; archived migrations must not run.
BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL TIME ZONE 'UTC';

DO $realign$
DECLARE
    profile text := current_setting('im101.migration_profile', true);
    legacy_user_timezone text := current_setting('im101.user_created_at_timezone', true);
    initialized_at timestamptz := transaction_timestamp();
    before_rows jsonb := '{}'::jsonb;
    after_rows jsonb := '{}'::jsonb;
    original_history jsonb;
    current_history jsonb;
    role_record_id integer;
    changed integer;
BEGIN
    IF current_setting('im101.schema_realignment_approved', true) IS DISTINCT FROM 'yes'
       OR current_setting('im101.no_action_approved', true) IS DISTINCT FROM 'yes' THEN
        RAISE EXCEPTION 'Review draft: schema execution and NO ACTION policy require explicit approval';
    END IF;
    IF profile IS NULL OR profile NOT IN ('legacy_restore','empty_replay') THEN
        RAISE EXCEPTION 'Choose legacy_restore or empty_replay explicitly; no default inventory assumptions';
    END IF;
    -- Only reservation UTC interpretation was approved. Do not guess user chronology.
    IF profile='legacy_restore' AND (legacy_user_timezone IS NULL OR NOT EXISTS
       (SELECT 1 FROM pg_timezone_names WHERE name=legacy_user_timezone)) THEN
        RAISE EXCEPTION 'Confirm and configure the original User.createdAt timezone before execution';
    END IF;
    IF profile='empty_replay' THEN legacy_user_timezone := 'UTC'; END IF;
    IF to_regclass('public."_prisma_migrations"') IS NULL THEN
        RAISE EXCEPTION 'Original Prisma history is required; do not baseline or mark migrations applied';
    END IF;
    LOCK TABLE public."_prisma_migrations" IN SHARE ROW EXCLUSIVE MODE;
    IF (SELECT count(*) FROM public."_prisma_migrations"
        WHERE migration_name<>'20261019010000_approved_schema_realignment')<>2
       OR EXISTS (SELECT 1 FROM public."_prisma_migrations"
          WHERE migration_name<>'20261019010000_approved_schema_realignment' AND
          (migration_name NOT IN ('20260927063702_init','20261004052212_split_user_name')
           OR finished_at IS NULL OR rolled_back_at IS NOT NULL)) THEN
        RAISE EXCEPTION 'History differs from exactly two successfully applied originals; stop for reconciliation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public."_prisma_migrations" WHERE migration_name='20260927063702_init' AND checksum IN ('c7b947c297b4b6413617e6f7d4820d14033e8f53c277ff52cf375cecb39a4386', '8b8c4823d1754c8deda498230b328982692d0e47ca52eebe14149df7c125e0f7')) THEN
        RAISE EXCEPTION 'Applied original checksum does not match preserved source: 20260927063702_init';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public."_prisma_migrations" WHERE migration_name='20261004052212_split_user_name' AND checksum IN ('c78394a437c9a4ae302ab6bc17b3f5cc12acf69af0c2377623d73203816aaf51', 'cce995eb727ee074f5f41c68d6020f249b92ea9f75c6cb3d489c2b6cd183f5b7')) THEN
        RAISE EXCEPTION 'Applied original checksum does not match preserved source: 20261004052212_split_user_name';
    END IF;
    SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id) INTO original_history
    FROM public."_prisma_migrations" h WHERE migration_name<>'20261019010000_approved_schema_realignment';
    IF (SELECT array_agg(c.relname::text ORDER BY c.relname::text)
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p')
          AND c.relname<>'_prisma_migrations') IS DISTINCT FROM
       ARRAY['AuditLog', 'Building', 'Equipment', 'EquipmentCategory', 'EquipmentLoan', 'Facility', 'FacilityStaffAssignment', 'FacilityType', 'MaintenanceRequest', 'Reservation', 'ReservationEquipment', 'ReservationStatus', 'Role', 'User']::text[] THEN
        RAISE EXCEPTION 'Unexpected public tables: this migration requires the original 14-table application baseline';
    END IF;
    LOCK TABLE public."Role", public."FacilityType", public."EquipmentCategory", public."ReservationStatus", public."User", public."Building", public."Facility", public."Equipment", public."Reservation", public."ReservationEquipment", public."EquipmentLoan", public."FacilityStaffAssignment", public."MaintenanceRequest", public."AuditLog" IN ACCESS EXCLUSIVE MODE;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."Role"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['roleId', 'roleName']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on Role; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."FacilityType"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['facilityTypeId', 'typeName']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on FacilityType; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."EquipmentCategory"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['categoryId', 'categoryName']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on EquipmentCategory; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."ReservationStatus"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['statusId', 'statusName']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on ReservationStatus; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."User"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['contactNumber', 'createdAt', 'email', 'fname', 'idNumber', 'isActive', 'lname', 'passwordHash', 'roleId', 'userId']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on User; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."Building"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['buildingId', 'buildingName', 'floorCount']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on Building; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."Facility"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['buildingId', 'capacity', 'facilityId', 'facilityName', 'facilityTypeId', 'floorNumber', 'status']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on Facility; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."Equipment"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['availableQuantity', 'categoryId', 'conditionStatus', 'equipmentId', 'equipmentName', 'homeFacilityId', 'totalQuantity']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on Equipment; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."Reservation"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['approvedBy', 'endDatetime', 'facilityId', 'purpose', 'requestedBy', 'reservationId', 'startDatetime', 'statusId']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on Reservation; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."ReservationEquipment"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['equipmentId', 'notes', 'quantity', 'reservationId']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on ReservationEquipment; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."EquipmentLoan"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['approvedBy', 'checkoutDate', 'conditionIn', 'conditionOut', 'dueDate', 'equipmentId', 'loanId', 'loanStatus', 'quantity', 'returnDate', 'userId']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on EquipmentLoan; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."FacilityStaffAssignment"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['assignedDate', 'assignedRole', 'assignmentId', 'facilityId', 'staffId']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on FacilityStaffAssignment; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."MaintenanceRequest"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['assignedStaffId', 'description', 'equipmentId', 'facilityId', 'priority', 'reportedAt', 'reportedBy', 'requestId', 'resolutionNotes', 'resolvedAt', 'status']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on MaintenanceRequest; no destructive fallback is permitted';
    END IF;
    IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
        WHERE a.attrelid='public."AuditLog"'::regclass AND a.attnum>0 AND NOT a.attisdropped)
       IS DISTINCT FROM ARRAY['actionType', 'changedAt', 'changedBy', 'logId', 'newValue', 'oldValue', 'recordId', 'tableName']::text[] THEN
        RAISE EXCEPTION 'Unexpected columns on AuditLog; no destructive fallback is permitted';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
        AND NOT t.tgisinternal AND c.relname IN ('Role', 'FacilityType', 'EquipmentCategory', 'ReservationStatus', 'User', 'Building', 'Facility', 'Equipment', 'Reservation', 'ReservationEquipment', 'EquipmentLoan', 'FacilityStaffAssignment', 'MaintenanceRequest', 'AuditLog')) THEN
        RAISE EXCEPTION 'Unexpected application triggers; review their effects before renaming or updating';
    END IF;
    IF profile='legacy_restore' THEN
        IF (SELECT count(*) FROM public."User")<>3 OR (SELECT count(*) FROM public."Facility")<>1
           OR (SELECT count(*) FROM public."Equipment")<>1 OR (SELECT count(*) FROM public."Reservation")<>2
           OR (SELECT count(*) FROM public."Role")<>3 THEN
            RAISE EXCEPTION 'Reviewed inventory changed: expected 3 users, 1 facility, 1 equipment, 2 reservations, 3 roles';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public."Equipment" WHERE "equipmentName"='Projector'
            AND "totalQuantity"=15 AND "availableQuantity"=15) THEN
            RAISE EXCEPTION 'Reviewed Projector 15/15 inventory changed';
        END IF;
        IF (SELECT count(*) FROM public."Reservation" r JOIN public."ReservationStatus" s USING ("statusId")
            WHERE r."reservationId" IN (1,2) AND s."statusName"='Pending')<>2 THEN
            RAISE EXCEPTION 'Reservations 1 and 2 must still be Pending; cancellation is a separate later operation';
        END IF;
        IF (SELECT count(*) FROM public."Role" WHERE "roleName" IN
            ('System Administrator','Facility/Maintenance Staff','Faculty Member / Student Organization Representative'))<>3 THEN
            RAISE EXCEPTION 'Role inventory changed; approved correction must target the existing role row';
        END IF;
        SELECT "roleId" INTO STRICT role_record_id FROM public."Role"
            WHERE "roleName"='Faculty Member / Student Organization Representative';
    ELSE
        IF EXISTS (SELECT 1 FROM public."Role") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."FacilityType") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."EquipmentCategory") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."ReservationStatus") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."User") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."Building") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."Facility") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."Equipment") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."Reservation") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."ReservationEquipment") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."EquipmentLoan") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."FacilityStaffAssignment") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."MaintenanceRequest") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
        IF EXISTS (SELECT 1 FROM public."AuditLog") THEN RAISE EXCEPTION 'empty_replay requires every application table to be empty'; END IF;
    END IF;
    -- Empty-table assertions are the data-loss gates for removed legacy columns.
    -- Stop rather than invent loan requested dates, approvals or resolution events.
    IF EXISTS (SELECT 1 FROM public."EquipmentLoan") OR EXISTS (SELECT 1 FROM public."MaintenanceRequest")
       OR EXISTS (SELECT 1 FROM public."ReservationEquipment") OR EXISTS (SELECT 1 FROM public."AuditLog") THEN
        RAISE EXCEPTION 'Loans, maintenance, allocations or audit inventory changed; preserve/review new data before realignment';
    END IF;
    IF EXISTS (SELECT 1 FROM public."Facility" GROUP BY "buildingId","facilityName","floorNumber" HAVING count(*)>1)
       OR EXISTS (SELECT 1 FROM public."Building" WHERE "floorCount" NOT BETWEEN -32768 AND 32767)
       OR EXISTS (SELECT 1 FROM public."Facility" WHERE "floorNumber" NOT BETWEEN -32768 AND 32767) THEN
        RAISE EXCEPTION 'Facility uniqueness or smallint range precondition failed';
    END IF;
    IF EXISTS (SELECT 1 FROM public."Role" WHERE char_length(CASE WHEN "roleName"='Faculty Member / Student Organization Representative' THEN 'Faculty / Student Organization Representative' ELSE "roleName" END)>50) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: Role.roleName; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."FacilityType" WHERE char_length("typeName")>50) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: FacilityType.typeName; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."EquipmentCategory" WHERE char_length("categoryName")>50) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: EquipmentCategory.categoryName; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."ReservationStatus" WHERE char_length("statusName")>30) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: ReservationStatus.statusName; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."User" WHERE char_length("email")>150) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: User.email; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."User" WHERE char_length("passwordHash")>255) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: User.passwordHash; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."User" WHERE char_length("idNumber")>30) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: User.idNumber; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."User" WHERE char_length("contactNumber")>20) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: User.contactNumber; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."User" WHERE char_length("fname")>60) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: User.fname; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."User" WHERE char_length("lname")>60) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: User.lname; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."Building" WHERE char_length("buildingName")>100) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: Building.buildingName; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."Facility" WHERE char_length("facilityName")>100) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: Facility.facilityName; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."Facility" WHERE char_length("status")>20) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: Facility.status; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."Equipment" WHERE char_length("equipmentName")>100) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: Equipment.equipmentName; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."Equipment" WHERE char_length("conditionStatus")>20) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: Equipment.conditionStatus; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."Reservation" WHERE char_length("purpose")>255) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: Reservation.purpose; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."EquipmentLoan" WHERE char_length("loanStatus")>15) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: EquipmentLoan.loanStatus; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."FacilityStaffAssignment" WHERE char_length("assignedRole")>30) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: FacilityStaffAssignment.assignedRole; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."MaintenanceRequest" WHERE char_length("priority")>10) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: MaintenanceRequest.priority; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."MaintenanceRequest" WHERE char_length("status")>20) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: MaintenanceRequest.status; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."AuditLog" WHERE char_length("tableName")>50) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: AuditLog.tableName; values are not logged or truncated';
    END IF;
    IF EXISTS (SELECT 1 FROM public."AuditLog" WHERE char_length("actionType")>10) THEN
        RAISE EXCEPTION 'Approved varchar limit exceeded: AuditLog.actionType; values are not logged or truncated';
    END IF;
    -- Timestamp types must be the original timezone-naive representation.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='createdAt' AND data_type='timestamp without time zone' AND datetime_precision=3) THEN
        RAISE EXCEPTION 'Unexpected timestamp representation: User.createdAt';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Reservation' AND column_name='startDatetime' AND data_type='timestamp without time zone' AND datetime_precision=3) THEN
        RAISE EXCEPTION 'Unexpected timestamp representation: Reservation.startDatetime';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Reservation' AND column_name='endDatetime' AND data_type='timestamp without time zone' AND datetime_precision=3) THEN
        RAISE EXCEPTION 'Unexpected timestamp representation: Reservation.endDatetime';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='EquipmentLoan' AND column_name='checkoutDate' AND data_type='timestamp without time zone' AND datetime_precision=3) THEN
        RAISE EXCEPTION 'Unexpected timestamp representation: EquipmentLoan.checkoutDate';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='EquipmentLoan' AND column_name='dueDate' AND data_type='timestamp without time zone' AND datetime_precision=3) THEN
        RAISE EXCEPTION 'Unexpected timestamp representation: EquipmentLoan.dueDate';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='EquipmentLoan' AND column_name='returnDate' AND data_type='timestamp without time zone' AND datetime_precision=3) THEN
        RAISE EXCEPTION 'Unexpected timestamp representation: EquipmentLoan.returnDate';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='MaintenanceRequest' AND column_name='reportedAt' AND data_type='timestamp without time zone' AND datetime_precision=3) THEN
        RAISE EXCEPTION 'Unexpected timestamp representation: MaintenanceRequest.reportedAt';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='MaintenanceRequest' AND column_name='resolvedAt' AND data_type='timestamp without time zone' AND datetime_precision=3) THEN
        RAISE EXCEPTION 'Unexpected timestamp representation: MaintenanceRequest.resolvedAt';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AuditLog' AND column_name='changedAt' AND data_type='timestamp without time zone' AND datetime_precision=3) THEN
        RAISE EXCEPTION 'Unexpected timestamp representation: AuditLog.changedAt';
    END IF;
    -- In-memory snapshots only. User hashes never enter files, notices or audit payloads.
    SELECT before_rows || jsonb_build_object('Role', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."roleId"), '[]'::jsonb)) INTO before_rows FROM public."Role" t;
    SELECT before_rows || jsonb_build_object('FacilityType', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."facilityTypeId"), '[]'::jsonb)) INTO before_rows FROM public."FacilityType" t;
    SELECT before_rows || jsonb_build_object('EquipmentCategory', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."categoryId"), '[]'::jsonb)) INTO before_rows FROM public."EquipmentCategory" t;
    SELECT before_rows || jsonb_build_object('ReservationStatus', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."statusId"), '[]'::jsonb)) INTO before_rows FROM public."ReservationStatus" t;
    SELECT before_rows || jsonb_build_object('User', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."userId"), '[]'::jsonb)) INTO before_rows FROM public."User" t;
    SELECT before_rows || jsonb_build_object('Building', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."buildingId"), '[]'::jsonb)) INTO before_rows FROM public."Building" t;
    SELECT before_rows || jsonb_build_object('Facility', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."facilityId"), '[]'::jsonb)) INTO before_rows FROM public."Facility" t;
    SELECT before_rows || jsonb_build_object('Equipment', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."equipmentId"), '[]'::jsonb)) INTO before_rows FROM public."Equipment" t;
    SELECT before_rows || jsonb_build_object('Reservation', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."reservationId"), '[]'::jsonb)) INTO before_rows FROM public."Reservation" t;
    SELECT before_rows || jsonb_build_object('ReservationEquipment', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."reservationId", t."equipmentId"), '[]'::jsonb)) INTO before_rows FROM public."ReservationEquipment" t;
    SELECT before_rows || jsonb_build_object('EquipmentLoan', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."loanId"), '[]'::jsonb)) INTO before_rows FROM public."EquipmentLoan" t;
    SELECT before_rows || jsonb_build_object('FacilityStaffAssignment', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."assignmentId"), '[]'::jsonb)) INTO before_rows FROM public."FacilityStaffAssignment" t;
    SELECT before_rows || jsonb_build_object('MaintenanceRequest', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."requestId"), '[]'::jsonb)) INTO before_rows FROM public."MaintenanceRequest" t;
    SELECT before_rows || jsonb_build_object('AuditLog', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t."logId"), '[]'::jsonb)) INTO before_rows FROM public."AuditLog" t;
    -- Replace only the original foreign keys; all changes remain transactional.
    ALTER TABLE public."User" DROP CONSTRAINT "User_roleId_fkey";
    ALTER TABLE public."Facility" DROP CONSTRAINT "Facility_buildingId_fkey";
    ALTER TABLE public."Facility" DROP CONSTRAINT "Facility_facilityTypeId_fkey";
    ALTER TABLE public."Equipment" DROP CONSTRAINT "Equipment_categoryId_fkey";
    ALTER TABLE public."Equipment" DROP CONSTRAINT "Equipment_homeFacilityId_fkey";
    ALTER TABLE public."Reservation" DROP CONSTRAINT "Reservation_facilityId_fkey";
    ALTER TABLE public."Reservation" DROP CONSTRAINT "Reservation_requestedBy_fkey";
    ALTER TABLE public."Reservation" DROP CONSTRAINT "Reservation_approvedBy_fkey";
    ALTER TABLE public."Reservation" DROP CONSTRAINT "Reservation_statusId_fkey";
    ALTER TABLE public."ReservationEquipment" DROP CONSTRAINT "ReservationEquipment_reservationId_fkey";
    ALTER TABLE public."ReservationEquipment" DROP CONSTRAINT "ReservationEquipment_equipmentId_fkey";
    ALTER TABLE public."EquipmentLoan" DROP CONSTRAINT "EquipmentLoan_userId_fkey";
    ALTER TABLE public."EquipmentLoan" DROP CONSTRAINT "EquipmentLoan_equipmentId_fkey";
    ALTER TABLE public."EquipmentLoan" DROP CONSTRAINT "EquipmentLoan_approvedBy_fkey";
    ALTER TABLE public."FacilityStaffAssignment" DROP CONSTRAINT "FacilityStaffAssignment_facilityId_fkey";
    ALTER TABLE public."FacilityStaffAssignment" DROP CONSTRAINT "FacilityStaffAssignment_staffId_fkey";
    ALTER TABLE public."MaintenanceRequest" DROP CONSTRAINT "MaintenanceRequest_facilityId_fkey";
    ALTER TABLE public."MaintenanceRequest" DROP CONSTRAINT "MaintenanceRequest_equipmentId_fkey";
    ALTER TABLE public."MaintenanceRequest" DROP CONSTRAINT "MaintenanceRequest_reportedBy_fkey";
    ALTER TABLE public."MaintenanceRequest" DROP CONSTRAINT "MaintenanceRequest_assignedStaffId_fkey";
    ALTER TABLE public."AuditLog" DROP CONSTRAINT "AuditLog_changedBy_fkey";

    ALTER TABLE public."Role" RENAME TO "roles";
    ALTER TABLE public."roles" RENAME COLUMN "roleId" TO "role_id";
    ALTER TABLE public."roles" RENAME COLUMN "roleName" TO "role_name";
    ALTER TABLE public."roles" RENAME CONSTRAINT "Role_pkey" TO "roles_pkey";
    ALTER SEQUENCE public."Role_roleId_seq" RENAME TO "roles_role_id_seq";

    ALTER TABLE public."FacilityType" RENAME TO "facility_types";
    ALTER TABLE public."facility_types" RENAME COLUMN "facilityTypeId" TO "facility_type_id";
    ALTER TABLE public."facility_types" RENAME COLUMN "typeName" TO "type_name";
    ALTER TABLE public."facility_types" RENAME CONSTRAINT "FacilityType_pkey" TO "facility_types_pkey";
    ALTER SEQUENCE public."FacilityType_facilityTypeId_seq" RENAME TO "facility_types_facility_type_id_seq";

    ALTER TABLE public."EquipmentCategory" RENAME TO "equipment_categories";
    ALTER TABLE public."equipment_categories" RENAME COLUMN "categoryId" TO "category_id";
    ALTER TABLE public."equipment_categories" RENAME COLUMN "categoryName" TO "category_name";
    ALTER TABLE public."equipment_categories" RENAME CONSTRAINT "EquipmentCategory_pkey" TO "equipment_categories_pkey";
    ALTER SEQUENCE public."EquipmentCategory_categoryId_seq" RENAME TO "equipment_categories_category_id_seq";

    ALTER TABLE public."ReservationStatus" RENAME TO "reservation_status";
    ALTER TABLE public."reservation_status" RENAME COLUMN "statusId" TO "status_id";
    ALTER TABLE public."reservation_status" RENAME COLUMN "statusName" TO "status_name";
    ALTER TABLE public."reservation_status" RENAME CONSTRAINT "ReservationStatus_pkey" TO "reservation_status_pkey";
    ALTER SEQUENCE public."ReservationStatus_statusId_seq" RENAME TO "reservation_status_status_id_seq";

    ALTER TABLE public."User" RENAME TO "users";
    ALTER TABLE public."users" RENAME COLUMN "userId" TO "user_id";
    ALTER TABLE public."users" RENAME COLUMN "roleId" TO "role_id";
    ALTER TABLE public."users" RENAME COLUMN "passwordHash" TO "password_hash";
    ALTER TABLE public."users" RENAME COLUMN "idNumber" TO "id_number";
    ALTER TABLE public."users" RENAME COLUMN "contactNumber" TO "contact_number";
    ALTER TABLE public."users" RENAME COLUMN "isActive" TO "is_active";
    ALTER TABLE public."users" RENAME COLUMN "createdAt" TO "created_at";
    ALTER TABLE public."users" RENAME CONSTRAINT "User_pkey" TO "users_pkey";
    ALTER SEQUENCE public."User_userId_seq" RENAME TO "users_user_id_seq";

    ALTER TABLE public."Building" RENAME TO "buildings";
    ALTER TABLE public."buildings" RENAME COLUMN "buildingId" TO "building_id";
    ALTER TABLE public."buildings" RENAME COLUMN "buildingName" TO "building_name";
    ALTER TABLE public."buildings" RENAME COLUMN "floorCount" TO "floor_count";
    ALTER TABLE public."buildings" RENAME CONSTRAINT "Building_pkey" TO "buildings_pkey";
    ALTER SEQUENCE public."Building_buildingId_seq" RENAME TO "buildings_building_id_seq";

    ALTER TABLE public."Facility" RENAME TO "facilities";
    ALTER TABLE public."facilities" RENAME COLUMN "facilityId" TO "facility_id";
    ALTER TABLE public."facilities" RENAME COLUMN "buildingId" TO "building_id";
    ALTER TABLE public."facilities" RENAME COLUMN "facilityTypeId" TO "facility_type_id";
    ALTER TABLE public."facilities" RENAME COLUMN "facilityName" TO "facility_name";
    ALTER TABLE public."facilities" RENAME COLUMN "floorNumber" TO "floor_number";
    ALTER TABLE public."facilities" RENAME CONSTRAINT "Facility_pkey" TO "facilities_pkey";
    ALTER SEQUENCE public."Facility_facilityId_seq" RENAME TO "facilities_facility_id_seq";

    ALTER TABLE public."Equipment" RENAME TO "equipment";
    ALTER TABLE public."equipment" RENAME COLUMN "equipmentId" TO "equipment_id";
    ALTER TABLE public."equipment" RENAME COLUMN "categoryId" TO "category_id";
    ALTER TABLE public."equipment" RENAME COLUMN "homeFacilityId" TO "home_facility_id";
    ALTER TABLE public."equipment" RENAME COLUMN "equipmentName" TO "equipment_name";
    ALTER TABLE public."equipment" RENAME COLUMN "totalQuantity" TO "total_quantity";
    ALTER TABLE public."equipment" RENAME COLUMN "availableQuantity" TO "available_quantity";
    ALTER TABLE public."equipment" RENAME COLUMN "conditionStatus" TO "condition_status";
    ALTER TABLE public."equipment" RENAME CONSTRAINT "Equipment_pkey" TO "equipment_pkey";
    ALTER SEQUENCE public."Equipment_equipmentId_seq" RENAME TO "equipment_equipment_id_seq";

    ALTER TABLE public."Reservation" RENAME TO "reservations";
    ALTER TABLE public."reservations" RENAME COLUMN "reservationId" TO "reservation_id";
    ALTER TABLE public."reservations" RENAME COLUMN "facilityId" TO "facility_id";
    ALTER TABLE public."reservations" RENAME COLUMN "requestedBy" TO "requested_by";
    ALTER TABLE public."reservations" RENAME COLUMN "approvedBy" TO "approved_by";
    ALTER TABLE public."reservations" RENAME COLUMN "statusId" TO "status_id";
    ALTER TABLE public."reservations" RENAME COLUMN "startDatetime" TO "start_datetime";
    ALTER TABLE public."reservations" RENAME COLUMN "endDatetime" TO "end_datetime";
    ALTER TABLE public."reservations" RENAME CONSTRAINT "Reservation_pkey" TO "reservations_pkey";
    ALTER SEQUENCE public."Reservation_reservationId_seq" RENAME TO "reservations_reservation_id_seq";

    ALTER TABLE public."ReservationEquipment" RENAME TO "reservation_equipment";
    ALTER TABLE public."reservation_equipment" RENAME COLUMN "reservationId" TO "reservation_id";
    ALTER TABLE public."reservation_equipment" RENAME COLUMN "equipmentId" TO "equipment_id";
    ALTER TABLE public."reservation_equipment" RENAME COLUMN "quantity" TO "quantity_requested";
    ALTER TABLE public."reservation_equipment" RENAME CONSTRAINT "ReservationEquipment_pkey" TO "reservation_equipment_pkey";

    ALTER TABLE public."EquipmentLoan" RENAME TO "equipment_loans";
    ALTER TABLE public."equipment_loans" RENAME COLUMN "loanId" TO "loan_id";
    ALTER TABLE public."equipment_loans" RENAME COLUMN "userId" TO "user_id";
    ALTER TABLE public."equipment_loans" RENAME COLUMN "approvedBy" TO "approved_by";
    ALTER TABLE public."equipment_loans" RENAME COLUMN "dueDate" TO "due_date";
    ALTER TABLE public."equipment_loans" RENAME COLUMN "returnDate" TO "return_date";
    ALTER TABLE public."equipment_loans" RENAME COLUMN "loanStatus" TO "loan_status";
    ALTER TABLE public."equipment_loans" RENAME CONSTRAINT "EquipmentLoan_pkey" TO "equipment_loans_pkey";
    ALTER SEQUENCE public."EquipmentLoan_loanId_seq" RENAME TO "equipment_loans_loan_id_seq";

    ALTER TABLE public."FacilityStaffAssignment" RENAME TO "facility_staff_assignments";
    ALTER TABLE public."facility_staff_assignments" RENAME COLUMN "assignmentId" TO "assignment_id";
    ALTER TABLE public."facility_staff_assignments" RENAME COLUMN "facilityId" TO "facility_id";
    ALTER TABLE public."facility_staff_assignments" RENAME COLUMN "staffId" TO "staff_id";
    ALTER TABLE public."facility_staff_assignments" RENAME COLUMN "assignedRole" TO "assigned_role";
    ALTER TABLE public."facility_staff_assignments" RENAME COLUMN "assignedDate" TO "assigned_date";
    ALTER TABLE public."facility_staff_assignments" RENAME CONSTRAINT "FacilityStaffAssignment_pkey" TO "facility_staff_assignments_pkey";
    ALTER SEQUENCE public."FacilityStaffAssignment_assignmentId_seq" RENAME TO "facility_staff_assignments_assignment_id_seq";

    ALTER TABLE public."MaintenanceRequest" RENAME TO "maintenance_requests";
    ALTER TABLE public."maintenance_requests" RENAME COLUMN "requestId" TO "request_id";
    ALTER TABLE public."maintenance_requests" RENAME COLUMN "facilityId" TO "facility_id";
    ALTER TABLE public."maintenance_requests" RENAME COLUMN "equipmentId" TO "equipment_id";
    ALTER TABLE public."maintenance_requests" RENAME COLUMN "reportedBy" TO "reported_by";
    ALTER TABLE public."maintenance_requests" RENAME COLUMN "assignedStaffId" TO "assigned_staff_id";
    ALTER TABLE public."maintenance_requests" RENAME COLUMN "reportedAt" TO "reported_at";
    ALTER TABLE public."maintenance_requests" RENAME COLUMN "resolvedAt" TO "resolved_at";
    ALTER TABLE public."maintenance_requests" RENAME CONSTRAINT "MaintenanceRequest_pkey" TO "maintenance_requests_pkey";
    ALTER SEQUENCE public."MaintenanceRequest_requestId_seq" RENAME TO "maintenance_requests_request_id_seq";

    ALTER TABLE public."AuditLog" RENAME TO "audit_logs";
    ALTER TABLE public."audit_logs" RENAME COLUMN "logId" TO "log_id";
    ALTER TABLE public."audit_logs" RENAME COLUMN "tableName" TO "table_name";
    ALTER TABLE public."audit_logs" RENAME COLUMN "recordId" TO "record_id";
    ALTER TABLE public."audit_logs" RENAME COLUMN "actionType" TO "action_type";
    ALTER TABLE public."audit_logs" RENAME COLUMN "changedBy" TO "changed_by";
    ALTER TABLE public."audit_logs" RENAME COLUMN "oldValue" TO "old_value";
    ALTER TABLE public."audit_logs" RENAME COLUMN "newValue" TO "new_value";
    ALTER TABLE public."audit_logs" RENAME COLUMN "changedAt" TO "changed_at";
    ALTER TABLE public."audit_logs" RENAME CONSTRAINT "AuditLog_pkey" TO "audit_logs_pkey";
    ALTER SEQUENCE public."AuditLog_logId_seq" RENAME TO "audit_logs_log_id_seq";

    -- Legacy payload columns are removed only after the empty-table guards above.
    ALTER TABLE public."reservation_equipment" DROP COLUMN "notes" RESTRICT;
    ALTER TABLE public."equipment_loans" DROP COLUMN "equipmentId" RESTRICT;
    ALTER TABLE public."equipment_loans" DROP COLUMN "quantity" RESTRICT;
    ALTER TABLE public."equipment_loans" DROP COLUMN "checkoutDate" RESTRICT;
    ALTER TABLE public."equipment_loans" DROP COLUMN "conditionOut" RESTRICT;
    ALTER TABLE public."equipment_loans" DROP COLUMN "conditionIn" RESTRICT;
    ALTER TABLE public."maintenance_requests" DROP COLUMN "resolutionNotes" RESTRICT;
    IF profile='legacy_restore' THEN
        UPDATE public.roles SET role_name='Faculty / Student Organization Representative' WHERE role_id=role_record_id;
        GET DIAGNOSTICS changed = ROW_COUNT;
        IF changed<>1 THEN RAISE EXCEPTION 'Role correction must affect exactly one existing role'; END IF;
    END IF;
    ALTER TABLE public."roles" ALTER COLUMN "role_name" TYPE VARCHAR(50);
    ALTER TABLE public."facility_types" ALTER COLUMN "type_name" TYPE VARCHAR(50);
    ALTER TABLE public."equipment_categories" ALTER COLUMN "category_name" TYPE VARCHAR(50);
    ALTER TABLE public."reservation_status" ALTER COLUMN "status_name" TYPE VARCHAR(30);
    ALTER TABLE public."users" ALTER COLUMN "role_id" TYPE INTEGER;
    ALTER TABLE public."users" ALTER COLUMN "fname" TYPE VARCHAR(60);
    ALTER TABLE public."users" ALTER COLUMN "lname" TYPE VARCHAR(60);
    ALTER TABLE public."users" ALTER COLUMN "email" TYPE VARCHAR(150);
    ALTER TABLE public."users" ALTER COLUMN "password_hash" TYPE VARCHAR(255);
    ALTER TABLE public."users" ALTER COLUMN "id_number" TYPE VARCHAR(30);
    ALTER TABLE public."users" ALTER COLUMN "contact_number" TYPE VARCHAR(20);
    ALTER TABLE public."users" ALTER COLUMN "is_active" TYPE BOOLEAN;
    ALTER TABLE public."users" ALTER COLUMN "is_active" SET DEFAULT true;
    ALTER TABLE public."users" ALTER COLUMN "created_at" DROP DEFAULT;
    -- ALTER TABLE is a utility statement: safely quote the reviewed timezone
    -- into its expression rather than relying on PL/pgSQL parameter substitution.
    EXECUTE format('ALTER TABLE public.users ALTER COLUMN created_at TYPE TIMESTAMPTZ(6) USING created_at AT TIME ZONE %L', legacy_user_timezone);
    ALTER TABLE public."users" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE public."users" ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE public."buildings" ALTER COLUMN "building_name" TYPE VARCHAR(100);
    ALTER TABLE public."buildings" ALTER COLUMN "floor_count" TYPE SMALLINT;
    ALTER TABLE public."buildings" ADD COLUMN "location_note" VARCHAR(150);
    ALTER TABLE public."facilities" ALTER COLUMN "building_id" TYPE INTEGER;
    ALTER TABLE public."facilities" ALTER COLUMN "facility_type_id" TYPE INTEGER;
    ALTER TABLE public."facilities" ALTER COLUMN "facility_name" TYPE VARCHAR(100);
    ALTER TABLE public."facilities" ALTER COLUMN "floor_number" TYPE SMALLINT;
    ALTER TABLE public."facilities" ALTER COLUMN "capacity" TYPE INTEGER;
    ALTER TABLE public."facilities" ALTER COLUMN "status" TYPE VARCHAR(20);
    ALTER TABLE public."facilities" ALTER COLUMN "status" SET DEFAULT 'Available';
    ALTER TABLE public."facilities" ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE public."equipment" ALTER COLUMN "category_id" TYPE INTEGER;
    ALTER TABLE public."equipment" ALTER COLUMN "home_facility_id" TYPE INTEGER;
    ALTER TABLE public."equipment" ALTER COLUMN "equipment_name" TYPE VARCHAR(100);
    ALTER TABLE public."equipment" ADD COLUMN "serial_number" VARCHAR(60);
    ALTER TABLE public."equipment" ALTER COLUMN "total_quantity" TYPE INTEGER;
    ALTER TABLE public."equipment" ALTER COLUMN "available_quantity" TYPE INTEGER;
    ALTER TABLE public."equipment" ALTER COLUMN "condition_status" TYPE VARCHAR(20);
    ALTER TABLE public."equipment" ALTER COLUMN "condition_status" SET DEFAULT 'Good';
    ALTER TABLE public."equipment" ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE public."reservations" ALTER COLUMN "facility_id" TYPE INTEGER;
    ALTER TABLE public."reservations" ALTER COLUMN "requested_by" TYPE INTEGER;
    ALTER TABLE public."reservations" ALTER COLUMN "approved_by" TYPE INTEGER;
    ALTER TABLE public."reservations" ALTER COLUMN "status_id" TYPE INTEGER;
    ALTER TABLE public."reservations" ALTER COLUMN "purpose" TYPE VARCHAR(255);
    ALTER TABLE public."reservations" ALTER COLUMN "start_datetime" TYPE TIMESTAMPTZ(6) USING "start_datetime" AT TIME ZONE 'UTC';
    ALTER TABLE public."reservations" ALTER COLUMN "end_datetime" TYPE TIMESTAMPTZ(6) USING "end_datetime" AT TIME ZONE 'UTC';
    ALTER TABLE public."reservations" ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE public."reservation_equipment" ALTER COLUMN "reservation_id" TYPE INTEGER;
    ALTER TABLE public."reservation_equipment" ALTER COLUMN "equipment_id" TYPE INTEGER;
    ALTER TABLE public."reservation_equipment" ALTER COLUMN "quantity_requested" TYPE INTEGER;
    ALTER TABLE public."reservation_equipment" ADD COLUMN "quantity_approved" INTEGER;
    ALTER TABLE public."reservation_equipment" ADD COLUMN "condition_at_issue" VARCHAR(20);
    ALTER TABLE public."reservation_equipment" ADD COLUMN "condition_at_return" VARCHAR(20);
    ALTER TABLE public."equipment_loans" ALTER COLUMN "user_id" TYPE INTEGER;
    ALTER TABLE public."equipment_loans" ALTER COLUMN "approved_by" TYPE INTEGER;
    ALTER TABLE public."equipment_loans" ADD COLUMN "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE public."equipment_loans" ALTER COLUMN "due_date" TYPE TIMESTAMPTZ(6) USING "due_date" AT TIME ZONE 'UTC';
    ALTER TABLE public."equipment_loans" ALTER COLUMN "return_date" TYPE TIMESTAMPTZ(6) USING "return_date" AT TIME ZONE 'UTC';
    ALTER TABLE public."equipment_loans" ALTER COLUMN "loan_status" TYPE VARCHAR(15);
    ALTER TABLE public."equipment_loans" ALTER COLUMN "loan_status" SET DEFAULT 'Pending';
    ALTER TABLE public."facility_staff_assignments" ALTER COLUMN "facility_id" TYPE INTEGER;
    ALTER TABLE public."facility_staff_assignments" ALTER COLUMN "staff_id" TYPE INTEGER;
    ALTER TABLE public."facility_staff_assignments" ALTER COLUMN "assigned_role" TYPE VARCHAR(30);
    ALTER TABLE public."facility_staff_assignments" ALTER COLUMN "assigned_role" SET DEFAULT 'Custodian';
    ALTER TABLE public."facility_staff_assignments" ADD COLUMN "shift" VARCHAR(15);
    ALTER TABLE public."facility_staff_assignments" ALTER COLUMN "assigned_date" TYPE DATE;
    ALTER TABLE public."facility_staff_assignments" ALTER COLUMN "assigned_date" SET DEFAULT CURRENT_DATE;
    ALTER TABLE public."facility_staff_assignments" ADD COLUMN "unassigned_date" DATE;
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "facility_id" TYPE INTEGER;
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "equipment_id" TYPE INTEGER;
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "reported_by" TYPE INTEGER;
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "assigned_staff_id" TYPE INTEGER;
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "description" TYPE TEXT;
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "priority" TYPE VARCHAR(10);
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "priority" SET DEFAULT 'Normal';
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "status" TYPE VARCHAR(20);
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "status" SET DEFAULT 'Open';
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "reported_at" DROP DEFAULT;
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "reported_at" TYPE TIMESTAMPTZ(6) USING "reported_at" AT TIME ZONE 'UTC';
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "reported_at" SET DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE public."maintenance_requests" ALTER COLUMN "resolved_at" TYPE TIMESTAMPTZ(6) USING "resolved_at" AT TIME ZONE 'UTC';
    ALTER TABLE public."audit_logs" ALTER COLUMN "table_name" TYPE VARCHAR(50);
    ALTER TABLE public."audit_logs" ALTER COLUMN "record_id" TYPE INTEGER;
    ALTER TABLE public."audit_logs" ALTER COLUMN "action_type" TYPE VARCHAR(10);
    ALTER TABLE public."audit_logs" ALTER COLUMN "changed_by" TYPE INTEGER;
    ALTER TABLE public."audit_logs" ALTER COLUMN "old_value" TYPE JSONB;
    ALTER TABLE public."audit_logs" ALTER COLUMN "new_value" TYPE JSONB;
    ALTER TABLE public."audit_logs" ALTER COLUMN "changed_at" DROP DEFAULT;
    ALTER TABLE public."audit_logs" ALTER COLUMN "changed_at" TYPE TIMESTAMPTZ(6) USING "changed_at" AT TIME ZONE 'UTC';
    ALTER TABLE public."audit_logs" ALTER COLUMN "changed_at" SET DEFAULT CURRENT_TIMESTAMP;

    CREATE TABLE public."loan_items" (
        "loan_id" INTEGER NOT NULL,
        "equipment_id" INTEGER NOT NULL,
        "quantity" INTEGER NOT NULL,
        "condition_out" VARCHAR(20),
        "condition_in" VARCHAR(20),
        CONSTRAINT "loan_items_pkey" PRIMARY KEY ("loan_id", "equipment_id")
    );

    CREATE TABLE public."maintenance_logs" (
        "log_id" SERIAL NOT NULL,
        "request_id" INTEGER NOT NULL,
        "staff_id" INTEGER,
        "action_taken" TEXT NOT NULL,
        "logged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "maintenance_logs_pkey" PRIMARY KEY ("log_id")
    );

    -- Keep original unique indexes but align their physical names.
    ALTER INDEX public."Role_roleName_key" RENAME TO "roles_role_name_key";
    ALTER INDEX public."FacilityType_typeName_key" RENAME TO "facility_types_type_name_key";
    ALTER INDEX public."EquipmentCategory_categoryName_key" RENAME TO "equipment_categories_category_name_key";
    ALTER INDEX public."ReservationStatus_statusName_key" RENAME TO "reservation_status_status_name_key";
    ALTER INDEX public."User_email_key" RENAME TO "users_email_key";
    ALTER INDEX public."User_idNumber_key" RENAME TO "users_id_number_key";
    ALTER INDEX public."Building_buildingName_key" RENAME TO "buildings_building_name_key";
    DROP INDEX public."FacilityStaffAssignment_facilityId_staffId_key";
    CREATE UNIQUE INDEX "equipment_serial_number_key" ON public.equipment(serial_number);
    CREATE UNIQUE INDEX "facilities_building_id_facility_name_floor_number_key" ON public."facilities" ("building_id", "facility_name", "floor_number");
    CREATE INDEX "reservations_facility_id_start_datetime_end_datetime_idx" ON public."reservations" ("facility_id", "start_datetime", "end_datetime");
    CREATE INDEX "reservations_requested_by_idx" ON public."reservations" ("requested_by");
    CREATE INDEX "loan_items_equipment_id_idx" ON public."loan_items" ("equipment_id");
    CREATE INDEX "facility_staff_assignments_facility_id_staff_id_idx" ON public."facility_staff_assignments" ("facility_id", "staff_id");
    CREATE INDEX "maintenance_requests_status_idx" ON public."maintenance_requests" ("status");
    CREATE INDEX "audit_logs_table_name_record_id_idx" ON public."audit_logs" ("table_name", "record_id");

    -- PROPOSED NO ACTION: execution gate above requires final policy approval.
    ALTER TABLE public."users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES public."roles" ("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."facilities" ADD CONSTRAINT "facilities_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES public."buildings" ("building_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."facilities" ADD CONSTRAINT "facilities_facility_type_id_fkey" FOREIGN KEY ("facility_type_id") REFERENCES public."facility_types" ("facility_type_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."equipment" ADD CONSTRAINT "equipment_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES public."equipment_categories" ("category_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."equipment" ADD CONSTRAINT "equipment_home_facility_id_fkey" FOREIGN KEY ("home_facility_id") REFERENCES public."facilities" ("facility_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."reservations" ADD CONSTRAINT "reservations_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES public."facilities" ("facility_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."reservations" ADD CONSTRAINT "reservations_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES public."users" ("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."reservations" ADD CONSTRAINT "reservations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES public."users" ("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."reservations" ADD CONSTRAINT "reservations_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES public."reservation_status" ("status_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."reservation_equipment" ADD CONSTRAINT "reservation_equipment_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES public."reservations" ("reservation_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."reservation_equipment" ADD CONSTRAINT "reservation_equipment_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES public."equipment" ("equipment_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."equipment_loans" ADD CONSTRAINT "equipment_loans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES public."users" ("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."equipment_loans" ADD CONSTRAINT "equipment_loans_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES public."users" ("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."loan_items" ADD CONSTRAINT "loan_items_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES public."equipment_loans" ("loan_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."loan_items" ADD CONSTRAINT "loan_items_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES public."equipment" ("equipment_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."facility_staff_assignments" ADD CONSTRAINT "facility_staff_assignments_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES public."facilities" ("facility_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."facility_staff_assignments" ADD CONSTRAINT "facility_staff_assignments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES public."users" ("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."maintenance_requests" ADD CONSTRAINT "maintenance_requests_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES public."facilities" ("facility_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."maintenance_requests" ADD CONSTRAINT "maintenance_requests_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES public."equipment" ("equipment_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."maintenance_requests" ADD CONSTRAINT "maintenance_requests_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES public."users" ("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."maintenance_requests" ADD CONSTRAINT "maintenance_requests_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES public."users" ("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."maintenance_logs" ADD CONSTRAINT "maintenance_logs_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES public."maintenance_requests" ("request_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."maintenance_logs" ADD CONSTRAINT "maintenance_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES public."users" ("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
    ALTER TABLE public."audit_logs" ADD CONSTRAINT "audit_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES public."users" ("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

    IF profile='legacy_restore' THEN
        INSERT INTO public.audit_logs(table_name,record_id,action_type,changed_by,old_value,new_value,changed_at)
        VALUES ('roles',role_record_id,'UPDATE',NULL,
          jsonb_build_object('role_name','Faculty Member / Student Organization Representative'),
          jsonb_build_object('role_name','Faculty / Student Organization Representative','reason','Approved schema role-label correction'),initialized_at);
        -- INITIALIZE means metadata tracking started, NOT a historical business event.
        INSERT INTO public.audit_logs(table_name,record_id,action_type,changed_by,old_value,new_value,changed_at)
        SELECT 'users',user_id,'INITIALIZE',NULL,
          jsonb_build_object('updated_at',NULL,'created_at_legacy_wall_clock',created_at AT TIME ZONE legacy_user_timezone),
          jsonb_build_object('updated_at',updated_at,'created_at',created_at,'legacy_created_at_timezone',legacy_user_timezone,
            'policy','updated_at tracking initialized; historical last-update time unknown'),initialized_at
        FROM public.users;
        INSERT INTO public.audit_logs(table_name,record_id,action_type,changed_by,old_value,new_value,changed_at)
        SELECT 'facilities',facility_id,'INITIALIZE',NULL,jsonb_build_object('created_at',NULL),
          jsonb_build_object('created_at',created_at,'policy','Initialization time only; historical creation unknown'),initialized_at FROM public.facilities;
        INSERT INTO public.audit_logs(table_name,record_id,action_type,changed_by,old_value,new_value,changed_at)
        SELECT 'equipment',equipment_id,'INITIALIZE',NULL,jsonb_build_object('created_at',NULL),
          jsonb_build_object('created_at',created_at,'policy','Initialization time only; historical creation unknown'),initialized_at FROM public.equipment;
        INSERT INTO public.audit_logs(table_name,record_id,action_type,changed_by,old_value,new_value,changed_at)
        SELECT 'reservations',reservation_id,'INITIALIZE',NULL,jsonb_build_object('created_at',NULL),
          jsonb_build_object('created_at',created_at,'policy','Initialization time only; historical creation unknown'),initialized_at FROM public.reservations;
    END IF;
    -- Reconstruct every original row to prove IDs, credentials, lookups, inventory
    -- and reservation contents were preserved. No credentials are output or audited.
    SELECT after_rows || jsonb_build_object('Role', COALESCE(jsonb_agg(jsonb_build_object('roleId', t."role_id", 'roleName', CASE WHEN t.role_id=role_record_id THEN 'Faculty Member / Student Organization Representative' ELSE t.role_name END) ORDER BY t."role_id"), '[]'::jsonb)) INTO after_rows FROM public."roles" t;
    SELECT after_rows || jsonb_build_object('FacilityType', COALESCE(jsonb_agg(jsonb_build_object('facilityTypeId', t."facility_type_id", 'typeName', t."type_name") ORDER BY t."facility_type_id"), '[]'::jsonb)) INTO after_rows FROM public."facility_types" t;
    SELECT after_rows || jsonb_build_object('EquipmentCategory', COALESCE(jsonb_agg(jsonb_build_object('categoryId', t."category_id", 'categoryName', t."category_name") ORDER BY t."category_id"), '[]'::jsonb)) INTO after_rows FROM public."equipment_categories" t;
    SELECT after_rows || jsonb_build_object('ReservationStatus', COALESCE(jsonb_agg(jsonb_build_object('statusId', t."status_id", 'statusName', t."status_name") ORDER BY t."status_id"), '[]'::jsonb)) INTO after_rows FROM public."reservation_status" t;
    SELECT after_rows || jsonb_build_object('User', COALESCE(jsonb_agg(jsonb_build_object('userId', t."user_id", 'roleId', t."role_id", 'email', t."email", 'passwordHash', t."password_hash", 'idNumber', t."id_number", 'contactNumber', t."contact_number", 'isActive', t."is_active", 'createdAt', (t."created_at" AT TIME ZONE legacy_user_timezone), 'fname', t."fname", 'lname', t."lname") ORDER BY t."user_id"), '[]'::jsonb)) INTO after_rows FROM public."users" t;
    SELECT after_rows || jsonb_build_object('Building', COALESCE(jsonb_agg(jsonb_build_object('buildingId', t."building_id", 'buildingName', t."building_name", 'floorCount', t."floor_count") ORDER BY t."building_id"), '[]'::jsonb)) INTO after_rows FROM public."buildings" t;
    SELECT after_rows || jsonb_build_object('Facility', COALESCE(jsonb_agg(jsonb_build_object('facilityId', t."facility_id", 'buildingId', t."building_id", 'facilityTypeId', t."facility_type_id", 'facilityName', t."facility_name", 'floorNumber', t."floor_number", 'capacity', t."capacity", 'status', t."status") ORDER BY t."facility_id"), '[]'::jsonb)) INTO after_rows FROM public."facilities" t;
    SELECT after_rows || jsonb_build_object('Equipment', COALESCE(jsonb_agg(jsonb_build_object('equipmentId', t."equipment_id", 'categoryId', t."category_id", 'homeFacilityId', t."home_facility_id", 'equipmentName', t."equipment_name", 'totalQuantity', t."total_quantity", 'availableQuantity', t."available_quantity", 'conditionStatus', t."condition_status") ORDER BY t."equipment_id"), '[]'::jsonb)) INTO after_rows FROM public."equipment" t;
    SELECT after_rows || jsonb_build_object('Reservation', COALESCE(jsonb_agg(jsonb_build_object('reservationId', t."reservation_id", 'facilityId', t."facility_id", 'requestedBy', t."requested_by", 'approvedBy', t."approved_by", 'statusId', t."status_id", 'purpose', t."purpose", 'startDatetime', (t."start_datetime" AT TIME ZONE 'UTC'), 'endDatetime', (t."end_datetime" AT TIME ZONE 'UTC')) ORDER BY t."reservation_id"), '[]'::jsonb)) INTO after_rows FROM public."reservations" t;
    SELECT after_rows || jsonb_build_object('ReservationEquipment', COALESCE(jsonb_agg(jsonb_build_object('reservationId', t."reservation_id", 'equipmentId', t."equipment_id", 'quantity', t."quantity_requested", 'notes', NULL) ORDER BY t.reservation_id, t.equipment_id), '[]'::jsonb)) INTO after_rows FROM public."reservation_equipment" t;
    SELECT after_rows || jsonb_build_object('EquipmentLoan', COALESCE(jsonb_agg(jsonb_build_object('loanId', t."loan_id", 'userId', t."user_id", 'equipmentId', NULL, 'approvedBy', t."approved_by", 'quantity', NULL, 'checkoutDate', NULL, 'dueDate', (t."due_date" AT TIME ZONE 'UTC'), 'returnDate', (t."return_date" AT TIME ZONE 'UTC'), 'conditionOut', NULL, 'conditionIn', NULL, 'loanStatus', t."loan_status") ORDER BY t."loan_id"), '[]'::jsonb)) INTO after_rows FROM public."equipment_loans" t;
    SELECT after_rows || jsonb_build_object('FacilityStaffAssignment', COALESCE(jsonb_agg(jsonb_build_object('assignmentId', t."assignment_id", 'facilityId', t."facility_id", 'staffId', t."staff_id", 'assignedRole', t."assigned_role", 'assignedDate', t."assigned_date") ORDER BY t."assignment_id"), '[]'::jsonb)) INTO after_rows FROM public."facility_staff_assignments" t;
    SELECT after_rows || jsonb_build_object('MaintenanceRequest', COALESCE(jsonb_agg(jsonb_build_object('requestId', t."request_id", 'facilityId', t."facility_id", 'equipmentId', t."equipment_id", 'reportedBy', t."reported_by", 'assignedStaffId', t."assigned_staff_id", 'description', t."description", 'priority', t."priority", 'status', t."status", 'reportedAt', (t."reported_at" AT TIME ZONE 'UTC'), 'resolvedAt', (t."resolved_at" AT TIME ZONE 'UTC'), 'resolutionNotes', NULL) ORDER BY t."request_id"), '[]'::jsonb)) INTO after_rows FROM public."maintenance_requests" t;
    IF after_rows IS DISTINCT FROM (before_rows - 'AuditLog') THEN
        RAISE EXCEPTION 'Preservation assertion failed; all schema and data changes are rolled back (values redacted)';
    END IF;
    SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id) INTO current_history FROM public."_prisma_migrations" h
        WHERE migration_name<>'20261019010000_approved_schema_realignment';
    IF current_history IS DISTINCT FROM original_history THEN RAISE EXCEPTION 'Original migration history changed'; END IF;
    IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
        AND table_name IN ('roles', 'facility_types', 'equipment_categories', 'reservation_status', 'users', 'buildings', 'facilities', 'equipment', 'reservations', 'reservation_equipment', 'equipment_loans', 'loan_items', 'facility_staff_assignments', 'maintenance_requests', 'maintenance_logs', 'audit_logs'))<>97
       OR (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
           WHERE n.nspname='public' AND c.contype='f' AND c.conrelid IN ('public."roles"'::regclass, 'public."facility_types"'::regclass, 'public."equipment_categories"'::regclass, 'public."reservation_status"'::regclass, 'public."users"'::regclass, 'public."buildings"'::regclass, 'public."facilities"'::regclass, 'public."equipment"'::regclass, 'public."reservations"'::regclass, 'public."reservation_equipment"'::regclass, 'public."equipment_loans"'::regclass, 'public."loan_items"'::regclass, 'public."facility_staff_assignments"'::regclass, 'public."maintenance_requests"'::regclass, 'public."maintenance_logs"'::regclass, 'public."audit_logs"'::regclass))<>24 THEN
        RAISE EXCEPTION 'Target field/FK count assertion failed';
    END IF;
    IF (SELECT count(*) FROM public.audit_logs)<>CASE WHEN profile='legacy_restore' THEN 8 ELSE 0 END THEN
        RAISE EXCEPTION 'Unexpected audit effects; reviewed restore requires 7 initialization events and 1 role correction';
    END IF;
END $realign$;
COMMIT;
