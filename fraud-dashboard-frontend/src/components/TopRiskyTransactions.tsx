import { type Alert } from "../types/Alert"

interface Props{
  alerts:Alert[]
}

export default function TopRiskyTransactions({alerts}:Props){

  const risky = [...alerts]
    .sort((a,b)=>(b.riskScore ?? 0)-(a.riskScore ?? 0))
    .slice(0,10)

  return(

    <div>

      <h2>Top Risky Transactions</h2>

      <table border={1} cellPadding={10} style={{width:"100%"}}>

        <thead>

          <tr>
            <th>ID</th>
            <th>Transaction</th>
            <th>Rule</th>
            <th>Risk Score</th>
            <th>Priority</th>
          </tr>

        </thead>

        <tbody>

          {risky.map(a=>(

            <tr key={a.id}>

              <td>{a.id}</td>
              <td>{a.transactionId}</td>
              <td>{a.ruleTriggered}</td>
              <td>{a.riskScore}</td>
              <td>{a.priority}</td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  )

}
