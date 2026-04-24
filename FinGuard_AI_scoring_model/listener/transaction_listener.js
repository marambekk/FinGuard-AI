// File Name: transaction_listener.js
import { spawn } from 'child_process'; // For running the Python scoring script
import pkg from 'pg'; // PostgreSQL client for Node.js
const { Client } = pkg; // For database interactions
import { fileURLToPath } from 'url'; // To get __dirname in ES modules
import { dirname, join, resolve } from 'path'; // For file path manipulations
import fs from 'fs';
import dotenv from 'dotenv'; 

// --- FILE SYSTEM NAVIGATION ---
const __filename = fileURLToPath(import.meta.url); // Get the current file's path
const __dirname = dirname(__filename); // Get the directory of the current file

// 1. UNIFIED CONNECTION: Point to the central .env file
// Now we are loading the .env file from the database_connection directory, which is the single source of truth for all database credentials
const envPath = resolve(__dirname, '../../database_connection/.env');
dotenv.config({ path: envPath });

// --- LOGGING SETUP ---
const LOG_DIR = resolve(__dirname, '../../logs'); // Logs will be stored in the logs directory at the project root
const LOG_FILE = join(LOG_DIR, 'transactions.log'); // The log file where we will append transaction processing logs

// This function is responsible for appending log messages to the transactions.log file. It ensures that the log directory exists and writes messages with a timestamp. If any error occurs during this process, it catches the exception and logs an error message to the console without crashing the main process.
function appendLog(msg) {
    try {
        // Ensure the log directory exists before trying to write to the log file. If it doesn't exist, we create it using fs.mkdirSync with the recursive option to create any necessary parent directories.
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
        const line = `${new Date().toISOString()} ${msg}\n`;
        fs.appendFileSync(LOG_FILE, line, { encoding: 'utf8' }); // Append the log message to the log file with UTF-8 encoding. This ensures that we can write new log entries without overwriting existing ones. If any error occurs during this process (e.g., file permission issues, disk errors, etc.), it will be caught by the catch block below.
    } catch (err) {
        console.error('Log write error:', err);
    }
}

const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

await client.connect();
console.log("✅ Connected to PostgreSQL, listening for new transactions...");

// --- The Database Updater ---
// This function updates the transaction_state table based on the scoring results from the Python script. 
// Async is used to ensure that we wait for the database operation to complete before moving on, which is crucial for maintaining data integrity and ensuring that the transaction state is accurately reflected in the database.
async function updateTransactionState(txnId, riskLevel, ioc_prob, ml_prob, final_score) {
    let action = 'APPROVED';
    if (riskLevel === 'HIGH') action = 'REJECTED';
    else if (riskLevel === 'MEDIUM') action = 'QUARANTINED';

    //query to insert or update the transaction state in the database. The ON CONFLICT clause ensures that if a record with the same transaction_id already exists, it will be updated instead of inserting a new one. This is important for maintaining an accurate and up-to-date state for each transaction.
    const query = `
        INSERT INTO transaction_state 
            (transaction_id, risk_level, system_action, ioc_prob, ml_prob, final_score, last_updated)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (transaction_id) 
        DO UPDATE SET 
            risk_level = EXCLUDED.risk_level,
            system_action = EXCLUDED.system_action,
            ioc_prob = EXCLUDED.ioc_prob,
            ml_prob = EXCLUDED.ml_prob,
            final_score = EXCLUDED.final_score,
            last_updated = CURRENT_TIMESTAMP;
    `;

    try {
        // Execute the query with the provided parameters. This will either insert a new record or update an existing one based on the transaction_id. The use of parameterized queries (using $1, $2, etc.) helps prevent SQL injection attacks and ensures that the data is properly escaped.
        await client.query(query, [txnId, riskLevel, action, ioc_prob, ml_prob, final_score]);
        console.log(`DB Updated: ${txnId} marked as ${riskLevel} -> ${action}`);
        appendLog(`DB_UPDATED txn=${txnId} risk_level=${riskLevel} action=${action} final_score=${final_score}`);
    } catch (err) {
        console.error('Error updating database state:', err);
    }
}

// 2. The Python Runner
// This function is responsible for running the Python scoring script and handling its output. It uses the child_process module to spawn a new process that runs the Python script with the transaction ID as an argument. The output from the Python script is collected and parsed as JSON, which is then used to update the transaction state in the database.
async function runScoringScript(txnId) {
    const projectRoot = resolve(__dirname, '../../'); 
    const moduleName = 'final_risk_scoring.scoring_script';
    const moduleSourceDir = resolve(__dirname, '../'); 

    // Spawn a new Python process to run the scoring script. The PYTHONPATH environment variable is set to include both the module source directory and the project root, ensuring that the Python script can correctly import any necessary modules from the project.
    const py = spawn('python', ['-m', moduleName, '--txn', txnId], {
        cwd: moduleSourceDir,
        env: { 
            ...process.env, 
            // Setting the PYTHONPATH environment variable to include both the module source directory and the project root
            PYTHONPATH: `${moduleSourceDir};${projectRoot}` 
        }
    });

    let output = '';
    
    // Collect the output from the Python script. The 'data' event is emitted whenever the Python process writes to stdout, and we append this data to the output variable. This allows us to capture the entire output from the Python script, which we will later parse as JSON.
    py.stdout.on('data', (data) => {
        output += data.toString();
    });

    // Handle any errors that occur in the Python process. The 'data' event on stderr is emitted whenever the Python process writes to stderr, which typically indicates an error. We log this error to the console for debugging purposes.
    py.stderr.on('data', (data) => {
        console.error(`Python error: ${data}`);
    });

    //
    py.on('close', async (code) => {
        if (code === 0) {
            try {
                const result = JSON.parse(output);
                console.log('Scoring result:', result);
                appendLog(`ANALYZED txn=${txnId} risk_level=${result.risk_level} final_score=${result.final_score} ml_prob=${result.ml_prob} ioc_prob=${result.ioc_prob}`);
                
                // Extracting keys from Python result and passing them to the updater
                await updateTransactionState(
                    txnId, 
                    result.risk_level, 
                    result.ioc_prob,   
                    result.ml_prob,    
                    result.final_score 
                );
            } catch (err) {
                console.error('🐍 Failed to parse scoring result. Output was:', output);
            }
        } else {
            console.error('🐍 Scoring process exited with code', code);
        }
    });
}

// 3. The Listener Logic
client.query('LISTEN new_transaction');

// This event listener waits for notifications on the 'new_transaction' channel. When a new transaction is inserted into the transactions_raw table, the trigger function in the database sends a notification with the transaction ID. The listener then captures this notification, extracts the transaction ID, and calls the runScoringScript function to process the transaction through the Python scoring script.
client.on('notification', async (msg) => {
    const txnId = msg.payload; 
    console.log("🔔 New transaction received:", txnId);
    appendLog(`RECEIVED txn=${txnId}`);
    await runScoringScript(txnId);
});

client.on('error', (err) => {
    console.error('❌ PostgreSQL listener error:', err);
    appendLog(`ERROR listener_error=${err.message}`);
});

process.on('SIGINT', async () => {
    console.log('\n✋ Shutting down gracefully...');
    await client.end();
    process.exit(0);
});