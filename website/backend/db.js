const { Pool } = require("pg");
const path = require("path");

// 1. Only look for the .env file if we aren't on Vercel (production)
if (process.env.NODE_ENV !== 'production') {
    require("dotenv").config({ 
        path: path.resolve(__dirname, "../../database_connection/.env") 
    });
}

// 2. Configure the connection
const pool = new Pool({
  // This will use the .env locally, or the Vercel Dashboard value in production
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = pool;