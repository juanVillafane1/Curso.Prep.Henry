import { DireccionCheque, EstadoCheque } from "./enums.js";
import { diasEntre, sumarDias } from "./fechas.js";

/**
 * Ley 24.452: el cheque debe presentarse al cobro dentro de los 30 días
 * corridos desde su fecha de emisión (cheque común) o desde su fecha de pago
 * (cheque de pago diferido / ECHEQ diferido).
 */
export function calcularFechasCheque(params: {
  fechaEmision: Date;
  fechaPago?: Date | null;
  diasValidez?: number;
  /** Límite operativo interno (opcional, ej. depositar 2 días antes). */
  margenDeposito?: number;
}): { fechaVencimientoLegal: Date; fechaLimiteDeposito: Date } {
  const desde = params.fechaPago ?? params.fechaEmision;
  const fechaVencimientoLegal = sumarDias(desde, params.diasValidez ?? 30);
  const fechaLimiteDeposito = sumarDias(fechaVencimientoLegal, -(params.margenDeposito ?? 0));
  return { fechaVencimientoLegal, fechaLimiteDeposito };
}

const TRANSICIONES: Record<EstadoCheque, readonly EstadoCheque[]> = {
  EN_CARTERA: ["DEPOSITADO", "ENDOSADO", "COBRADO", "RECHAZADO", "ANULADO"],
  DEPOSITADO: ["COBRADO", "RECHAZADO"],
  ENDOSADO: ["RECHAZADO"], // el tercero lo rebota
  COBRADO: [],
  RECHAZADO: ["EN_CARTERA"], // re-presentación / reemplazo acordado
  ANULADO: [],
};

export function transicionesPermitidas(desde: EstadoCheque): readonly EstadoCheque[] {
  return TRANSICIONES[desde];
}

export function validarTransicionCheque(params: {
  desde: EstadoCheque;
  hacia: EstadoCheque;
  direccion: DireccionCheque;
  proveedorEndoso?: string | null;
}): void {
  const { desde, hacia } = params;
  if (!TRANSICIONES[desde].includes(hacia)) {
    throw new Error(`Transición de cheque inválida: ${desde} → ${hacia}`);
  }
  if (hacia === EstadoCheque.ENDOSADO) {
    if (params.direccion !== DireccionCheque.RECIBIDO) throw new Error("Solo se pueden endosar cheques recibidos");
    if (!params.proveedorEndoso) throw new Error("Debe indicar el proveedor/tercero al que se endosa");
  }
  if (hacia === EstadoCheque.DEPOSITADO && params.direccion !== DireccionCheque.RECIBIDO) {
    throw new Error("Solo se depositan cheques recibidos");
  }
}

export type AlertaCheque = "OK" | "PROXIMO_A_VENCER" | "VENCIDO_LEGAL" | "NO_DEPOSITABLE_AUN" | "DEBITO_PROXIMO" | "DEBITO_VENCIDO";

/**
 * Semáforo para cheques en cartera.
 * - Recibidos: ventana de depósito (no antes de la fecha de pago, no después del límite legal).
 * - Emitidos: aviso de débito próximo para que el cliente tenga fondos.
 */
export function alertaCheque(params: {
  estado: EstadoCheque;
  direccion: DireccionCheque;
  hoy: Date;
  fechaPago: Date | null;
  fechaLimiteDeposito: Date;
  diasAviso?: number;
}): AlertaCheque {
  if (params.estado !== EstadoCheque.EN_CARTERA) return "OK";
  if (params.direccion === DireccionCheque.EMITIDO) {
    const fecha = params.fechaPago ?? params.fechaLimiteDeposito;
    const faltan = diasEntre(params.hoy, fecha);
    if (faltan < 0) return "DEBITO_VENCIDO";
    return faltan <= (params.diasAviso ?? 5) ? "DEBITO_PROXIMO" : "OK";
  }
  if (params.fechaPago && params.hoy < params.fechaPago) return "NO_DEPOSITABLE_AUN";
  const restantes = diasEntre(params.hoy, params.fechaLimiteDeposito);
  if (restantes < 0) return "VENCIDO_LEGAL";
  if (restantes <= (params.diasAviso ?? 5)) return "PROXIMO_A_VENCER";
  return "OK";
}

/** Las categorías de gasto solo se imputan a clientes con contabilidad completa. */
export function puedeImputarCategoria(cliente: { manejaContabilidadCompleta: boolean }): boolean {
  return cliente.manejaContabilidadCompleta;
}
