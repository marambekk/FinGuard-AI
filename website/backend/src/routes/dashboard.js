const express = require("express");
const router = express.Router();
const db = require("../../db"); // Your correct path to db.js

// ===========================
// Test Route
// ===========================
router.get("/test", (req, res) => {
  res.json({ message: "dashboard route working" });
});

// ===========================
// Total Transactions Today
// ===========================
router.get("/total-transactions-today", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COUNT(*) AS total_transactions_today
       FROM transactions_raw
       WHERE timestamp >= CURRENT_DATE
         AND timestamp < CURRENT_DATE + INTERVAL '1 day'`
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// Total Transactions This Week
// ===========================
router.get("/total-transactions-week", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COUNT(*) AS total_transactions_week
       FROM transactions_raw
       WHERE timestamp >= date_trunc('week', CURRENT_DATE)
         AND timestamp < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week'`
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// Total Amount Processed
// ===========================
router.get("/total-amount-processed", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_amount_processed
       FROM transactions_raw`
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// Flagged Transactions Count
// ===========================
router.get("/flagged-transactions", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COUNT(*) AS flagged_transactions
       FROM transaction_state
       WHERE system_action = 'REJECTED'`
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// Fraud vs Normal
// ===========================
router.get("/fraud-status", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COALESCE(is_fraud::text, 'UNKNOWN') AS fraud_status,
              COUNT(*) AS count
       FROM transaction_features
       GROUP BY fraud_status`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// Risk Level Distribution
// ===========================
router.get("/risk-distribution", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT risk_level, COUNT(*) AS count
       FROM transaction_state
       GROUP BY risk_level
       ORDER BY CASE risk_level
                  WHEN 'LOW' THEN 1
                  WHEN 'MEDIUM' THEN 2
                  WHEN 'HIGH' THEN 3
                END`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// Transactions Over Time
// ===========================
router.get("/transactions-over-time", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DATE(timestamp) AS transaction_date,
              COUNT(*) AS transaction_count
       FROM transactions_raw
       GROUP BY DATE(timestamp)
       ORDER BY transaction_date`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// Amount Processed Over Time
// ===========================
router.get("/amount-over-time", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DATE(timestamp) AS transaction_date,
              COALESCE(SUM(amount),0) AS total_amount
       FROM transactions_raw
       GROUP BY DATE(timestamp)
       ORDER BY transaction_date`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// Fraud Transactions Over Time
// ===========================
router.get("/fraud-over-time", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DATE(tr.timestamp) AS transaction_date,
              COUNT(*) AS fraud_count
       FROM transactions_raw tr
       JOIN transaction_state ts
         ON tr.transaction_id = ts.transaction_id
       WHERE ts.system_action = 'REJECTED'
       GROUP BY DATE(tr.timestamp)
       ORDER BY transaction_date`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// High Risk Transactions (Flagged Table)
// ===========================
router.get("/high-risk", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tr.transaction_id,
              tr.user_id,
              tr.amount,
              tr.country,
              tr.city,
              ts.risk_level,
              ts.system_action,
              ts.analyst_action,
              tr.timestamp
       FROM transactions_raw tr
       JOIN transaction_state ts
         ON tr.transaction_id = ts.transaction_id
       WHERE ts.risk_level = 'HIGH'
       ORDER BY tr.timestamp DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// Transaction Detail
// ===========================
router.get("/transaction/:id", async (req, res) => {
  try {
    const transactionId = req.params.id;
    const result = await db.query(
      `SELECT tr.*, tf.*, ti.*, ts.*
       FROM transactions_raw tr
       JOIN transaction_features tf ON tr.transaction_id = tf.transaction_id
       LEFT JOIN transaction_ioc ti ON tr.transaction_id = ti.transaction_id
       JOIN transaction_state ts ON tr.transaction_id = ts.transaction_id
       WHERE tr.transaction_id = $1`, [transactionId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Transaction not found" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// Update Analyst Action
// ===========================
router.put("/transaction/:id/analyst-action", async (req, res) => {
  try {
    const transactionId = req.params.id;
    const { analyst_action } = req.body;
    if (!["APPROVED", "REJECTED"].includes(analyst_action))
      return res.status(400).json({ error: "Invalid analyst action" });

    const result = await db.query(
      `UPDATE transaction_state
       SET analyst_action = $1, last_updated = CURRENT_TIMESTAMP
       WHERE transaction_id = $2
       RETURNING *`,
      [analyst_action, transactionId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Transaction not found" });

    res.json({ message: "Analyst action updated", transaction: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database update failed" });
  }
});

// ===========================
// Analyst Actions Overview
// ===========================
router.get("/analyst-actions", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tr.transaction_id,
              tr.user_id,
              tr.amount,
              tr.country,
              tr.city,
              ts.risk_level,
              ts.system_action,
              ts.analyst_action,
              tr.timestamp
       FROM transactions_raw tr
       JOIN transaction_state ts ON tr.transaction_id = ts.transaction_id
       ORDER BY tr.timestamp DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// Users Summary for Profile Table
// ===========================
router.get("/users-summary", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.user_id,
              u.first_name,
              u.last_name,
              u.country,
              u.city,
              u.balance,
              COUNT(tr.transaction_id) AS total_transactions,
              COALESCE(SUM(tr.amount),0) AS total_volume,
              SUM(CASE WHEN ts.system_action = 'REJECTED' THEN 1 ELSE 0 END) AS suspicious_transactions
       FROM users u
       LEFT JOIN transactions_raw tr ON u.user_id = tr.user_id
       LEFT JOIN transaction_state ts ON tr.transaction_id = ts.transaction_id
       GROUP BY u.user_id, u.first_name, u.last_name, u.country, u.city, u.balance
       ORDER BY total_volume DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// IOC Summary Counts
// ===========================
router.get("/ioc-summary", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT SUM(CASE WHEN high_risk_network_origin THEN 1 ELSE 0 END) AS high_risk_ip,
              SUM(CASE WHEN disposable_identity THEN 1 ELSE 0 END) AS disposable_email,
              SUM(CASE WHEN device_velocity THEN 1 ELSE 0 END) AS device_velocity,
              SUM(CASE WHEN pii_change_velocity THEN 1 ELSE 0 END) AS pii_changes,
              SUM(CASE WHEN impossible_travel THEN 1 ELSE 0 END) AS impossible_travel
       FROM transaction_ioc`
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// Transactions With Any IOC Flag
// ===========================
router.get("/transactions-ioc", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tr.transaction_id,
              tr.user_id,
              tr.amount,
              ti.high_risk_network_origin,
              ti.disposable_identity,
              ti.device_velocity,
              ti.pii_change_velocity,
              ti.impossible_travel
       FROM transactions_raw tr
       JOIN transaction_ioc ti ON tr.transaction_id = ti.transaction_id
       WHERE ti.high_risk_network_origin
          OR ti.disposable_identity
          OR ti.device_velocity
          OR ti.pii_change_velocity
          OR ti.impossible_travel
       ORDER BY tr.timestamp DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ===========================
// IOC Score Ranking
// ===========================
router.get("/ioc-score-ranking", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tr.transaction_id,
              tr.user_id,
              tr.amount,
              ts.risk_level,
              ts.system_action,
              (COALESCE(ti.high_risk_network_origin::int,0) +
               COALESCE(ti.disposable_identity::int,0) +
               COALESCE(ti.device_velocity::int,0) +
               COALESCE(ti.pii_change_velocity::int,0) +
               COALESCE(ti.impossible_travel::int,0)) AS ioc_score
       FROM transactions_raw tr
       LEFT JOIN transaction_ioc ti ON tr.transaction_id = ti.transaction_id
       JOIN transaction_state ts ON tr.transaction_id = ts.transaction_id
       ORDER BY ioc_score DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database query failed" });
  }
});

module.exports = router;