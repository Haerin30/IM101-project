-- Validate structural integrity atomically; preserve legitimate historical differences.
BEGIN;
LOCK TABLE "MaintenanceRequest" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM "MaintenanceRequest" WHERE
  description !~ '[^[:space:]]' OR length(btrim(description)) > 2000
  OR priority NOT IN ('Low','Normal','High','Urgent')
  OR status NOT IN ('Open','In Progress','Resolved')
  OR ("facilityId" IS NULL AND "equipmentId" IS NULL)
  OR (status='Resolved' AND ("resolvedAt" IS NULL OR "resolutionNotes" IS NULL OR "resolutionNotes" !~ '[^[:space:]]' OR length(btrim("resolutionNotes")) > 2000 OR "resolvedAt" < "reportedAt"))
  OR (status<>'Resolved' AND ("resolvedAt" IS NOT NULL OR "resolutionNotes" IS NOT NULL)))
 THEN RAISE EXCEPTION 'Maintenance preflight failed: inspect invalid fields and resolution metadata; do not delete history'; END IF;
 -- Missing or currently ineligible historical assignees and relocated equipment
 -- are review warnings, not evidence that the original report was invalid.
END $$;
ALTER TABLE "MaintenanceRequest"
 ADD CONSTRAINT maintenance_description CHECK (description ~ '[^[:space:]]' AND length(btrim(description)) <= 2000),
 ADD CONSTRAINT maintenance_priority CHECK (priority IN ('Low','Normal','High','Urgent')),
 ADD CONSTRAINT maintenance_status CHECK (status IN ('Open','In Progress','Resolved')),
 ADD CONSTRAINT maintenance_asset CHECK ("facilityId" IS NOT NULL OR "equipmentId" IS NOT NULL),
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
 -- A row-wide CHECK (even NOT VALID) would reject later legacy updates.
 -- Require assignment on transitions, while allowing unchanged legacy nulls.
 -- Do not let assigned In Progress requests lose their assignment.
 IF TG_OP='UPDATE' THEN
  IF (NEW.status IS DISTINCT FROM OLD.status OR
      (OLD."assignedStaffId" IS NOT NULL AND NEW.status='In Progress'))
     AND NEW."assignedStaffId" IS NULL THEN
   RAISE EXCEPTION 'Assign eligible active maintenance staff before progressing';
  END IF;
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
