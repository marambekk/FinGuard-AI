# File Name: FinGuardML.py
import pandas as pd
import joblib
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
import os

# --- PATH LOGIC ---
# Ensure we find the .pkl files in THIS folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "fraud_model.pkl")
SCALER_PATH = os.path.join(BASE_DIR, "finguard_scaler.pkl")

def get_ml_score_from_features(feature_dict: dict) -> float:
    """Calculates the probability of fraud based on trained AI model."""
    try:
        if not os.path.exists(MODEL_PATH) or not os.path.exists(SCALER_PATH):
            print(f"[!] Missing Model Files at {BASE_DIR}")
            return 0.0

        # Load the brain and the normalization tool
        model = joblib.load(MODEL_PATH)
        scaler = joblib.load(SCALER_PATH)

        # Convert dictionary to DataFrame for the model
        df = pd.DataFrame([feature_dict])

        # Normalize the numeric columns using the saved scaler
        num_cols = ["amount", "hour_of_day", "avg_daily_txn_amount", 
                    "amount_ratio", "txn_frequency_last_24h", "email_domain_age_days"]
        df[num_cols] = scaler.transform(df[num_cols])

        # Ensure column order matches training
        feature_order = model.feature_names_in_
        df = df[feature_order]

        # Predict probability (returns [safe_prob, fraud_prob])
        probability = model.predict_proba(df)[0][1]
        return float(probability)

    except Exception as e:
        print(f"[!] ML Engine Error: {e}")
        return 0.0

# Note: The 'train_and_save_model' function remains the same as your original 
# but should use the same CSV_PATH = os.path.join(BASE_DIR, "synthetic_fraud_dataset_extended.csv")
# =======================
# 2️⃣ Training logic (Runs only when you run this file directly)
# =======================
if __name__ == "__main__":
    print("--- REFRESHING AI MODEL ---")
    # Path to the Excel-like CSV file containing historical fraud data
    csv_path = os.path.join(BASE_DIR, "synthetic_fraud_dataset_extended.csv")
    data = pd.read_csv(csv_path) # Load the data into Python
    
    # Remove ID columns that the AI doesn't need for learning
    data = data.drop(columns=["transaction_id", "user_id"])
    
    # Convert text categories (like 'TRANSFER') into numbers (0 or 1) so math works
    data = pd.get_dummies(data, columns=["transaction_type"], drop_first=True)

    # X is the data we learn from; y is the "answer key" (is_fraud true/false)
    X = data.drop(columns=["is_fraud"])
    y = data["is_fraud"]

    # Split data: 80% for the AI to study, 20% to quiz the AI later
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Prepare the "scaler" to learn the average and range of the training numbers
    scaler = StandardScaler()
    num_cols = ["amount", "hour_of_day", "avg_daily_txn_amount", "amount_ratio", "txn_frequency_last_24h", "email_domain_age_days"]
    scaler.fit(X_train[num_cols]) # Learn the number ranges
    X_train[num_cols] = scaler.transform(X_train[num_cols]) # Apply the normalization

    # Create the AI model and "Train" it by finding patterns in X that lead to y
    model = LogisticRegression(max_iter=1000, class_weight='balanced')
    model.fit(X_train, y_train)

    # Save the trained brain and scaler to files so we can use them later without re-training
    joblib.dump(model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    print("✅ Model and Scaler Updated.")