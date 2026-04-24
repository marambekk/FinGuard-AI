const express = require("express");
const WebSocket = require("ws");
const cors = require("cors");
const path = require("path");
const { Client } = require("pg");

// Load Environment Variables
if (process.env.NODE_ENV !== 'production') {
    require("dotenv").config({ path: path.resolve(__dirname, "../../database_connection/.env") });
}

const app = express();
app.use(cors());
app.use(express.json());

// --- FRONTEND SERVING LOGIC (FIXED PATHS) ---
// We use '..' to go up from 'website/backend' to 'website'
const FRONTEND_AUTH_PATH = path.join(__dirname, "..", "frontend_auth");
const DASHBOARD_PATH = path.join(__dirname, "..", "dashboard");

// Serve static files (CSS, JS, Images) for each section
app.use("/frontend_auth", express.static(FRONTEND_AUTH_PATH));
app.use("/dashboard", express.static(DASHBOARD_PATH));

// Default route: Serve the Sign In page
app.get("/", (req, res) => {
    res.sendFile(path.join(FRONTEND_AUTH_PATH, "SignInPage.html"));
});
// --------------------------------------------

// Routes
const authRoutes = require("./src/routes/auth.routes");
const dashboardRoutes = require("./src/routes/dashboard");
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => console.log(`🚀 FinGuard Full-Stack Live on port ${PORT}`));

// 6. WebSocket Setup
const wss = new WebSocket.Server({ server });

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

wss.on("connection", (ws) => {
    console.log("✅ WebSocket client connected");
    ws.send(JSON.stringify({ message: "Connected to FinGuard AI Real-time Engine" }));
    ws.on("close", () => console.log("❌ Client disconnected"));
});

// 7. PostgreSQL Real-time Listener (Neon Optimized)
const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Neon cloud connections
    }
});

async function startPostgresListener() {
    try {
        await pgClient.connect();
        await pgClient.query("LISTEN new_transaction");
        console.log("📡 Listening for PostgreSQL notifications on channel: new_transaction");
    } catch (err) {
        console.error("❌ Failed to start PostgreSQL listener:", err);
    }
}

pgClient.on("notification", (msg) => {
    console.log("📡 DB EVENT RECEIVED:", msg.payload);
    let event;
    try {
        event = JSON.parse(msg.payload);
    } catch (e) {
        event = { type: msg.channel, transaction_id: msg.payload };
    }
    broadcast({ type: event.type || msg.channel, data: event });
});

pgClient.on("error", (err) => {
    console.error("PostgreSQL listener error:", err);
    setTimeout(startPostgresListener, 5000); 
});

startPostgresListener();

// Graceful shutdown
process.on('SIGINT', async () => {
    await pgClient.end();
    process.exit(0);
});