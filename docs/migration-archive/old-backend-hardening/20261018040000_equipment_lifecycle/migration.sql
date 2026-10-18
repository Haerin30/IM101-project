BEGIN;
LOCK TABLE "Equipment" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM "Equipment" WHERE "conditionStatus" NOT IN ('Good','Fair','Damaged','Inactive')) THEN
  RAISE EXCEPTION 'Equipment preflight failed: review unsupported physical conditions';
 END IF;
 IF EXISTS (SELECT 1 FROM "Equipment" e WHERE e."conditionStatus" IN ('Inactive','Damaged') AND e."availableQuantity"+e."damagedQuantity"<e."totalQuantity") THEN
  RAISE EXCEPTION 'Equipment preflight failed: release outstanding commitments before converting inactive/damaged stock';
 END IF;
END $$;
ALTER TABLE "Equipment" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Equipment" ALTER COLUMN "conditionStatus" DROP NOT NULL;
-- Preserve deactivation; NULL explicitly means that the previous physical condition is unknown.
-- The existing audit trigger retains both old and new snapshots. No guessed condition.
UPDATE "Equipment" SET "isActive"=false,"conditionStatus"=NULL WHERE "conditionStatus"='Inactive';
ALTER TABLE "Equipment" ADD CONSTRAINT equipment_condition CHECK
 (("conditionStatus" IS NOT NULL AND "conditionStatus" IN ('Good','Fair','Damaged')) OR (NOT "isActive" AND "conditionStatus" IS NULL));
CREATE OR REPLACE FUNCTION equipment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."availableQuantity"<>NEW."totalQuantity" OR NEW."damagedQuantity"<>0 THEN RAISE EXCEPTION 'New stock must be fully available'; END IF;
 ELSE
  IF pg_trigger_depth()=1 AND NEW."damagedQuantity" IS DISTINCT FROM OLD."damagedQuantity" THEN RAISE EXCEPTION 'Damage is managed by returns and repair events'; END IF;
  IF pg_trigger_depth()=1 AND NEW."availableQuantity"<>OLD."availableQuantity"+NEW."totalQuantity"-OLD."totalQuantity" THEN
   IF NEW."availableQuantity"=OLD."availableQuantity" THEN NEW."availableQuantity":=OLD."availableQuantity"+NEW."totalQuantity"-OLD."totalQuantity";
   ELSE RAISE EXCEPTION 'Availability is managed by allocations and loans'; END IF;
  END IF;
  IF (NOT NEW."isActive" OR NEW."conditionStatus"='Damaged') AND NEW."availableQuantity"+NEW."damagedQuantity"<NEW."totalQuantity" THEN
   RAISE EXCEPTION 'Release allocations and return loans before retiring stock';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION change_stock(equipment_id integer, delta integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 UPDATE "Equipment" SET "availableQuantity"="availableQuantity"+delta
 WHERE "equipmentId"=equipment_id AND "availableQuantity"+delta BETWEEN 0 AND "totalQuantity"
 AND (delta>=0 OR ("isActive" AND "conditionStatus" IN ('Good','Fair')));
 IF NOT FOUND THEN RAISE EXCEPTION 'Equipment inactive, unavailable or insufficient stock'; END IF;
END $$;
COMMIT;
