// ===========================
// auth.controller.js
// ===========================

const pool = require("../../db");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// ===========================
// Password Hash Function
// ===========================
function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");
}

// ===========================
// Admin Registration
// ===========================
const registerAdmin = async (req, res) => {
  try {
    const { email, first_name, last_name, password } = req.body;

    const existing = await pool.query(
      "SELECT * FROM admins WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Admin already exists" });
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const hashedPassword = hashPassword(password, salt);

    await pool.query(
      "INSERT INTO admins (email, first_name, last_name, salt, hashed_password) VALUES ($1, $2, $3, $4, $5)",
      [email, first_name, last_name, salt, hashedPassword]
    );

    res.status(201).json({ message: "Admin registered successfully" });
  } catch (err) {
    console.error("Error in registerAdmin:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ===========================
// Admin Login
// ===========================
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM admins WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const admin = result.rows[0];
    const hashedInput = hashPassword(password, admin.salt);

    if (hashedInput !== admin.hashed_password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { email: admin.email },
      process.env.JWT_SECRET || "supersecretkey",
      { expiresIn: "2h" }
    );

    res.status(200).json({ message: "Login successful", token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ===========================
// Verify JWT Token
// ===========================
const verifyToken = (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ valid: false, error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ valid: false, error: "Token malformed" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET || "supersecretkey");

    res.status(200).json({ valid: true, user: payload });
  } catch (err) {
    res.status(401).json({ valid: false, error: "Invalid or expired token" });
  }
};

// ===========================
// Export all functions properly
// ===========================
module.exports = { registerAdmin, loginAdmin, verifyToken };
