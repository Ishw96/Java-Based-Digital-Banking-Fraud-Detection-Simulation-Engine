import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";
import { type Alert } from "../types/Alert";

type MapAlert = Alert & {
  coordinates: [number, number];
  regionLabel: string;
};

const coordinateFallbacks: Array<{ match: RegExp; coordinates: [number, number]; label: string }> = [
  { match: /(delhi|india)/i, coordinates: [28.6139, 77.2090], label: "Delhi, India" },
  { match: /(mumbai)/i, coordinates: [19.076, 72.8777], label: "Mumbai, India" },
  { match: /(kolkata)/i, coordinates: [22.5726, 88.3639], label: "Kolkata, India" },
  { match: /(chennai)/i, coordinates: [13.0827, 80.2707], label: "Chennai, India" },
  { match: /(bangalore|bengaluru)/i, coordinates: [12.9716, 77.5946], label: "Bengaluru, India" },
  { match: /(hyderabad)/i, coordinates: [17.385, 78.4867], label: "Hyderabad, India" },
  { match: /(patna)/i, coordinates: [25.5941, 85.1376], label: "Patna, India" },
  { match: /(usa|new york|california|texas|america)/i, coordinates: [40.7128, -74.006], label: "New York, USA" },
  { match: /(uk|london)/i, coordinates: [51.5072, -0.1276], label: "London, UK" },
  { match: /(germany|berlin)/i, coordinates: [52.52, 13.405], label: "Berlin, Germany" },
  { match: /(france|paris)/i, coordinates: [48.8566, 2.3522], label: "Paris, France" },
  { match: /(japan|tokyo)/i, coordinates: [35.6762, 139.6503], label: "Tokyo, Japan" },
  { match: /(singapore)/i, coordinates: [1.3521, 103.8198], label: "Singapore" },
  { match: /(australia|sydney)/i, coordinates: [-33.8688, 151.2093], label: "Sydney, Australia" }
];

export default function GeoHeatmap({ alerts }: { alerts: Alert[] }) {
  const highRiskAlerts = useMemo<MapAlert[]>(() => {
    return alerts
      .filter((alert) => {
        const level = (alert.priority || alert.riskLevel || "").toUpperCase();
        return level.includes("HIGH") || level.includes("CRITICAL");
      })
      .slice(0, 20)
      .map((alert) => {
        const matched = coordinateFallbacks.find((entry) => entry.match.test(alert.location || ""));
        return {
          ...alert,
          coordinates: matched?.coordinates || [20.5937, 78.9629],
          regionLabel: matched?.label || alert.location || "Unknown location"
        };
      });
  }, [alerts]);

  return (
    <div className="real-map-shell">
      <MapContainer center={[20.5937, 78.9629]} zoom={2} minZoom={2} scrollWheelZoom className="real-map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {highRiskAlerts.map((alert, index) => {
          const level = (alert.priority || alert.riskLevel || "").toUpperCase();
          const icon = L.divIcon({
            className: "",
            html: `<div class="risk-marker ${level.includes("CRITICAL") ? "critical" : "high"}"><span class="risk-marker-core"></span></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });

          return (
            <Marker key={`${alert.transactionId}-${index}`} position={alert.coordinates} icon={icon}>
              <Tooltip direction="top" offset={[0, -12]} opacity={1} className="map-hover-tooltip" permanent={false}>
                <div className="map-tooltip-card">
                  <div><strong>Location:</strong> {alert.location || alert.regionLabel}</div>
                  <div><strong>Risk Score:</strong> {Number(alert.riskScore || 0).toFixed(3)}</div>
                  <div><strong>Transaction ID:</strong> {alert.transactionId || "-"}</div>
                  <div><strong>Amount:</strong> {alert.amount != null ? `INR ${Number(alert.amount).toLocaleString()}` : "-"}</div>
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: "#9fb2d9", fontSize: 12, marginTop: 8 }}>
        <span>Real map view for HIGH_RISK and CRITICAL_RISK alerts</span>
        <span>-</span>
        <span>Hover blinking markers for location, score, transaction ID, and amount</span>
      </div>
    </div>
  );
}
