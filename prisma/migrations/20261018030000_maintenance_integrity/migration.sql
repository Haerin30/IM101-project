-- Fail atomically on incompatible legacy rows; never rewrite maintenance history.
BEGIN;
LOCK TABLE "MaintenanceRequest" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM "MaintenanceRequest" WHERE
  description !~ '[^[:space:]]' OR length(btrim(description)) > 2000
  OR priority NOT IN ('Low','Normal','High','Urgent')
  OR status NOT IN ('Open','In Progress','Resolved')
  OR ("facilityId" IS NULL AND "equipmentId" IS NULL)
  OR (status IN ('In Progress','Resolved') AND "assignedStaffId" IS NULL)
  OR (status='Resolved' AND ("resolvedAt" IS NULL OR "resolutionNotes" IS NULL OR "resolutionNotes" !~ '[^[:space:]]' OR length(btrim("resolutionNotes")) > 2000 OR "resolvedAt" < "reportedAt"))
  OR (status<>'Resolved' AND ("resolvedAt" IS NOT NULL OR "resolutionNotes" IS NOT NULL)))
 THEN RAISE EXCEPTION 'Maintenance preflight failed: inspect invalid fields, assignment and resolution metadata; do not delete history'; END IF;
 IF EXISTS (SELECT 1 FROM "MaintenanceRequest" m LEFT JOIN "User" u ON u."userId"=m."assignedStaffId" LEFT JOIN "Role" r USING ("roleId")
 WHERE m.status<>'Resolved' AND m."assignedStaffId" IS NOT NULL AND (u."isActive" IS DISTINCT FROM true OR r."roleName" IS DISTINCT FROM 'Facility/Maintenance Staff'))
 THEN RAISE EXCEPTION 'Maintenance preflight failed: reassign unresolved requests to eligible active staff'; END IF;
 IF EXISTS (SELECT 1 FROM "MaintenanceRequest" m JOIN "Equipment" e USING ("equipmentId") WHERE m."facilityId" IS NOT NULL AND e."homeFacilityId" IS NOT NULL AND m."facilityId"<>e."homeFacilityId")
 THEN RAISE EXCEPTION 'Maintenance preflight failed: review facility/equipment mismatches against historical locations'; END IF;
END $$;
ALTER TABLE "MaintenanceRequest"
 ADD CONSTRAINT maintenance_description CHECK (description ~ '[^[:space:]]' AND length(btrim(description)) <= 2000),
 ADD CONSTRAINT maintenance_priority CHECK (priority IN ('Low','Normal','High','Urgent')),
 ADD CONSTRAINT maintenance_status CHECK (status IN ('Open','In Progress','Resolved')),
 ADD CONSTRAINT maintenance_asset CHECK ("facilityId" IS NOT NULL OR "equipmentId" IS NOT NULL),
 ADD CONSTRAINT maintenance_assigned CHECK (status='Open' OR "assignedStaffId" IS NOT NULL),
 ADD CONSTRAINT maintenance_resolution CHECK (
  (status='Resolved' AND "resolvedAt" IS NOT NULL AND "resolutionNotes" IS NOT NULL AND "resolutionNotes" ~ '[^[:space:]]' AND length(btrim("resolutionNotes")) <= 2000 AND "resolvedAt">="reportedAt") OR
  (status<>'Resolved' AND "resolvedAt" IS NULL AND "resolutionNotes" IS NULL));
CREATE FUNCTION maintenance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eligible boolean; home_id integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Maintenance requests are retained as history'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'Open' THEN RAISE EXCEPTION 'New maintenance requests must be Open'; END IF;
  IF NEW."facilityId" IS NOT NULL AND NEW."equipmentId" IS NOT NULL THEN
   SELECT "homeFacilityId" INTO home_id FROM "Equipment" WHERE "equipmentId"=NEW."equipmentId" FOR SHARE;
   IF home_id IS NOT NULL AND home_id<>NEW."facilityId" THEN RAISE EXCEPTION 'Equipment home facility does not match facilityId'; END IF;
  END IF;
 ELSE
  IF OLD.status='Resolved' THEN RAISE EXCEPTION 'Resolved maintenance history is immutable'; END IF;
  IF (NEW."requestId",NEW."facilityId",NEW."equipmentId",NEW."reportedBy",NEW."reportedAt") IS DISTINCT FROM
     (OLD."requestId",OLD."facilityId",OLD."equipmentId",OLD."reportedBy",OLD."reportedAt") THEN RAISE EXCEPTION 'Maintenance identity and asset references are immutable'; END IF;
  IF NEW.status<>OLD.status AND NOT ((OLD.status='Open' AND NEW.status='In Progress') OR (OLD.status='In Progress' AND NEW.status='Resolved')) THEN RAISE EXCEPTION 'Invalid maintenance status transition'; END IF;
 END IF;
 -- Lock the user so concurrent deactivation/role changes serialize with assignment or progression.
 IF NEW."assignedStaffId" IS NOT NULL AND
   (TG_OP='INSERT' OR NEW."assignedStaffId" IS DISTINCT FROM OLD."assignedStaffId" OR NEW.status IS DISTINCT FROM OLD.status) THEN
  SELECT u."isActive" AND r."roleName"='Facility/Maintenance Staff' INTO eligible
   FROM "User" u JOIN "Role" r USING ("roleId") WHERE u."userId"=NEW."assignedStaffId" FOR SHARE OF u;
  IF eligible IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assign eligible active maintenance staff before progressing'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER maintenance_integrity BEFORE INSERT OR UPDATE OR DELETE ON "MaintenanceRequest" FOR EACH ROW EXECUTE FUNCTION maintenance_guard();
COMMIT;
