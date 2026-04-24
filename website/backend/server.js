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

// --- FRONTEND SERVING LOGIC (RAILWAY OPTIMIZED) ---
// On Railway, the root is /app. 
// If your Root Directory is website/backend, then:
// backend is at: /app
// frontend_auth is at: /app/../frontend_auth (which is /app/frontend_auth if seen from the website folder)

const FRONTEND_AUTH_PATH = path.resolve(__dirname, "../../frontend_auth");
const DASHBOARD_PATH = path.resolve(__dirname, "../../dashboard");

console.log("Checking path 1:", FRONTEND_AUTH_PATH);
console.log("Checking path 2:", DASHBOARD_PATH);

app.use("/frontend_auth", express.static(FRONTEND_AUTH_PATH));
app.use("/dashboard", express.static(DASHBOARD_PATH));

app.get("/", (req, res) => {
    res.sendFile(path.join(FRONTEND_AUTH_PATH, "SignInPage.html"), (err) => {
        if (err) {
            // This will tell us EXACTLY where it looked and failed
            console.error("FAILED TO FIND FILE AT:", path.join(FRONTEND_AUTH_PATH, "SignInPage.html"));
            res.status(404).send(`Server is live, but cannot find the HTML file. Looked in: ${FRONTEND_AUTH_PATH}`);
        }
    });
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

// 7. PostgreSQL Real-time Listener (Resilient Version)
async function startPostgresListener() {
    // Create a NEW client instance inside the function to avoid "reuse" errors
    const pgClient = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false // Required for Neon cloud connections
        }
    });

    try {
        await pgClient.connect();
        await pgClient.query("LISTEN new_transaction");
        console.log("📡 Listening for PostgreSQL notifications on channel: new_transaction");

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

        // If the client errors out, close it and retry with a new client
        pgClient.on("error", (err) => {
            console.error("PostgreSQL listener connection error:", err.message);
            pgClient.end().catch(() => {}); // Cleanly close the failed client
            setTimeout(startPostgresListener, 5000); 
        });

    } catch (err) {
        console.error("❌ Failed to start PostgreSQL listener, retrying in 5s:", err.message);
        setTimeout(startPostgresListener, 5000); 
    }
}

// Start the listener
startPostgresListener();

// Graceful shutdown
process.on('SIGINT', async () => {
    process.exit(0);
});