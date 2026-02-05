package com.bank.main;

import com.bank.fraud.FraudDetector;
import com.bank.model.Account;
import com.bank.model.Transaction;
import com.bank.model.User;
import com.bank.service.BankService;
import com.bank.service.LoginService;
import com.bank.simulation.TransactionSimulator;

public class Main {
 
	public static void main(String[] args) {
		FraudDetector detector = new FraudDetector();
		
		User user = new User(101,"Ishwar");
		Account account = new Account(12345,500000);
		
	    LoginService loginService = new LoginService(detector);  
	    BankService service = new BankService(detector);
	    
	    
	  
//	    loginService.login(user.getUserId(), false);
//	    loginService.login(user.getUserId(), false);
//	    loginService.login(user.getUserId(), false);
//	    loginService.login(user.getUserId(), true);
	    
	    Transaction transaction = TransactionSimulator.generateTransaction();
	    service.processTransaction(account, transaction);
	    
	}
}