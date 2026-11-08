import { inicioSemana, normalizar, sumarDias } from "./fechas.js";

export type Vista = "diaria" | "semanal";

export function rangoVista(vista: Vista, referencia: Date): { desde: Date; hasta: Date } {
  const ref = normalizar(referencia);
  if (vista === "diaria") return { desde: ref, hasta: ref };
  const lunes = inicioSemana(ref);
  return { desde: lunes, hasta: sumarDias(lunes, 6) };
}

/** Resumen del lunes: compromisos de los próximos 7 días (lunes a domingo). */
export function rangoResumenSemanal(hoy: Date): { desde: Date; hasta: Date } {
  const desde = normalizar(hoy);
  return { desde, hasta: sumarDias(desde, 6) };
}

export type OrigenCompromiso = "IMPUESTO" | "CUOTA" | "CHEQUE";

export interface Compromiso {
  origen: OrigenCompromiso;
  /** EGRESO = pago del cliente; INGRESO = cheque en cartera a depositar. */
  sentido: "EGRESO" | "INGRESO";
  id: string;
  clienteId: string;
  clienteNombre: string;
  descripcion: string;
  fecha: string; // ISO
  importe: number | null;
  estado: string;
}

export interface ResumenCompromisos {
  desde: string;
  hasta: string;
  /** Total de egresos (lo que el cliente debe pagar). */
  total: number;
  totalIngresos: number;
  porOrigen: Record<OrigenCompromiso, { cantidad: number; importe: number }>;
  porDia: Record<string, Compromiso[]>;
  items: Compromiso[];
}

export function consolidar(desde: Date, hasta: Date, items: Compromiso[]): ResumenCompromisos {
  const ordenados = [...items].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const porOrigen: ResumenCompromisos["porOrigen"] = {
    IMPUESTO: { cantidad: 0, importe: 0 },
    CUOTA: { cantidad: 0, importe: 0 },
    CHEQUE: { cantidad: 0, importe: 0 },
  };
  const porDia: Record<string, Compromiso[]> = {};
  let total = 0;
  let totalIngresos = 0;
  for (const it of ordenados) {
    porOrigen[it.origen].cantidad++;
    if (it.sentido === "INGRESO") {
      totalIngresos += it.importe ?? 0;
    } else {
      porOrigen[it.origen].importe += it.importe ?? 0;
      total += it.importe ?? 0;
    }
    (porDia[it.fecha] ??= []).push(it);
  }
  return {
    desde: desde.toISOString().slice(0, 10),
    hasta: hasta.toISOString().slice(0, 10),
    total: Math.round(total * 100) / 100,
    totalIngresos: Math.round(totalIngresos * 100) / 100,
    porOrigen,
    porDia,
    items: ordenados,
  };
}
