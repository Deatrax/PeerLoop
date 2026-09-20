import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { BaseRepository, DomainError, responseSchema } from "@peerloop/core";
export const apiUrl = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
export async function readToken() {
  if (Platform.OS === "web") return typeof sessionStorage==='undefined' ? null : sessionStorage.getItem("peerloop-token");
  return SecureStore.getItemAsync("peerloop-token");
}
export async function saveToken(token: string | null) {
  if (Platform.OS === "web") {
    if (token) sessionStorage.setItem("peerloop-token", token);
    else sessionStorage.removeItem("peerloop-token");
    return;
  }
  if (token) await SecureStore.setItemAsync("peerloop-token", token);
  else await SecureStore.deleteItemAsync("peerloop-token");
}
export class HttpRepository extends BaseRepository {
  constructor(
    private uid: () => string,
    private scale: () => number,
  ) {
    super();
  }
  async cached<T>(path: string, uid=this.uid()): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(`cache:${uid}:${path}`);
      return value ? responseSchema('GET',path).parse(JSON.parse(value)) as T : null;
    } catch {return null;}
  }
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const uid=this.uid();
    const token = await readToken();
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch(`${apiUrl}/api/v1${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "X-Peerloop-Time-Scale": String(this.scale()),
          },
          body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
          signal: AbortSignal.timeout(10000),
        });
        break;
      } catch {
        if (attempt === 1) {
          if (method === "GET") {
            const cached = await this.cached<T>(path,uid);
            if (cached) return cached;
          }
          throw new DomainError(
            "NETWORK",
            "Could not reach PeerLoop. Check your connection or open the offline demo.",
            0,
          );
        }
        if (method !== "GET")
          throw new DomainError(
            "NETWORK",
            "Connection lost. Refresh before retrying so this action is not duplicated.",
            0,
          );
      }
    }
    if (!response)
      throw new DomainError("NETWORK", "No response from the API.", 0);
    const raw: unknown = await response.json();
    if (!response.ok) {
      const error = raw as { error?: { code?: string; message?: string } };
      throw new DomainError(
        error.error?.code ?? "API",
        error.error?.message ?? `API returned ${response.status}`,
        response.status,
      );
    }
    const data = responseSchema(method, path).parse(raw) as T;
    if (method === "GET")
      await AsyncStorage.setItem(
        `cache:${uid}:${path}`,
        JSON.stringify(data),
      );
    return data;
  }
}
