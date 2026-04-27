
export interface Alert {
  id?: number;
  transactionId?: string | number;
  ruleTriggered?: string;
  riskScore?: number;
  priority?: string | null;
  riskLevel?: string;
  evaluatedAt?: string;
  amount?: number;
  transactionType?: string;
  merchant?: string;
  location?: string;
  userId?: string;
  status?: string;
  type?: string;
  senderAccountNumber?: string;
  receiverAccountNumber?: string;
  fraudDetected?: boolean;
}
