-- Deliberately fail on invalid existing data; do not silently delete or rewrite bookings.
BEGIN;
ALTER TABLE "User" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "Reservation" ALTER COLUMN "startDatetime" TYPE TIMESTAMPTZ(3) USING "startDatetime" AT TIME ZONE 'UTC', ALTER COLUMN "endDatetime" TYPE TIMESTAMPTZ(3) USING "endDatetime" AT TIME ZONE 'UTC';
ALTER TABLE "EquipmentLoan" ALTER COLUMN "checkoutDate" TYPE TIMESTAMPTZ(3) USING "checkoutDate" AT TIME ZONE 'UTC', ALTER COLUMN "dueDate" TYPE TIMESTAMPTZ(3) USING "dueDate" AT TIME ZONE 'UTC', ALTER COLUMN "returnDate" TYPE TIMESTAMPTZ(3) USING "returnDate" AT TIME ZONE 'UTC';
ALTER TABLE "MaintenanceRequest" ALTER COLUMN "reportedAt" TYPE TIMESTAMPTZ(3) USING "reportedAt" AT TIME ZONE 'UTC', ALTER COLUMN "resolvedAt" TYPE TIMESTAMPTZ(3) USING "resolvedAt" AT TIME ZONE 'UTC';
ALTER TABLE "AuditLog" ALTER COLUMN "changedAt" TYPE TIMESTAMPTZ(3) USING "changedAt" AT TIME ZONE 'UTC';

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
ALTER TABLE "Reservation" ADD COLUMN "blocksSchedule" BOOLEAN NOT NULL DEFAULT true;
UPDATE "Reservation" r SET "blocksSchedule" = s."statusName" IN ('Pending','Approved')
FROM "ReservationStatus" s WHERE s."statusId" = r."statusId";
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_dates CHECK ("endDatetime" > "startDatetime"),
ADD CONSTRAINT reservation_purpose CHECK (length(btrim(purpose)) BETWEEN 1 AND 2000),
ADD CONSTRAINT reservation_no_overlap EXCLUDE USING gist
("facilityId" WITH =, tstzrange("startDatetime","endDatetime",'[)') WITH &&) WHERE ("blocksSchedule");
ALTER TABLE "Equipment" ADD CONSTRAINT equipment_quantities CHECK ("totalQuantity" > 0 AND "availableQuantity" BETWEEN 0 AND "totalQuantity"),
ADD CONSTRAINT equipment_name CHECK (length(btrim("equipmentName")) BETWEEN 1 AND 200);
ALTER TABLE "Equipment" ADD COLUMN "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT damaged_stock CHECK ("damagedQuantity" >= 0 AND "damagedQuantity" + "availableQuantity" <= "totalQuantity");
ALTER TABLE "Facility" ADD CONSTRAINT facility_values CHECK ("capacity" > 0 AND "floorNumber" >= 0 AND length(btrim("facilityName")) BETWEEN 1 AND 200);
ALTER TABLE "Building" ADD CONSTRAINT building_floors CHECK ("floorCount" > 0);
ALTER TABLE "ReservationEquipment" ADD CONSTRAINT allocation_quantity CHECK (quantity > 0);
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT loan_values CHECK
(quantity > 0 AND "dueDate" > "checkoutDate" AND ("returnDate" IS NULL OR "returnDate" >= "checkoutDate") AND
(("loanStatus" = 'Borrowed' AND "returnDate" IS NULL) OR ("loanStatus" = 'Returned' AND "returnDate" IS NOT NULL AND "conditionIn" IS NOT NULL AND "conditionIn" IN ('Good','Fair','Damaged'))));
CREATE INDEX ON "ReservationEquipment" ("equipmentId");
CREATE INDEX ON "EquipmentLoan" ("equipmentId","loanStatus");

-- Fail rather than overwrite unexplained legacy inventory counts.
DO $$
BEGIN
IF EXISTS (
 SELECT 1 FROM "Equipment" e WHERE e."availableQuantity" <> e."totalQuantity"
 - COALESCE((SELECT sum(l.quantity) FROM "EquipmentLoan" l WHERE l."equipmentId"=e."equipmentId" AND l."loanStatus"='Borrowed'),0)
 - COALESCE((SELECT sum(i.quantity) FROM "ReservationEquipment" i JOIN "Reservation" r USING ("reservationId") WHERE i."equipmentId"=e."equipmentId" AND r."blocksSchedule"),0)
) THEN RAISE EXCEPTION 'Reconcile legacy equipment stock before applying integrity migration'; END IF;
END $$;

