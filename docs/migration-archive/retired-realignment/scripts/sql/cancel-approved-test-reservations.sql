-- REVIEW DRAFT ONLY. Never included in the Prisma migration directory.
-- Run only AFTER approved schema realignment and separate cancellation approval.
-- Required session settings are listed in docs/approved-schema-migration.md.
-- No purposes, facilities, actor IDs or expected times are guessed here.
BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL TIME ZONE 'UTC';

DO $cancel_tests$
DECLARE
    actor integer := NULLIF(current_setting('im101.cancel_actor_id', true),'')::integer;
    purpose_one text := current_setting('im101.cancel_purpose_1', true);
    purpose_two text := current_setting('im101.cancel_purpose_2', true);
    facility_one integer := NULLIF(current_setting('im101.cancel_facility_1', true),'')::integer;
    facility_two integer := NULLIF(current_setting('im101.cancel_facility_2', true),'')::integer;
    start_one timestamptz := NULLIF(current_setting('im101.cancel_start_1', true),'')::timestamptz;
    end_one timestamptz := NULLIF(current_setting('im101.cancel_end_1', true),'')::timestamptz;
    start_two timestamptz := NULLIF(current_setting('im101.cancel_start_2', true),'')::timestamptz;
    end_two timestamptz := NULLIF(current_setting('im101.cancel_end_2', true),'')::timestamptz;
    pending_id integer;
    cancelled_id integer;
    changed integer;
    audit_count bigint;
    before_rows jsonb;
    after_rows jsonb;
    equipment_before jsonb;
    allocations_before jsonb;
    loans_before jsonb;
BEGIN
    IF current_setting('im101.cancellation_approved', true) IS DISTINCT FROM 'yes' THEN
        RAISE EXCEPTION 'Separate approval to cancel reservations 1 and 2 is required';
    END IF;
    IF actor IS NULL OR purpose_one IS NULL OR purpose_two IS NULL
       OR facility_one IS NULL OR facility_two IS NULL
       OR start_one IS NULL OR end_one IS NULL OR start_two IS NULL OR end_two IS NULL THEN
        RAISE EXCEPTION 'Provide independently reviewed purposes, facilities, UTC schedules and actor; no inferred defaults';
    END IF;
    LOCK TABLE public.reservations, public.audit_logs, public.equipment,
        public.reservation_equipment, public.equipment_loans,
        public.users, public.roles, public.reservation_status
        IN SHARE ROW EXCLUSIVE MODE;
    -- This draft inserts its own audit events. Future Task C triggers require review.
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal
        AND tgrelid IN ('public.reservations'::regclass,'public.audit_logs'::regclass)) THEN
        RAISE EXCEPTION 'Unexpected reservation/audit triggers; stop to avoid duplicate or unreviewed effects';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users u JOIN public.roles r USING(role_id)
        WHERE u.user_id=actor AND u.is_active AND r.role_name='System Administrator') THEN
        RAISE EXCEPTION 'Cancellation actor must be an existing active System Administrator';
    END IF;
    SELECT status_id INTO STRICT pending_id FROM public.reservation_status WHERE status_name='Pending';
    SELECT status_id INTO STRICT cancelled_id FROM public.reservation_status WHERE status_name='Cancelled';
    PERFORM 1 FROM public.reservations WHERE reservation_id IN (1,2) ORDER BY reservation_id FOR UPDATE;
    IF (SELECT count(*) FROM public.reservations)<>2
       OR NOT EXISTS (SELECT 1 FROM public.reservations WHERE reservation_id=1
         AND purpose=purpose_one AND facility_id=facility_one AND status_id=pending_id
         AND start_datetime=start_one AND end_datetime=end_one)
       OR NOT EXISTS (SELECT 1 FROM public.reservations WHERE reservation_id=2
         AND purpose=purpose_two AND facility_id=facility_two AND status_id=pending_id
         AND start_datetime=start_two AND end_datetime=end_two) THEN
        RAISE EXCEPTION 'Reviewed reservation IDs, purposes, facilities, schedules or Pending status do not match';
    END IF;
    IF EXISTS (SELECT 1 FROM public.reservation_equipment)
       OR EXISTS (SELECT 1 FROM public.equipment_loans)
       OR (SELECT count(*) FROM public.equipment)<>1
       OR NOT EXISTS (SELECT 1 FROM public.equipment WHERE equipment_name='Projector'
         AND total_quantity=15 AND available_quantity=15) THEN
        RAISE EXCEPTION 'Reviewed empty commitments or Projector 15/15 inventory changed';
    END IF;
    SELECT count(*) INTO audit_count FROM public.audit_logs;
    IF audit_count<>8 THEN
        RAISE EXCEPTION 'Expected eight realignment audit events before cancellation; review intervening operations';
    END IF;
    SELECT jsonb_agg(to_jsonb(r) ORDER BY reservation_id) INTO before_rows FROM public.reservations r;
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY equipment_id),'[]'::jsonb) INTO equipment_before FROM public.equipment e;
    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY reservation_id,equipment_id),'[]'::jsonb) INTO allocations_before FROM public.reservation_equipment a;
    SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY loan_id),'[]'::jsonb) INTO loans_before FROM public.equipment_loans l;

    UPDATE public.reservations SET status_id=cancelled_id
    WHERE reservation_id IN (1,2) AND status_id=pending_id;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed<>2 THEN RAISE EXCEPTION 'Exactly two reservations must change'; END IF;

    INSERT INTO public.audit_logs(table_name,record_id,action_type,changed_by,old_value,new_value)
    SELECT 'reservations',r.reservation_id,'UPDATE',actor,b.value,to_jsonb(r)
    FROM public.reservations r
    JOIN jsonb_array_elements(before_rows) b(value)
      ON (b.value->>'reservation_id')::integer=r.reservation_id
    WHERE r.reservation_id IN (1,2);
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed<>2 THEN RAISE EXCEPTION 'Exactly two attributable audit events must be inserted'; END IF;

    SELECT jsonb_agg(to_jsonb(r) ORDER BY reservation_id) INTO after_rows FROM public.reservations r;
    IF (SELECT jsonb_agg(value-'status_id' ORDER BY (value->>'reservation_id')::integer)
        FROM jsonb_array_elements(before_rows)) IS DISTINCT FROM
       (SELECT jsonb_agg(value-'status_id' ORDER BY (value->>'reservation_id')::integer)
        FROM jsonb_array_elements(after_rows))
       OR (SELECT count(*) FROM public.reservations WHERE reservation_id IN (1,2) AND status_id=cancelled_id)<>2
       OR (SELECT count(*) FROM public.audit_logs)<>audit_count+2
       OR equipment_before IS DISTINCT FROM
          (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY equipment_id),'[]'::jsonb) FROM public.equipment e)
       OR allocations_before IS DISTINCT FROM
          (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY reservation_id,equipment_id),'[]'::jsonb) FROM public.reservation_equipment a)
       OR loans_before IS DISTINCT FROM
          (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY loan_id),'[]'::jsonb) FROM public.equipment_loans l) THEN
        RAISE EXCEPTION 'Cancellation preservation check failed; entire transaction will roll back';
    END IF;
END $cancel_tests$;
COMMIT;
