-- ==========================================
-- 🔧 INDEXES (RUN ONCE)
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_transactions_time 
ON transactions_raw(timestamp);

CREATE INDEX IF NOT EXISTS idx_transactions_user 
ON transactions_raw(user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_country 
ON transactions_raw(country);

CREATE INDEX IF NOT EXISTS idx_state_action 
ON transaction_state(system_action);

CREATE INDEX IF NOT EXISTS idx_state_risk 
ON transaction_state(risk_level);

CREATE INDEX IF NOT EXISTS idx_features_fraud 
ON transaction_features(is_fraud);

CREATE INDEX IF NOT EXISTS idx_ioc_tx 
ON transaction_ioc(transaction_id);

CREATE INDEX IF NOT EXISTS idx_state_tx 
ON transaction_state(transaction_id);



-- ==========================================
-- 📊 TOTAL TRANSACTIONS TODAY
-- ==========================================
SELECT COUNT(*) AS total_transactions_today
FROM transactions_raw
WHERE timestamp >= CURRENT_DATE
  AND timestamp < CURRENT_DATE + INTERVAL '1 day';



-- ==========================================
-- 📊 TOTAL TRANSACTIONS THIS WEEK
-- ==========================================
SELECT COUNT(*) AS total_transactions_week
FROM transactions_raw
WHERE timestamp >= date_trunc('week', CURRENT_DATE)
  AND timestamp < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week';



-- ==========================================
-- 💰 TOTAL AMOUNT PROCESSED
-- ==========================================
SELECT COALESCE(SUM(amount), 0) AS total_amount_processed
FROM transactions_raw;



-- ==========================================
-- 🚨 FLAGGED TRANSACTIONS COUNT
-- ==========================================
SELECT COUNT(*) AS flagged_transactions
FROM transaction_state
WHERE system_action = 'REJECTED';



-- ==========================================
-- 🤖 FRAUD VS NORMAL
-- ==========================================
SELECT 
    COALESCE(is_fraud::text, 'UNKNOWN') AS fraud_status,
    COUNT(*) AS count
FROM transaction_features
GROUP BY fraud_status;



-- ==========================================
-- 📊 RISK LEVEL DISTRIBUTION
-- ==========================================
SELECT 
    risk_level,
    COUNT(*) AS count
FROM transaction_state
GROUP BY risk_level
ORDER BY 
    CASE risk_level
        WHEN 'LOW' THEN 1
        WHEN 'MEDIUM' THEN 2
        WHEN 'HIGH' THEN 3
    END;



-- ==========================================
-- 📈 TRANSACTIONS OVER TIME
-- ==========================================
SELECT 
    DATE(timestamp) AS transaction_date,
    COUNT(*) AS transaction_count
FROM transactions_raw
GROUP BY DATE(timestamp)
ORDER BY transaction_date;



-- ==========================================
-- 📉 FRAUD TRANSACTIONS OVER TIME
-- ==========================================
SELECT 
    DATE(tr.timestamp) AS transaction_date,
    COUNT(*) AS fraud_count
FROM transactions_raw tr
JOIN transaction_state ts 
    ON tr.transaction_id = ts.transaction_id
WHERE ts.system_action = 'REJECTED'
GROUP BY DATE(tr.timestamp)
ORDER BY transaction_date;



-- ==========================================
-- 🚨 FLAGGED TRANSACTIONS TABLE
-- ==========================================
SELECT 
    tr.transaction_id,
    tr.user_id,
    tr.amount,
    tr.country,
    tr.city,
    ts.risk_level,
    ts.system_action,
    ts.analyst_action
FROM transactions_raw tr
JOIN transaction_state ts 
    ON tr.transaction_id = ts.transaction_id
WHERE ts.risk_level = 'HIGH'
ORDER BY tr.timestamp DESC;



-- ==========================================
-- 🔍 TRANSACTION DETAIL VIEW
-- ==========================================
SELECT 
    tr.*,
    tf.*,
    ti.*,
    ts.*
FROM transactions_raw tr
JOIN transaction_features tf 
    ON tr.transaction_id = tf.transaction_id
LEFT JOIN transaction_ioc ti 
    ON tr.transaction_id = ti.transaction_id
JOIN transaction_state ts 
    ON tr.transaction_id = ts.transaction_id
WHERE tr.transaction_id = $1;



-- ==========================================
-- 👤 BASIC USER LIST
-- ==========================================
SELECT 
    u.user_id,
    u.first_name,
    u.last_name,
    u.country,
    u.city,
    u.balance
FROM users u
ORDER BY u.user_id;



-- ==========================================
-- 🚨 SUSPICIOUS ACTIVITY COUNT (PER USER)
-- ==========================================
SELECT 
    tr.user_id,
    COUNT(*) AS suspicious_transactions
FROM transactions_raw tr
JOIN transaction_state ts
    ON tr.transaction_id = ts.transaction_id
WHERE ts.system_action = 'REJECTED'
GROUP BY tr.user_id;



-- ==========================================
-- 💰 TOTAL TRANSACTION VOLUME (PER USER)
-- ==========================================
SELECT 
    user_id,
    COUNT(*) AS total_transactions,
    COALESCE(SUM(amount), 0) AS total_volume
FROM transactions_raw
GROUP BY user_id;



-- ==========================================
-- 📜 FULL TRANSACTION HISTORY (USER)
-- ==========================================
SELECT 
    tr.transaction_id,
    tr.timestamp,
    tr.amount,
    tr.country,
    tr.city,
    ts.risk_level,
    ts.system_action
FROM transactions_raw tr
JOIN transaction_state ts
    ON tr.transaction_id = ts.transaction_id
WHERE tr.user_id = $1
ORDER BY tr.timestamp DESC;



-- ==========================================
-- 🌍 FRAUD BY COUNTRY
-- ==========================================
SELECT 
    tr.country,
    COUNT(*) AS fraud_count
FROM transactions_raw tr
JOIN transaction_state ts
    ON tr.transaction_id = ts.transaction_id
WHERE ts.system_action = 'REJECTED'
GROUP BY tr.country
ORDER BY fraud_count DESC;



-- ==========================================
-- ⚠️ IOC SUMMARY COUNTS
-- ==========================================
SELECT 
    SUM(CASE WHEN high_risk_network_origin THEN 1 ELSE 0 END) AS high_risk_ip,
    SUM(CASE WHEN disposable_identity THEN 1 ELSE 0 END) AS disposable_email,
    SUM(CASE WHEN device_velocity THEN 1 ELSE 0 END) AS device_velocity,
    SUM(CASE WHEN pii_change_velocity THEN 1 ELSE 0 END) AS pii_changes,
    SUM(CASE WHEN impossible_travel THEN 1 ELSE 0 END) AS impossible_travel
FROM transaction_ioc;



-- ==========================================
-- 🚨 TRANSACTIONS WITH ANY IOC FLAG
-- ==========================================
SELECT 
    tr.transaction_id,
    tr.user_id,
    tr.amount,
    ti.high_risk_network_origin,
    ti.disposable_identity,
    ti.device_velocity,
    ti.pii_change_velocity,
    ti.impossible_travel
FROM transactions_raw tr
JOIN transaction_ioc ti
    ON tr.transaction_id = ti.transaction_id
WHERE 
    ti.high_risk_network_origin
    OR ti.disposable_identity
    OR ti.device_velocity
    OR ti.pii_change_velocity
    OR ti.impossible_travel
ORDER BY tr.timestamp DESC;



-- ==========================================
-- 🔥 IOC SCORE RANKING
-- ==========================================
SELECT 
    tr.transaction_id,
    tr.user_id,
    tr.amount,
    ts.risk_level,
    ts.system_action,
    
    (
        COALESCE(ti.high_risk_network_origin::int,0) +
        COALESCE(ti.disposable_identity::int,0) +
        COALESCE(ti.device_velocity::int,0) +
        COALESCE(ti.pii_change_velocity::int,0) +
        COALESCE(ti.impossible_travel::int,0)
    ) AS ioc_score

FROM transactions_raw tr
LEFT JOIN transaction_ioc ti 
    ON tr.transaction_id = ti.transaction_id
JOIN transaction_state ts
    ON tr.transaction_id = ts.transaction_id
ORDER BY ioc_score DESC;
