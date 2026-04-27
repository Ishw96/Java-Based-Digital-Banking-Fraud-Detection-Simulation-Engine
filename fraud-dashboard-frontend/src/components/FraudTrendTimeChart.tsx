import { LineChart, Line, XAxis, YAxis, Tooltip } from "recharts"
import { type Alert } from "../types/Alert"

interface Props{
  data: Alert[]
}

export default function FraudTrendTimeChart({data}:Props){

  const chartData = data.map(a=>({
    time:a.id,
    risk:a.riskScore
  }))

  return(

    <LineChart width={600} height={300} data={chartData}>

      <XAxis dataKey="time"/>

      <YAxis/>

      <Tooltip/>

      <Line type="monotone" dataKey="risk" stroke="#ff4d4f"/>

    </LineChart>

  )

}