import { useEffect } from "react"

interface Notification {
  id: number
  message: string
}

interface Props {
  notifications: Notification[]
  remove: (id: number) => void
}

export default function FraudNotifications({ notifications, remove }: Props) {

  useEffect(() => {

    if (notifications.length > 0) {
      const audio = new Audio("/alarm.mp3")
      audio.play().catch(() => {})
    }

  }, [notifications])

  return (

    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        width: 320,
        zIndex: 9999
      }}
    >

      {notifications.map((n) => (

        <div
          key={n.id}
          style={{
            background: "#7f1d1d",
            color: "white",
            padding: 15,
            marginBottom: 10,
            borderRadius: 8,
            boxShadow: "0 0 10px rgba(0,0,0,0.6)",
            animation: "slideIn 0.3s ease"
          }}
        >

          <div style={{ display: "flex", justifyContent: "space-between" }}>

            <strong>🚨 FRAUD ALERT</strong>

            <button
              onClick={() => remove(n.id)}
              style={{
                background: "transparent",
                border: "none",
                color: "white",
                cursor: "pointer",
                fontSize: 16
              }}
            >
              ✖
            </button>

          </div>

          <div style={{ marginTop: 8 }}>
            {n.message}
          </div>

        </div>

      ))}

    </div>

  )
}