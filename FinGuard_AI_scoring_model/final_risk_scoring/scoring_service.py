# File Name: scoring_script.py
import sys
import os
import json
import argparse
import psycopg2

# --- DYNAMIC PATH SETUP ---
# 1. Get the directory where THIS script lives (final_risk_scoring folder)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# 2. Add this folder to sys.path so it can find 'scoring_service.py'
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

# 3. Get the Project Root (C:.) to find 'database_connection'
PROJECT_ROOT = os.path.dirname(os.path.dirname(CURRENT_DIR))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

# --- NOW DO THE IMPORTS ---
from database_connection.db_config import DB_PARAMS

from FinGuard_AI_scoring_model.ML_model.FinGuardML import get_ml_score_from_features
from FinGuard_AI_scoring_model.IOC_scoring.ioc_logic import get_ioc_score_from_flags

LOW_THRESHOLD = 0.38
MEDIUM_THRESHOLD = 0.75

def classify_risk(score: float) -> str:
    if score < LOW_THRESHOLD: return "LOW"
    elif score < MEDIUM_THRESHOLD: return "MEDIUM"
    else: return "HIGH"

def evaluate_transaction(feature_dict: dict, ioc_flags: dict) -> dict:
    ml_prob = get_ml_score_from_features(feature_dict)
    ioc_prob = get_ioc_score_from_flags(ioc_flags)
    
    # Take the highest risk detected by either engine
    final_score = max(ml_prob, ioc_prob)
    risk_level = classify_risk(final_score)

    triggered_flags = [key for key, value in ioc_flags.items() if value]

    return {
        "ml_prob": round(ml_prob, 4),
        "ioc_prob": round(ioc_prob, 4),
        "final_score": round(final_score, 4),
        "risk_level": risk_level,
        "triggered_flags": triggered_flags
    }