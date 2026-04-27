interface Props{
  critical:number
  medium:number
  low:number
}

export default function SummaryCards({critical,medium,low}:Props){

  return(

    <div className="dashboard-grid">

      <div className="card card-critical">
        Critical
        <h1>{critical}</h1>
      </div>

      <div className="card card-medium">
        Medium
        <h1>{medium}</h1>
      </div>

      <div className="card card-low">
        Low
        <h1>{low}</h1>
      </div>

    </div>

  )

}