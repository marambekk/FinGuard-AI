-- ===================
-- 1️⃣ Create Database
-- ===================
CREATE DATABASE finguard_db;

-- Connect to the database
\c finguard_db;

-- ===============
-- 2️⃣ Users Table
-- ===============
CREATE TABLE users (
    user_id VARCHAR(20) PRIMARY KEY,  -- Matches your CSV style like U0103
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255) UNIQUE,
    phone_number VARCHAR(30),
    country VARCHAR(100),
    city VARCHAR(100),
    gender VARCHAR(20),
    date_of_birth DATE NOT NULL,
    income_category VARCHAR(50),
    marital_status VARCHAR(20) CHECK (marital_status IN ('single', 'married')),
    education_level VARCHAR(30) CHECK (
        education_level IN ('primary school','middle school','high school','university')
    ),
    account_creation_date TIMESTAMP,
    balance DECIMAL(12,2),
    CHECK (date_of_birth <= CURRENT_DATE - INTERVAL '18 years')
);

-- ================
-- 3️⃣ Admins Table
-- ================
CREATE TABLE admins (
    email VARCHAR(255) PRIMARY KEY,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    salt VARCHAR(255),
    hashed_password VARCHAR(255)
);

-- ===============
-- 4️⃣ Cards Table
-- ===============
CREATE TABLE cards (
    card_number VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(user_id)
);

-- =================
-- 5️⃣ Devices Table
-- =================
CREATE TABLE devices (
    device_id SERIAL PRIMARY KEY,
    device_name VARCHAR(100),
    user_id VARCHAR(20) REFERENCES users(user_id)
);

-- ==========================
-- 6️⃣ Transactions Raw Table
-- ==========================
CREATE TABLE transactions_raw (
    transaction_id VARCHAR(20) PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(user_id),
    card_number VARCHAR(50) REFERENCES cards(card_number),
    transaction_type VARCHAR(50),
    beneficiary VARCHAR(50),
    CHECK (transaction_type IN ('CASH_IN', 'CASH_OUT', 'PAYMENT', 'TRANSFER')),
    timestamp TIMESTAMP,
    amount DECIMAL(12,2),
    country VARCHAR(100),
    city VARCHAR(100),
    device_id INT REFERENCES devices(device_id),
    ip_address VARCHAR(50),
    http_referrer VARCHAR(50)
);

-- ======================================
-- 7️⃣ Transaction Features Table (AI/ML)
-- ======================================
CREATE TABLE transaction_features (
    transaction_id VARCHAR(20) PRIMARY KEY REFERENCES transactions_raw(transaction_id),
    user_id VARCHAR(20) REFERENCES users(user_id),
    amount DECIMAL(12,2),
    transaction_type VARCHAR(50),
    is_new_beneficiary BOOLEAN,
    new_ip_device_combo BOOLEAN,
    otp_burst_flag BOOLEAN,
    phishing_referrer_flag BOOLEAN,
    hour_of_day INT,
    is_odd_hour BOOLEAN,
    avg_daily_txn_amount DECIMAL(12,2),
    amount_ratio DECIMAL(12,2),
    txn_frequency_last_24h INT,
    previous_fraud_flag BOOLEAN,
    email_domain_age_days INT,
    email_domain_verified BOOLEAN,
    is_fraud BOOLEAN
);

-- =========================
-- 8️⃣ Transaction IOC Table
-- =========================
CREATE TABLE transaction_ioc (
    transaction_id VARCHAR(20) PRIMARY KEY REFERENCES transaction_features(transaction_id),

    -- IOC flags
    high_risk_network_origin BOOLEAN, --this can be determined by checking if the IP address belongs to known bad ranges or countries with high fraud rates
    disposable_identity BOOLEAN, --this can be determined by checking if the email domain is from a known disposable email provider
    device_velocity BOOLEAN, --this can be determined by checking if the same device_id has been used for multiple transactions in a short time frame
    pii_change_velocity BOOLEAN,   --this can be determined by checking if the user has changed their email, phone number, or address multiple times in a short time frame
    impossible_travel BOOLEAN      --this can be determined by checking if the user has transactions from geographically distant locations within a short time frame
);

-- ===========================
-- 9️⃣ Transaction State Table
-- ===========================

CREATE TABLE transaction_state (
    transaction_id VARCHAR(20) PRIMARY KEY 
        REFERENCES transactions_raw(transaction_id) 
        ON DELETE CASCADE,

    risk_level VARCHAR(10) NOT NULL
        CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),

    system_action VARCHAR(20) NOT NULL
        CHECK (system_action IN ('APPROVED', 'REJECTED', 'QUARANTINED')),

    analyst_action VARCHAR(20)
        CHECK (analyst_action IN ('APPROVED', 'REJECTED') OR analyst_action IS NULL),

    last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP

    ioc_prob FLOAT,
    
    ml_prob FLOAT,

    final_score FLOAT
);

