import axios from "axios";
import { clearSession, getSession, isSessionExpired, touchSession } from "./auth";
import { API_BASE_URL } from "../config/runtime";

export const apiClient = axios.create({
  baseURL: API_BASE_URL
});

let interceptorsInstalled = false;

if (!interceptorsInstalled) {
  apiClient.interceptors.request.use((config) => {
    const session = getSession();
    if (session) {
      if (isSessionExpired(session)) {
        clearSession();
        return Promise.reject(new axios.AxiosError("Session expired", "ERR_SESSION_EXPIRED", config));
      }

      const touched = touchSession() || session;
      config.headers = {
        ...(config.headers || {}),
        "X-Actor-Email": touched.email,
        "X-Actor-Name": touched.userName || touched.email,
        "X-Actor-Role": touched.role,
        "X-Session-Started": String(touched.issuedAt || Date.now()),
        "X-Session-Last-Activity": String(touched.lastActivityAt || Date.now()),
        "X-Session-Timeout-Minutes": String(touched.sessionTimeoutMinutes || 30),
        "X-Auth-Token": touched.token
      } as any;
    }
    return config;
  });

  apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error?.response?.status === 401 && getSession()) {
        clearSession();
      }
      return Promise.reject(error);
    }
  );

  interceptorsInstalled = true;
}
