import { BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts"
import { type Alert } from "../types/Alert"


interface Props {
  data: Alert[]
}

export default function FraudHeatmap({ data }: Props) {

  const chartData = [
    { name: "LOW", value: data.filter(a => a.priority === "LOW").length },
    { name: "MEDIUM", value: data.filter(a => a.priority === "MEDIUM").length },
    { name: "CRITICAL", value: data.filter(a => a.priority === "CRITICAL").length }
  ]

  return (
    <BarChart width={400} height={250} data={chartData}>
      <XAxis dataKey="name" />
      <YAxis />
      <Tooltip />
      <Bar dataKey="value" fill="#ff4d4f" />
    </BarChart>
  )
}