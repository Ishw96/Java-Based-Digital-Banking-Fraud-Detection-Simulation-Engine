import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";
import { type Alert } from "../types/Alert";
import { unwrapAlertEvent } from "../features/live/eventContracts";
import { SOCKJS_URL } from "../config/runtime";

export function connectAlerts(onMessage: (alert: Alert) => void): () => void {
  const client = new Client({
    webSocketFactory: () => new SockJS(SOCKJS_URL),
    reconnectDelay: 5000,
    debug: (str) => {
      console.log("STOMP:", str);
    }
  });

  client.onConnect = () => {
    console.log("WebSocket Connected");

    client.subscribe("/topic/alerts", (msg) => {
      const alert: Alert = unwrapAlertEvent(JSON.parse(msg.body));
      console.log("Alert received:", alert);
      onMessage(alert);
    });
  };

  client.onStompError = (frame) => {
    console.error("Broker error:", frame.headers["message"]);
  };

  client.onWebSocketError = (error) => {
    console.error("WebSocket error:", error);
  };

  client.activate();

  return () => {
    console.log("WebSocket disconnected");
    client.deactivate();
  };
}
