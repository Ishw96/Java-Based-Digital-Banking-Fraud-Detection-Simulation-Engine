package com.bank.fraud;

import java.util.HashMap;
import java.util.Map;
import com.bank.model.Transaction;

public class FraudDetector {

    private static final int MAX_FAILED_ATTEMPTS = 3;
    private static final double MAX_TRANSACTION_AMOUNT = 100000;

    // Store failed login attempts
    private Map<Integer, Integer> failedLoginMap = new HashMap<>();

    // Transaction fraud rules
    public boolean isTransactionFraud(Transaction tx) {

        if (tx.getAmount() > MAX_TRANSACTION_AMOUNT) {
            System.out.println("Reason: High Amount Transaction");
            return true;
        }

        if (tx.getLocation().equalsIgnoreCase("Unknown")) {
            System.out.println("Reason: Suspicious Location");
            return true;
        }

        return false;
    }

    // Login fraud rules
    public boolean isLoginFraud(int userId, boolean loginSuccess) {

        if (loginSuccess) {
            failedLoginMap.put(userId, 0);
            return false;
        }

        int attempts = failedLoginMap.getOrDefault(userId, 0) + 1;
        failedLoginMap.put(userId, attempts);

        if (attempts >= MAX_FAILED_ATTEMPTS) {
            return true;
        }

        return false;
    }
}
