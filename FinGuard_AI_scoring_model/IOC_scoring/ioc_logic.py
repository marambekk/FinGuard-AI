# File Name: ioc_logic.py

# This module contains the logic for calculating the IOC-based risk score based on specific security "Red Flags". Each flag contributes a certain amount to the total risk score, which is then normalized to a value between 0.0 and 1.0.
def get_ioc_score_from_flags(flags: dict) -> float:
    """Calculates risk score based on specific security 'Red Flags' (IOCs)."""
    try:
        total_risk = 0.0 

        # We use .get(key, False) to prevent errors if a flag is missing from the DB
        if flags.get("high_risk_network_origin", False): total_risk += 0.80  # Triggered when a transaction originates from a known high-risk network, which is a strong indicator of potential fraud. 
        if flags.get("disposable_identity", False):      total_risk += 0.50  # Triggered when a transaction is associated with a disposable or temporary identity, which is commonly used in fraudulent activities to avoid detection.     
        if flags.get("device_velocity", False):          total_risk += 0.67  # Triggered when a single device is used for multiple transactions in a short period of time, which can indicate automated fraud or account takeover attempts.          
        if flags.get("pii_change_velocity", False):      total_risk += 0.30  # Triggered when there are rapid changes to personally identifiable information (PII) associated with an account, such as email or phone number changes, which can indicate account takeover or fraudulent activity.      
        if flags.get("impossible_travel", False):        total_risk += 0.45  # Triggered when a transaction occurs from two geographically distant locations within a short time frame, which is highly unlikely for a legitimate user and can indicate account compromise.  
        """
        Explaining the weight choice:
        1. "high_risk_network_origin" is weighted the highest (0.80) because transactions originating from known high-risk networks are a strong indicator of potential fraud.
        2. "device_velocity" is also weighted high (0.67) because multiple transactions from the same device in a short period can indicate automated fraud or account takeover attempts.
        3. "disposable_identity" is weighted at 0.50 because while it's a significant red flag, it may not always indicate fraud (e.g., some users might use disposable emails for privacy reasons).
        4. "impossible_travel" is weighted at 0.45 because it can be a strong indicator of account compromise, but there are some edge cases (e.g., users traveling frequently).
        5. "pii_change_velocity" is weighted the lowest (0.30) because while rapid changes to PII can indicate fraud, there are also legitimate reasons for such changes (e.g., users updating their contact information).
        The total risk score is the sum of these weighted flags, and we will later normalize it to ensure it falls between 0.0 and 1.0 for consistency with the ML-based score when we take the maximum of the two.
        """        

        # Return a float between 0.0 and 1.0
        return min(1.0, total_risk)
    
    # If any unexpected error occurs (e.g., wrong data types, missing keys, etc.), we catch the exception and print an error message. We return 0.0 in this case to indicate no risk detected, as we don't want the scoring process to fail entirely due to an issue in the IOC logic.
    except Exception as e:
        print(f"[!] IOC Engine Error: {e}")
        return 0.0
    