-- =======================================================================================
-- 🔟 Trigger Function and Trigger to Automatically Notify the Script of New Transactions
-- =======================================================================================


CREATE OR REPLACE FUNCTION notify_new_transaction()
RETURNS trigger AS $$
BEGIN
    -- Use concatenation inside the trigger function
    PERFORM pg_notify('new_transaction', NEW.transaction_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to transactions_raw
CREATE TRIGGER trg_new_transaction
AFTER INSERT ON transactions_raw
FOR EACH ROW
EXECUTE FUNCTION notify_new_transaction();

-- ========================================================
-- 1️⃣1️⃣ Trigger Function: Sync System Action to ML Labels
-- ========================================================

CREATE OR REPLACE FUNCTION sync_fraud_label()
RETURNS trigger AS $$
BEGIN
    -- Update the transaction_features table based on the system_action
    UPDATE transaction_features
    SET is_fraud = CASE 
        WHEN NEW.system_action = 'REJECTED'    THEN TRUE
        WHEN NEW.system_action = 'APPROVED'    THEN FALSE
        WHEN NEW.system_action = 'QUARANTINED' THEN NULL
    END
    WHERE transaction_id = NEW.transaction_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Attach Trigger to transaction_state (This fires every time the scoring script updates the state)
CREATE OR REPLACE TRIGGER trg_sync_fraud_label
AFTER INSERT OR UPDATE ON transaction_state
FOR EACH ROW
EXECUTE FUNCTION sync_fraud_label(); 

-- ========================================================
-- 1️⃣2️⃣ High-risk IP ranges for high_risk_network_origin
-- ========================================================
CREATE TABLE ref_high_risk_ips (
    ip_prefix VARCHAR(50) PRIMARY KEY  -- e.g., '192.168.0.' or '203.0.113.'
);

-- ============================================
-- 1️3️⃣ Disposable / temporary email domains
-- ============================================
CREATE TABLE ref_disposable_domains (
    domain_name VARCHAR(100) PRIMARY KEY  -- e.g., 'mailinator.com'
);

-- ==================================================
-- 1️⃣4️⃣ Malicious URLs for phishing referrer check
-- ==================================================
CREATE TABLE ref_malicious_urls (
    url_pattern VARCHAR(255) PRIMARY KEY  -- e.g., '%phishybank.com%'
);

-- ===================================
-- 1️⃣5️⃣ OTP logs for otp_burst_flag
-- ===================================
CREATE TABLE otp_logs (
    otp_id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(user_id),
    requested_at TIMESTAMP NOT NULL
);

-- =============================================
-- 1️⃣6️⃣ PII audit logs for pii_change_velocity
-- =============================================
CREATE TABLE audit_logs (
    audit_id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(user_id),
    field_changed VARCHAR(50) CHECK (field_changed IN ('email','phone_number','address')),
    old_value TEXT,
    new_value TEXT,
    changed_at TIMESTAMP NOT NULL
);

-- ==============================================
-- 1️⃣7️⃣ Keep history of device usage (optional)
-- ==============================================
CREATE TABLE device_usage_logs (
    log_id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(user_id),
    device_id INT REFERENCES devices(device_id),
    ip_address VARCHAR(50),
    timestamp TIMESTAMP NOT NULL
);
-- =============================================================
-- 1️⃣8️⃣ Trigger Function: Compute Transaction Features and IOCs
-- =============================================================
CREATE OR REPLACE FUNCTION compute_transaction_features_ioc()
RETURNS TRIGGER AS $$
DECLARE
    -- Logic Variables
    v_avg_amount DECIMAL(12,2);
    v_txn_24h INT;
    v_device_txn_1h INT;
    v_otp_count INT;
    v_pii_changes INT;
    v_u_email TEXT;
    v_u_created TIMESTAMP;
    
    -- Record holder for travel check
    v_last_city VARCHAR(100);
    v_last_time TIMESTAMP;
BEGIN
    -- FETCH USER DATA (Handle missing users gracefully)
    SELECT email, account_creation_date 
    INTO v_u_email, v_u_created 
    FROM users WHERE user_id = NEW.user_id;

    -- CALCULATE HISTORICAL AGGREGATES
    -- We exclude the current transaction_id to get true "history"
    SELECT COALESCE(AVG(amount), NEW.amount) INTO v_avg_amount 
    FROM transactions_raw 
    WHERE user_id = NEW.user_id AND transaction_id <> NEW.transaction_id;

    SELECT COUNT(*) INTO v_txn_24h 
    FROM transactions_raw 
    WHERE user_id = NEW.user_id 
    AND timestamp > NEW.timestamp - INTERVAL '24 hours'
    AND transaction_id <> NEW.transaction_id;

    SELECT COUNT(*) INTO v_device_txn_1h 
    FROM transactions_raw 
    WHERE device_id = NEW.device_id 
    AND timestamp > NEW.timestamp - INTERVAL '1 hour'
    AND transaction_id <> NEW.transaction_id;

    -- FETCH LAST LOCATION (For Impossible Travel)
    SELECT city, timestamp INTO v_last_city, v_last_time
    FROM transactions_raw
    WHERE user_id = NEW.user_id AND transaction_id <> NEW.transaction_id
    ORDER BY timestamp DESC LIMIT 1;

    -- CHECK EXTERNAL LOGS
    SELECT COUNT(*) INTO v_otp_count FROM otp_logs 
    WHERE user_id = NEW.user_id AND requested_at > NEW.timestamp - INTERVAL '5 minutes';

    SELECT COUNT(*) INTO v_pii_changes FROM audit_logs 
    WHERE user_id = NEW.user_id AND changed_at > NEW.timestamp - INTERVAL '24 hours';

    -- POPULATE transaction_features
    INSERT INTO transaction_features (
        transaction_id, user_id, amount, transaction_type,
        is_new_beneficiary, new_ip_device_combo, otp_burst_flag,
        phishing_referrer_flag, hour_of_day, is_odd_hour,
        avg_daily_txn_amount, amount_ratio, txn_frequency_last_24h,
        previous_fraud_flag, email_domain_age_days, email_domain_verified, is_fraud
    ) VALUES (
        NEW.transaction_id, 
        NEW.user_id, 
        NEW.amount, 
        NEW.transaction_type,
        -- is_new_beneficiary
        NOT EXISTS (SELECT 1 FROM transactions_raw WHERE user_id = NEW.user_id AND beneficiary = NEW.beneficiary AND transaction_id <> NEW.transaction_id),
        -- new_ip_device_combo
        NOT EXISTS (SELECT 1 FROM transactions_raw WHERE user_id = NEW.user_id AND ip_address = NEW.ip_address AND device_id = NEW.device_id AND transaction_id <> NEW.transaction_id),
        -- otp_burst_flag
        COALESCE(v_otp_count > 3, FALSE),
        -- phishing_referrer_flag (Checks if referrer is in our blacklist)
        EXISTS (SELECT 1 FROM ref_malicious_urls WHERE NEW.http_referrer LIKE url_pattern),
        -- Time features
        EXTRACT(HOUR FROM NEW.timestamp),
        (EXTRACT(HOUR FROM NEW.timestamp) BETWEEN 0 AND 5),
        -- Averages
        v_avg_amount,
        (NEW.amount / NULLIF(v_avg_amount, 0)),
        v_txn_24h,
        -- previous_fraud_flag
        COALESCE((SELECT TRUE FROM transaction_features WHERE user_id = NEW.user_id AND is_fraud = TRUE LIMIT 1), FALSE),
        -- email_age
        COALESCE(EXTRACT(DAY FROM (NEW.timestamp - v_u_created))::INT, 0),
        TRUE, -- email_domain_verified
        FALSE -- is_fraud (default)
    );

    -- POPULATE transaction_ioc
    INSERT INTO transaction_ioc (
        transaction_id,
        high_risk_network_origin,
        disposable_identity,
        device_velocity,
        pii_change_velocity,
        impossible_travel
    ) VALUES (
        NEW.transaction_id,
        -- high_risk_network_origin
        EXISTS (SELECT 1 FROM ref_high_risk_ips WHERE NEW.ip_address LIKE ip_prefix || '%'),
        -- disposable_identity
        EXISTS (SELECT 1 FROM ref_disposable_domains WHERE split_part(v_u_email, '@', 2) = domain_name),
        -- device_velocity
        (v_device_txn_1h > 5),
        -- pii_change_velocity
        (v_pii_changes > 1),
        -- impossible_travel
        (v_last_city IS NOT NULL AND v_last_city <> NEW.city AND (NEW.timestamp - v_last_time) < INTERVAL '1 hour')
    );

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    -- If logic fails, we still want a skeleton record to avoid FK errors in other tables
    RAISE NOTICE 'Error in fraud trigger: %', SQLERRM;
    INSERT INTO transaction_features (transaction_id, user_id, is_fraud) 
    VALUES (NEW.transaction_id, NEW.user_id, FALSE) ON CONFLICT DO NOTHING;
    INSERT INTO transaction_ioc (transaction_id) 
    VALUES (NEW.transaction_id) ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Attach Trigger to transactions_raw
CREATE TRIGGER trg_fraud_pipeline
AFTER INSERT ON transactions_raw
FOR EACH ROW EXECUTE FUNCTION compute_transaction_features_ioc();

⚡-- Update the existing table to default to QUARANTINED
ALTER TABLE transaction_state 
ALTER COLUMN system_action SET DEFAULT 'QUARANTINED';


-- =========================================================
-- 1️⃣9️⃣ This function simulates the entire transaction processing flow
-- =========================================================
CREATE OR REPLACE FUNCTION process_finguard_transaction(
    p_txn_id VARCHAR(20), p_user_id VARCHAR(20), p_amount DECIMAL(12,2),
    p_card VARCHAR(50), p_type VARCHAR(50), p_bene VARCHAR(50),
    p_country VARCHAR(100), p_city VARCHAR(100), p_dev_id INT,
    p_ip VARCHAR(50), p_ref VARCHAR(50)
) RETURNS TEXT AS $$
DECLARE
    v_risk VARCHAR(10);
BEGIN
    -- 1. Log the transaction (This triggers feature calculation)
    INSERT INTO transactions_raw VALUES (p_txn_id, p_user_id, p_card, p_type, p_bene, CURRENT_TIMESTAMP, p_amount, p_country, p_city, p_dev_id, p_ip, p_ref);

    -- 2. Wait for scoring_script.py to update transaction_state
    -- (In a production app, the backend waits for the script to finish)
    SELECT risk_level INTO v_risk FROM transaction_state WHERE transaction_id = p_txn_id;

    IF v_risk = 'LOW' THEN
        UPDATE users SET balance = balance - p_amount WHERE user_id = p_user_id;
        UPDATE transaction_state SET system_action = 'APPROVED' WHERE transaction_id = p_txn_id;
        RETURN 'APPROVED';
    ELSIF v_risk = 'HIGH' THEN
        UPDATE transaction_state SET system_action = 'REJECTED' WHERE transaction_id = p_txn_id;
        RETURN 'REJECTED';
    ELSE
        -- MEDIUM RISK: Balance is NOT updated here
        UPDATE transaction_state SET system_action = 'QUARANTINED' WHERE transaction_id = p_txn_id;
        RETURN 'QUARANTINED';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ===========================
-- 2️⃣0️⃣ synching fraud label
-- ===========================
CREATE OR REPLACE FUNCTION sync_fraud_label()
RETURNS trigger AS $$
BEGIN
    UPDATE transaction_features
    SET is_fraud = CASE 
        WHEN NEW.system_action = 'REJECTED' OR NEW.analyst_action = 'REJECTED' THEN TRUE
        WHEN NEW.system_action = 'APPROVED' OR NEW.analyst_action = 'APPROVED' THEN FALSE
        WHEN NEW.system_action = 'QUARANTINED' AND NEW.analyst_action IS NULL  THEN NULL
    END
    WHERE transaction_id = NEW.transaction_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;





-- =========================================================
-- 2️⃣1️⃣ This function handles the actual movement of money
-- =========================================================
CREATE OR REPLACE FUNCTION execute_ledger_update()
RETURNS TRIGGER AS $$
DECLARE
    v_amount DECIMAL(12,2);
    v_user_id VARCHAR(20);
BEGIN
    -- Only proceed if the transaction is newly APPROVED by system or analyst
    IF (NEW.system_action = 'APPROVED' AND (OLD.system_action IS NULL OR OLD.system_action != 'APPROVED')) 
       OR (NEW.analyst_action = 'APPROVED' AND (OLD.analyst_action IS NULL OR OLD.analyst_action != 'APPROVED')) THEN
        
        -- Get the amount and user from the raw log
        SELECT amount, user_id INTO v_amount, v_user_id 
        FROM transactions_raw WHERE transaction_id = NEW.transaction_id;

        -- Perform the actual balance deduction
        UPDATE users SET balance = balance - v_amount WHERE user_id = v_user_id;
        
        RAISE NOTICE 'Ledger Updated: User % charged %', v_user_id, v_amount;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the state table
CREATE TRIGGER trg_execute_ledger
AFTER INSERT OR UPDATE ON transaction_state
FOR EACH ROW
EXECUTE FUNCTION execute_ledger_update();

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

-- Attach notification trigger to transactions_raw table
CREATE TRIGGER trg_new_transaction
AFTER INSERT ON transactions_raw
FOR EACH ROW
EXECUTE FUNCTION notify_new_transaction();