CREATE FUNCTION equipment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
 IF NEW."availableQuantity" <> NEW."totalQuantity" OR NEW."damagedQuantity" <> 0 THEN RAISE EXCEPTION 'New stock must be fully available'; END IF;
 ELSE
  IF pg_trigger_depth()=1 AND NEW."damagedQuantity" IS DISTINCT FROM OLD."damagedQuantity" THEN RAISE EXCEPTION 'Damage is managed by returns and repair events'; END IF;
  IF pg_trigger_depth() = 1 AND NEW."availableQuantity" <> OLD."availableQuantity" + NEW."totalQuantity" - OLD."totalQuantity" THEN
   -- A total-only update automatically adjusts availability by its delta.
   IF NEW."availableQuantity" = OLD."availableQuantity" THEN
    NEW."availableQuantity" := OLD."availableQuantity" + NEW."totalQuantity" - OLD."totalQuantity";
   ELSE RAISE EXCEPTION 'Availability is managed by allocations and loans'; END IF;
  END IF;
  IF NEW."conditionStatus" IN ('Inactive','Damaged') AND NEW."availableQuantity" + NEW."damagedQuantity" < NEW."totalQuantity" THEN
   RAISE EXCEPTION 'Release allocations and return loans before retiring stock';
  END IF;
 END IF;
 IF NEW."conditionStatus" NOT IN ('Good','Fair','Damaged','Inactive') THEN RAISE EXCEPTION 'Invalid equipment condition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER equipment_integrity BEFORE INSERT OR UPDATE ON "Equipment" FOR EACH ROW EXECUTE FUNCTION equipment_guard();

