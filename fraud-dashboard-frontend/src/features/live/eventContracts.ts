import type { Alert } from "../../types/Alert";

export type WebSocketEventEnvelope<T> = {
  version?: string;
  eventType?: string;
  channel?: string;
  source?: string;
  emittedAt?: string;
  data?: T;
};

export function unwrapAlertEvent(payload: unknown): Alert {
  if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
    return ((payload as WebSocketEventEnvelope<Alert>).data || {}) as Alert;
  }
  return (payload || {}) as Alert;
}
