-- REVIEW DRAFT. Read-only inputs for a later separately authorized staging review.
-- Intended for the unchanged two-migration baseline, not the realigned schema.
-- Do not run against Supabase or im101_restore_test under the Task B2 authorization.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL statement_timeout = '30s';
SELECT current_database() AS database_name,
       current_setting('transaction_read_only') AS read_only,
       current_setting('TimeZone') AS session_timezone;
-- The session timezone is diagnostic; it does not prove the original convention.
SELECT migration_name,checksum,started_at,finished_at,rolled_back_at,applied_steps_count
FROM public."_prisma_migrations" ORDER BY started_at;
SELECT 'User' AS table_name,count(*) AS records FROM public."User"
UNION ALL SELECT 'Facility',count(*) FROM public."Facility"
UNION ALL SELECT 'Equipment',count(*) FROM public."Equipment"
UNION ALL SELECT 'Reservation',count(*) FROM public."Reservation"
UNION ALL SELECT 'EquipmentLoan',count(*) FROM public."EquipmentLoan"
UNION ALL SELECT 'MaintenanceRequest',count(*) FROM public."MaintenanceRequest"
UNION ALL SELECT 'ReservationEquipment',count(*) FROM public."ReservationEquipment"
UNION ALL SELECT 'AuditLog',count(*) FROM public."AuditLog";
SELECT "userId" AS user_id,"roleId" AS role_id,"isActive" AS is_active,
       "createdAt" AS original_created_at_wall_clock,
       char_length("passwordHash") AS password_hash_length
FROM public."User" ORDER BY "userId";
SELECT "roleId" AS role_id,"roleName" AS role_name,
       char_length("roleName") AS role_name_length FROM public."Role" ORDER BY "roleId";
SELECT "facilityId","buildingId","facilityTypeId","facilityName","floorNumber",capacity,status
FROM public."Facility" ORDER BY "facilityId";
SELECT "equipmentId","equipmentName","categoryId","homeFacilityId",
       "totalQuantity","availableQuantity","conditionStatus"
FROM public."Equipment" ORDER BY "equipmentId";
-- Capture these exact values for the separately reviewed cancellation settings.
-- These reservation times are timezone-naive wall-clock values approved as UTC.
SELECT r."reservationId" AS reservation_id,r.purpose,r."facilityId" AS facility_id,
       s."statusName" AS status_name,
       r."startDatetime" AS original_start_wall_clock_utc,
       r."endDatetime" AS original_end_wall_clock_utc
FROM public."Reservation" r JOIN public."ReservationStatus" s USING("statusId")
ORDER BY r."reservationId";
SELECT "buildingId","facilityName","floorNumber",count(*) AS duplicate_count
FROM public."Facility" GROUP BY "buildingId","facilityName","floorNumber" HAVING count(*)>1;
-- Only metadata/lengths: never print note contents or audit payloads here.
SELECT "reservationId","equipmentId",quantity,
       notes IS NOT NULL AS notes_present,char_length(notes) AS notes_length
FROM public."ReservationEquipment";
SELECT "requestId",status,"assignedStaffId","reportedAt","resolvedAt",
       "resolutionNotes" IS NOT NULL AS resolution_notes_present,
       char_length("resolutionNotes") AS resolution_notes_length
FROM public."MaintenanceRequest";
SELECT table_name,column_name,data_type,datetime_precision
FROM information_schema.columns WHERE table_schema='public'
  AND data_type IN ('timestamp without time zone','timestamp with time zone','date')
ORDER BY table_name,ordinal_position;
ROLLBACK;
