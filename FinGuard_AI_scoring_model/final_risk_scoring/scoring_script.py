# File Name: scoring_script.py
import sys
import os
import json
import argparse
import psycopg2
# File Name: scoring_script.py
import sys
import os
import json
import argparse
import psycopg2
import datetime
from datetime import UTC

# --- DYNAMIC PATH SETUP ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(CURRENT_DIR))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from database_connection.db_config import DB_PARAMS
from final_risk_scoring.scoring_service import evaluate_transaction

# --- LOGGING SETUP ---
LOG_DIR = os.path.join(PROJECT_ROOT, 'logs')
LOG_FILE = os.path.join(LOG_DIR, 'transactions.log')

def append_log(message: str) -> None:
    try:
        if not os.path.exists(LOG_DIR):
            os.makedirs(LOG_DIR, exist_ok=True)
        ts = datetime.datetime.now(UTC).isoformat().replace('+00:00', 'Z')
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(f"{ts} {message}\n")
    except Exception as e:
        print(f"[!] Log write error: {e}", file=sys.stderr)

# --- NEW: DATABASE UPDATE FUNCTION ---
def update_transaction_state(txn_id, result):
    """Writes the final risk assessment back to the database to trigger the hold logic."""
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        
        # Map risk level to initial system action for the gatekeeper
        system_action = "QUARANTINED"
        if result['risk_level'] == "LOW":
            system_action = "APPROVED"
        elif result['risk_level'] == "HIGH":
            system_action = "REJECTED"

        query = """
            INSERT INTO transaction_state (
                transaction_id, risk_level, system_action, 
                ml_prob, ioc_prob, final_score, last_updated
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (transaction_id) DO UPDATE SET
                risk_level = EXCLUDED.risk_level,
                system_action = EXCLUDED.system_action,
                ml_prob = EXCLUDED.ml_prob,
                ioc_prob = EXCLUDED.ioc_prob,
                final_score = EXCLUDED.final_score,
                last_updated = EXCLUDED.last_updated;
        """
        cur.execute(query, (
            txn_id, 
            result['risk_level'], 
            system_action,
            result['ml_prob'],
            result['ioc_prob'],
            result['final_score'],
            datetime.datetime.now(UTC)
        ))
        conn.commit()
    except Exception as e:
        print(f"[!] Database update error: {e}", file=sys.stderr)
    finally:
        if 'conn' in locals(): conn.close()

def get_txn_from_db(txn_id):
    try:
        conn = psycopg2.connect(**DB_PARAMS) 
        cur = conn.cursor()
        query = """
            SELECT f.*, i.high_risk_network_origin, i.disposable_identity, 
                   i.device_velocity, i.pii_change_velocity, i.impossible_travel
            FROM transaction_features f
            JOIN transaction_ioc i ON f.transaction_id = i.transaction_id
            WHERE f.transaction_id = %s
        """
        cur.execute(query, (txn_id,))
        row = cur.fetchone()
        if row:
            colnames = [desc[0] for desc in cur.description]
            return dict(zip(colnames, row))
        return None
    except Exception as e:
        print(f"Database error during JOIN: {e}", file=sys.stderr)
        return None
    finally:
        if 'conn' in locals(): conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--txn', type=str, help='Transaction ID to score')
    args = parser.parse_args()

    if args.txn:
        txn_data = get_txn_from_db(args.txn)
        if not txn_data:
            print(json.dumps({"error": f"Transaction {args.txn} not found"}))
            sys.exit(1)

        feature_dict = {
            "amount": float(txn_data.get('amount', 0)),
            "hour_of_day": int(txn_data.get('hour_of_day', 0)),
            "avg_daily_txn_amount": float(txn_data.get('avg_daily_txn_amount', 0)),
            "amount_ratio": float(txn_data.get('amount_ratio', 0)),
            "txn_frequency_last_24h": int(txn_data.get('txn_frequency_last_24h', 0)),
            "email_domain_age_days": int(txn_data.get('email_domain_age_days', 0)),
            "is_new_beneficiary": int(txn_data.get('is_new_beneficiary', 0)),
            "new_ip_device_combo": int(txn_data.get('new_ip_device_combo', 0)),
            "otp_burst_flag": int(txn_data.get('otp_burst_flag', 0)),
            "phishing_referrer_flag": int(txn_data.get('phishing_referrer_flag', 0)),
            "is_odd_hour": int(txn_data.get('is_odd_hour', 0)),
            "previous_fraud_flag": int(txn_data.get('previous_fraud_flag', 0)),
            "email_domain_verified": int(txn_data.get('email_domain_verified', 0)),
            "transaction_type_CASH_OUT": 1 if txn_data.get('transaction_type') == "CASH_OUT" else 0,
            "transaction_type_PAYMENT": 1 if txn_data.get('transaction_type') == "PAYMENT" else 0,
            "transaction_type_TRANSFER": 1 if txn_data.get('transaction_type') == "TRANSFER" else 0
        }

        ioc_flags = {
            "high_risk_network_origin": bool(txn_data.get('high_risk_network_origin', False)),
            "disposable_identity": bool(txn_data.get('disposable_identity', False)),
            "device_velocity": bool(txn_data.get('device_velocity', False)),
            "pii_change_velocity": bool(txn_data.get('pii_change_velocity', False)),
            "impossible_travel": bool(txn_data.get('impossible_travel', False))
        }

        # Core evaluation logic
        result = evaluate_transaction(feature_dict, ioc_flags)
        result['transaction_id'] = args.txn

        # UPDATED: Write findings back to DB to ensure the "Hold" logic is applied
        update_transaction_state(args.txn, result)

        try:
            append_log(f"ANALYZED txn={args.txn} risk_level={result['risk_level']} final_score={result['final_score']} ml_prob={result['ml_prob']} ioc_prob={result['ioc_prob']}")
        except Exception:
            pass
        print(json.dumps(result))
    else:
        sys.exit(1)
