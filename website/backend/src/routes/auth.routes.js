// Import the Express library
// Express is used to create routes and handle HTTP requests
const express = require("express");

// Create a new Router object
// Router allows you to define route handlers in a modular way instead of directly in app.js
const router = express.Router();

// Use the path down/up to the auth.controller.js file to import the sign in (login) and sign up (registration) functions
// These functions contain the logic for registering and logging in admins
const { registerAdmin, loginAdmin, verifyToken } = require("../controllers/auth.controller");

// ===========================
// Admin Registration Route
// ===========================
// This route listens for POST mthod requests to /register
// When someone sends data to /register, the registerAdmin controller function is executed
router.post("/register", registerAdmin);

// ===========================
// Admin Login Route
// ===========================
// This route listens for POST method requests to /login
// When someone sends login credentials to /login, the loginAdmin controller function is executed
router.post("/login", loginAdmin);

// ===========================
// Token Verification
// ===========================
// Token verification route (for dashboard auth)
router.post("/verify-token", verifyToken);

// Export the router so it can be used in the main server file (app.js or server.js)
// This allows you to mount these routes under a path like /auth
module.exports = router;


