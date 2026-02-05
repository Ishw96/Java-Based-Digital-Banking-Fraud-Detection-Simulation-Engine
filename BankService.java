package com.bank.service;

import com.bank.fraud.FraudDetector;
import com.bank.model.Account;
import com.bank.model.Transaction;

public class BankService {

    private FraudDetector detector;

    public BankService(FraudDetector detector) {
        this.detector = detector;
    }

    public void processTransaction(Account account, Transaction tx) {

        System.out.println("\nProcessing Transaction...");

        if (detector.isTransactionFraud(tx)) {
            System.out.println("Transaction Blocked: Fraud Detected!");
            return;
        }

        account.debit(tx.getAmount());
        System.out.println("Transaction Successful");
        System.out.println("Remaining Balance: " + account.getBalance());
    }
}
