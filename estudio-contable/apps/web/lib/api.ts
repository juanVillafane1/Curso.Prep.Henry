import type { ResumenCompromisos } from "@estudio/shared";

// En el servidor (páginas SSR) se llama directo a la API; en el navegador, vía el proxy de Next.
const BASE = typeof window === "undefined" ? process.env.API_URL ?? "http://localhost:4000/api/v1" : "/api/v1";

export class ApiError extends Error {
  constructor(public status: number, public codigo: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; mensaje?: string };
    throw new ApiError(res.status, body.error ?? "ERROR", body.mensaje ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface DashboardResponse extends ResumenCompromisos {
  vista: "diaria" | "semanal";
  alertas: { vencimientosVencidos: number; cuotasCaidas: number; chequesRechazados: number; pagosAtrasadosSinComprobante: number };
}

export const pesos = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export const fechaCorta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
