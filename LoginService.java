package com.bank.service;

import com.bank.fraud.FraudDetector;

public class LoginService {

    private FraudDetector detector;

    public LoginService(FraudDetector detector) {
        this.detector = detector;
    }

    public void login(int userId, boolean success) {

        if (detector.isLoginFraud(userId, success)) {
            System.out.println("Account Locked: Multiple Failed Login Attempts!");
        } else if (!success) {
            System.out.println("Login Failed");
        } else {
            System.out.println("Login Successful");
        }
    }
//    
//    @Post
//    String reponse(int id , boolean success)
//    
//    
}
