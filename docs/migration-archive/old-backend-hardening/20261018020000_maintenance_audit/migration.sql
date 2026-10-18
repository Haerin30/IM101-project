-- Add audit coverage without rewriting existing maintenance records or schemas.
BEGIN;
CREATE TRIGGER maintenance_audit
AFTER INSERT OR UPDATE OR DELETE ON "MaintenanceRequest"
FOR EACH ROW EXECUTE FUNCTION audit_change('requestId');
COMMIT;
