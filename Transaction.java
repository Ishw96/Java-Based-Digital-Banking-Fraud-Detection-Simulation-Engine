package com.bank.model;

import java.util.Date;

public class Transaction {

    private int transactionId;
    private double amount;
    private String location;
    private Date time;

    public Transaction(int transactionId, double amount, String location) {
        this.transactionId = transactionId;
        this.amount = amount;
        this.location = location;
        this.time = new Date();
    }

    public double getAmount() {
        return amount;
    }

    public String getLocation() {
        return location;
    }

    public Date getTime() {
        return time;
    }
}
