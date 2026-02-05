package com.bank.model;

public class Account {

	private int accountNumber;
    private double balance;
	
	public Account(int accountNumber, double balance) {
		this.accountNumber = accountNumber;
		this.balance = balance;
	}
	
	public double getBalance() {
		return balance;
	}
	
	public void debit(double amount) {
		balance -= amount;
	}
}
