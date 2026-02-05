package com.bank.simulation;

import java.util.Random;
import com.bank.model.Transaction;

public class TransactionSimulator {

    public static Transaction generateTransaction() {

        Random r = new Random();
        int id = r.nextInt(1000);
        double amount = r.nextInt(200000);
        String location = r.nextBoolean() ? "India" : "Unknown";

        return new Transaction(id, amount, location);
    }
}