# --- DYNAMIC PATH SETUP ---
# Get the absolute path of this file's folder
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
# Move up two levels to reach the root (C:.)
PROJECT_ROOT = os.path.dirname(os.path.dirname(CURRENT_DIR))

# Add root to sys.path so we can find 'database_connection' and other modules
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import our database keys from the central config
from database_connection.db_config import DB_PARAMS
# Import our master scoring function from the same folder
from final_risk_scoring.scoring_service import evaluate_transaction

def get_txn_from_db(txn_id):
    """Goes into the database and pulls data from two tables (Features and IOC)."""
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        
        query = """
            SELECT f.*, i.high_risk_network_origin, i.disposable_identity, 
                   i.device_velocity, i.pii_change_velocity, i.impossible_travel
            FROM transaction_features f
            JOIN transaction_ioc i ON f.transaction_id = i.transaction_id
            WHERE f.transaction_id = %s
        """
        
        cur.execute(query, (txn_id,))
        row = cur.fetchone()
        
        if row:
            colnames = [desc[0] for desc in cur.description]
            return dict(zip(colnames, row))
        return None
    except Exception as e:
        print(f"Database error during JOIN: {e}", file=sys.stderr)
        return None
    finally:
        if 'conn' in locals(): conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--txn', type=str, help='Transaction ID to score')
    args = parser.parse_args()

    if args.txn:
        txn_data = get_txn_from_db(args.txn)
        if not txn_data:
            print(json.dumps({"error": f"Transaction {args.txn} not found"}))
            sys.exit(1)

        # Organize ML features
        feature_dict = {
            "amount": float(txn_data.get('amount', 0)),
            "hour_of_day": int(txn_data.get('hour_of_day', 0)),
            "avg_daily_txn_amount": float(txn_data.get('avg_daily_txn_amount', 0)),
            "amount_ratio": float(txn_data.get('amount_ratio', 0)),
            "txn_frequency_last_24h": int(txn_data.get('txn_frequency_last_24h', 0)),
            "email_domain_age_days": int(txn_data.get('email_domain_age_days', 0)),
            "is_new_beneficiary": int(txn_data.get('is_new_beneficiary', 0)),
            "new_ip_device_combo": int(txn_data.get('new_ip_device_combo', 0)),
            "otp_burst_flag": int(txn_data.get('otp_burst_flag', 0)),
            "phishing_referrer_flag": int(txn_data.get('phishing_referrer_flag', 0)),
            "is_odd_hour": int(txn_data.get('is_odd_hour', 0)),
            "previous_fraud_flag": int(txn_data.get('previous_fraud_flag', 0)),
            "email_domain_verified": int(txn_data.get('email_domain_verified', 0)),
            "transaction_type_CASH_OUT": 1 if txn_data.get('transaction_type') == "CASH_OUT" else 0,
            "transaction_type_PAYMENT": 1 if txn_data.get('transaction_type') == "PAYMENT" else 0,
            "transaction_type_TRANSFER": 1 if txn_data.get('transaction_type') == "TRANSFER" else 0
        }

        # Organize Security Rules
        ioc_flags = {
            "high_risk_network_origin": bool(txn_data.get('high_risk_network_origin', False)),
            "disposable_identity": bool(txn_data.get('disposable_identity', False)),
            "device_velocity": bool(txn_data.get('device_velocity', False)),
            "pii_change_velocity": bool(txn_data.get('pii_change_velocity', False)),
            "impossible_travel": bool(txn_data.get('impossible_travel', False))
        }

        result = evaluate_transaction(feature_dict, ioc_flags)
        result['transaction_id'] = args.txn
        print(json.dumps(result))
    else:
        sys.exit(1)