import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

// Fix Leaflet's default icon URLs (they break under bundlers).
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

export const PRIMARY_HUB_CENTER: [number, number] = [16.309485, 80.425991]; // Guntur/AP Hub
export const INDIA_CENTER: [number, number] = [20.5937, 78.9629];
export const DEFAULT_CENTER: [number, number] = PRIMARY_HUB_CENTER;
export const NCR_CENTER: [number, number] = PRIMARY_HUB_CENTER; // Backwards-compatible alias

// Distinct colors so each route polyline is visually separable.
export const ROUTE_COLORS = [
  "#2f66f6", "#e0561a", "#16a34a", "#9333ea", "#0891b2",
  "#ca8a04", "#db2777", "#4f46e5", "#65a30d", "#dc2626",
];

export function coloredDot(color: string, size = 14): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.25)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function vehicleIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:24px;height:24px;background:${color};border:2px solid white;border-radius:6px;box-shadow:0 2px 5px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold">▲</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export const depotIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;background:#0f172a;border:3px solid #facc15;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#facc15;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.35)">◆</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/**
 * Component to place inside <MapContainer> that automatically fits map bounds
 * around given coordinates.
 */
export function MapAutoBounds({
  points,
  padding = [40, 40],
  maxZoom = 15,
  initialOnly = false,
}: {
  points: [number, number][];
  padding?: [number, number];
  maxZoom?: number;
  initialOnly?: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;

    // Filter out invalid/null coordinates
    const validPoints = points.filter(
      (p) =>
        p &&
        typeof p[0] === "number" &&
        typeof p[1] === "number" &&
        !isNaN(p[0]) &&
        !isNaN(p[1])
    );
    if (validPoints.length === 0) return;

    if (validPoints.length === 1) {
      map.setView(validPoints[0], Math.min(map.getZoom() || 13, 14), { animate: true });
    } else {
      const bounds = L.latLngBounds(validPoints.map((p) => [p[0], p[1]]));
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding, maxZoom, animate: true });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, initialOnly ? [map] : [map, points.length, padding, maxZoom]);

  return null;
}
