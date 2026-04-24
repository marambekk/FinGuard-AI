-- =========================================================
-- NOTIFICATION TRIGGER: Notify listeners on new transactions
-- =========================================================
CREATE OR REPLACE FUNCTION notify_new_transaction()
RETURNS TRIGGER AS $$
BEGIN
    -- Send notification with transaction_id as payload
    PERFORM pg_notify('new_transaction', NEW.transaction_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trg_new_transaction if it exists (to avoid conflicts)
DROP TRIGGER IF EXISTS trg_new_transaction ON transactions_raw;

-- Attach notification trigger to transactions_raw table
CREATE TRIGGER trg_new_transaction
AFTER INSERT ON transactions_raw
FOR EACH ROW
EXECUTE FUNCTION notify_new_transaction();