CREATE FUNCTION change_stock(equipment_id integer, delta integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 UPDATE "Equipment" SET "availableQuantity" = "availableQuantity" + delta
 WHERE "equipmentId" = equipment_id AND "availableQuantity" + delta BETWEEN 0 AND "totalQuantity"
 AND (delta >= 0 OR "conditionStatus" IN ('Good','Fair'));
 IF NOT FOUND THEN RAISE EXCEPTION 'Equipment unavailable or insufficient stock'; END IF;
END $$;

CREATE FUNCTION reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state text; old_state text; facility_state text;
BEGIN
 SELECT "statusName" INTO state FROM "ReservationStatus" WHERE "statusId" = NEW."statusId";
 IF state IS NULL OR state NOT IN ('Pending','Approved','Rejected','Cancelled','Completed') THEN RAISE EXCEPTION 'Invalid reservation status'; END IF;
 NEW."blocksSchedule" := state IN ('Pending','Approved');
 IF TG_OP='INSERT' THEN
  IF state <> 'Pending' OR NEW."approvedBy" IS NOT NULL OR NEW."startDatetime" <= CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'New reservations must be future pending requests'; END IF;
 ELSE
  SELECT "statusName" INTO old_state FROM "ReservationStatus" WHERE "statusId"=OLD."statusId";
  IF NEW."facilityId" <> OLD."facilityId" OR NEW."requestedBy" <> OLD."requestedBy" THEN RAISE EXCEPTION 'Reservation identity is immutable'; END IF;
  IF (NEW.purpose,NEW."startDatetime",NEW."endDatetime") IS DISTINCT FROM (OLD.purpose,OLD."startDatetime",OLD."endDatetime")
   AND (old_state <> 'Pending' OR state <> 'Pending' OR NEW."startDatetime" <= CURRENT_TIMESTAMP) THEN RAISE EXCEPTION 'Only future pending reservations can be edited'; END IF;
  IF state <> old_state AND NOT ((old_state='Pending' AND state IN ('Approved','Rejected','Cancelled')) OR (old_state='Approved' AND state IN ('Cancelled','Completed'))) THEN RAISE EXCEPTION 'Invalid reservation transition'; END IF;
  IF state='Completed' AND OLD."endDatetime" > CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Reservation has not ended'; END IF;
  IF state='Approved' AND old_state <> state AND NEW."startDatetime" <= CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Reservation has started'; END IF;
  IF NEW."approvedBy" IS DISTINCT FROM OLD."approvedBy" AND NOT (old_state='Pending' AND state='Approved') THEN RAISE EXCEPTION 'Approver is immutable outside approval'; END IF;
 END IF;
 IF state='Approved' AND NEW."approvedBy" IS NULL THEN RAISE EXCEPTION 'Approver required'; END IF;
 IF NEW."blocksSchedule" THEN
  SELECT status INTO facility_state FROM "Facility" WHERE "facilityId"=NEW."facilityId" FOR UPDATE;
  IF facility_state IS DISTINCT FROM 'Available' THEN RAISE EXCEPTION 'Facility unavailable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reservation_integrity BEFORE INSERT OR UPDATE ON "Reservation" FOR EACH ROW EXECUTE FUNCTION reservation_guard();

CREATE FUNCTION facility_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE floors integer;
BEGIN
 IF NEW.status NOT IN ('Available','Maintenance','Inactive') THEN RAISE EXCEPTION 'Invalid facility status'; END IF;
 SELECT "floorCount" INTO floors FROM "Building" WHERE "buildingId"=NEW."buildingId" FOR SHARE;
 IF NEW."floorNumber" > floors THEN RAISE EXCEPTION 'Floor exceeds building floor count'; END IF;
 IF TG_OP='UPDATE' AND NEW.status <> 'Available' AND EXISTS
 (SELECT 1 FROM "Reservation" WHERE "facilityId"=NEW."facilityId" AND "blocksSchedule") THEN
  RAISE EXCEPTION 'Cancel or complete active reservations before deactivation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER facility_integrity BEFORE INSERT OR UPDATE ON "Facility" FOR EACH ROW EXECUTE FUNCTION facility_guard();

CREATE FUNCTION allocation_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active boolean;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Replace allocations instead of updating them'; END IF;
 IF TG_OP='DELETE' THEN
  SELECT "blocksSchedule" INTO active FROM "Reservation" WHERE "reservationId"=OLD."reservationId" FOR UPDATE;
  IF active THEN PERFORM change_stock(OLD."equipmentId",OLD.quantity); END IF;
  RETURN OLD;
 END IF;
 SELECT "blocksSchedule" INTO active FROM "Reservation" WHERE "reservationId"=NEW."reservationId" AND "startDatetime">CURRENT_TIMESTAMP
 AND "statusId"=(SELECT "statusId" FROM "ReservationStatus" WHERE "statusName"='Pending') FOR UPDATE;
 IF active IS DISTINCT FROM true THEN RAISE EXCEPTION 'Allocations require a future pending reservation'; END IF;
 PERFORM change_stock(NEW."equipmentId",-NEW.quantity);
 RETURN NEW;
END $$;
CREATE TRIGGER allocation_inventory BEFORE INSERT OR UPDATE OR DELETE ON "ReservationEquipment" FOR EACH ROW EXECUTE FUNCTION allocation_stock();

CREATE FUNCTION reservation_release_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item record;
BEGIN
 IF OLD."blocksSchedule" AND NOT NEW."blocksSchedule" THEN
  FOR item IN SELECT * FROM "ReservationEquipment" WHERE "reservationId"=NEW."reservationId" ORDER BY "equipmentId" LOOP
   PERFORM change_stock(item."equipmentId",item.quantity);
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reservation_release AFTER UPDATE ON "Reservation" FOR EACH ROW EXECUTE FUNCTION reservation_release_stock();

CREATE FUNCTION loan_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Loans are retained as history'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."loanStatus"<>'Borrowed' OR NEW."returnDate" IS NOT NULL OR NEW."approvedBy" IS NULL THEN RAISE EXCEPTION 'New loans must be approved checkouts'; END IF;
  PERFORM change_stock(NEW."equipmentId",-NEW.quantity);
 ELSE
  IF OLD."loanStatus"<>'Borrowed' OR NEW."loanStatus"<>'Returned' OR NEW."returnDate" IS NULL OR
  (NEW."equipmentId",NEW."userId",NEW.quantity,NEW."approvedBy",NEW."checkoutDate",NEW."dueDate",NEW."conditionOut")
  IS DISTINCT FROM (OLD."equipmentId",OLD."userId",OLD.quantity,OLD."approvedBy",OLD."checkoutDate",OLD."dueDate",OLD."conditionOut")
  THEN RAISE EXCEPTION 'Only an outstanding loan may be returned; loan details are immutable'; END IF;
  IF NEW."conditionIn" NOT IN ('Good','Fair','Damaged') THEN RAISE EXCEPTION 'Invalid return condition'; END IF;
  IF NEW."conditionIn"='Damaged' THEN
   UPDATE "Equipment" SET "damagedQuantity"="damagedQuantity"+NEW.quantity WHERE "equipmentId"=NEW."equipmentId";
  ELSE
   PERFORM change_stock(NEW."equipmentId",NEW.quantity);
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER loan_inventory BEFORE INSERT OR UPDATE OR DELETE ON "EquipmentLoan" FOR EACH ROW EXECUTE FUNCTION loan_stock();

-- Invoker rights: callers still need normal table permissions. Never SECURITY DEFINER.
CREATE FUNCTION transition_reservation(reservation_id integer, next_status text, actor_id integer) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE row_data "Reservation"; actor_role text; target integer;
BEGIN
 SELECT * INTO row_data FROM "Reservation" WHERE "reservationId"=reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
 SELECT r."roleName" INTO actor_role FROM "User" u JOIN "Role" r USING ("roleId") WHERE u."userId"=actor_id AND u."isActive";
 IF actor_role IS NULL OR NOT (actor_role IN ('System Administrator','Facility/Maintenance Staff') OR
 (actor_role='Faculty Member / Student Organization Representative' AND row_data."requestedBy"=actor_id AND next_status='Cancelled')) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF next_status NOT IN ('Approved','Rejected','Cancelled','Completed') THEN RAISE EXCEPTION 'Invalid transition'; END IF;
 SELECT "statusId" INTO target FROM "ReservationStatus" WHERE "statusName"=next_status;
 PERFORM set_config('app.user_id',actor_id::text,true);
 UPDATE "Reservation" SET "statusId"=target,"approvedBy"=CASE WHEN next_status='Approved' THEN actor_id ELSE "approvedBy" END WHERE "reservationId"=reservation_id;
 RETURN reservation_id;
END $$;

CREATE FUNCTION audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous jsonb; current_row jsonb;
BEGIN
 previous := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 current_row := CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 INSERT INTO "AuditLog" ("tableName","recordId","actionType","changedBy","oldValue","newValue")
 VALUES (TG_TABLE_NAME,(COALESCE(current_row,previous)->>TG_ARGV[0])::integer,TG_OP,
 NULLIF(current_setting('app.user_id',true),'')::integer,previous,current_row);
 RETURN NULL;
END $$;
CREATE TRIGGER reservation_audit AFTER INSERT OR UPDATE OR DELETE ON "Reservation" FOR EACH ROW EXECUTE FUNCTION audit_change('reservationId');
CREATE TRIGGER equipment_audit AFTER INSERT OR UPDATE OR DELETE ON "Equipment" FOR EACH ROW EXECUTE FUNCTION audit_change('equipmentId');
CREATE TRIGGER facility_audit AFTER INSERT OR UPDATE OR DELETE ON "Facility" FOR EACH ROW EXECUTE FUNCTION audit_change('facilityId');
CREATE TRIGGER loan_audit AFTER INSERT OR UPDATE OR DELETE ON "EquipmentLoan" FOR EACH ROW EXECUTE FUNCTION audit_change('loanId');
CREATE TRIGGER allocation_audit AFTER INSERT OR UPDATE OR DELETE ON "ReservationEquipment" FOR EACH ROW EXECUTE FUNCTION audit_change('reservationId');

CREATE TABLE "AuthSession" (key TEXT PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("userId") ON DELETE CASCADE, "expiresAt" TIMESTAMPTZ(3) NOT NULL);
CREATE INDEX ON "AuthSession" ("expiresAt");
CREATE TABLE "LoginAttempt" (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until TIMESTAMPTZ(3) NOT NULL);
CREATE INDEX ON "LoginAttempt" (until);
-- Invalidate sessions immediately after password changes or account deactivation.
CREATE FUNCTION revoke_user_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."passwordHash" IS DISTINCT FROM OLD."passwordHash" OR NOT NEW."isActive" THEN
  DELETE FROM "AuthSession" WHERE "userId"=NEW."userId";
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER user_session_revocation AFTER UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION revoke_user_sessions();
-- Canonical role and status names are part of the access and lifecycle contract.
CREATE FUNCTION immutable_lookup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'Canonical security lookup entries are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER role_names BEFORE UPDATE OR DELETE ON "Role" FOR EACH ROW EXECUTE FUNCTION immutable_lookup();
CREATE TRIGGER status_names BEFORE UPDATE OR DELETE ON "ReservationStatus" FOR EACH ROW EXECUTE FUNCTION immutable_lookup();
-- Retire the three published legacy demo identities. Provision a new admin with a unique email.
UPDATE "User" SET "isActive"=false WHERE
 (email='admin@campus.local' AND "idNumber"='ADM-001') OR
 (email='staff@campus.local' AND "idNumber"='STF-001') OR
 (email='faculty@campus.local' AND "idNumber"='FAC-001');
CREATE TABLE "EquipmentRepair" (
 "repairId" SERIAL PRIMARY KEY,
 "equipmentId" INTEGER NOT NULL REFERENCES "Equipment"("equipmentId"),
 quantity INTEGER NOT NULL CHECK (quantity > 0),
 "repairedBy" INTEGER NOT NULL REFERENCES "User"("userId"),
 "repairedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION repair_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Repair events are immutable'; END IF;
 UPDATE "Equipment" SET "damagedQuantity"="damagedQuantity"-NEW.quantity,"availableQuantity"="availableQuantity"+NEW.quantity
 WHERE "equipmentId"=NEW."equipmentId" AND "damagedQuantity">=NEW.quantity;
 IF NOT FOUND THEN RAISE EXCEPTION 'Repair quantity exceeds damaged stock'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER repair_inventory BEFORE INSERT OR UPDATE OR DELETE ON "EquipmentRepair" FOR EACH ROW EXECUTE FUNCTION repair_stock();
CREATE TRIGGER repair_audit AFTER INSERT ON "EquipmentRepair" FOR EACH ROW EXECUTE FUNCTION audit_change('repairId');
COMMIT;



