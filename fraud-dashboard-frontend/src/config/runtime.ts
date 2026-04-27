function normalize(value: string | undefined, fallback: string) {
  const resolved = (value || fallback).trim();
  return resolved.endsWith("/") && resolved !== "/" ? resolved.slice(0, -1) : resolved;
}

function resolveBrowserUrl(value: string) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (typeof window === "undefined") {
    return value;
  }
  return new URL(value, window.location.origin).toString().replace(/\/$/, "");
}

export const API_BASE_URL = resolveBrowserUrl(normalize(import.meta.env.VITE_API_BASE_URL, "/api/v1"));
export const SOCKJS_URL = resolveBrowserUrl(normalize(import.meta.env.VITE_WS_BASE_URL, "/ws"));
export const ML_ENGINE_URL = resolveBrowserUrl(normalize(import.meta.env.VITE_ML_ENGINE_URL, "/ml/predict"));
