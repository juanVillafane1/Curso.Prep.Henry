import { EstadoCuota, TipoPlan } from "./enums.js";
import { CalendarioHabil, fecha, siguienteDiaHabil, sumarDias, sumarMeses } from "./fechas.js";

export interface CuotaGenerada {
  numero: number;
  fechaVencimiento: Date;
  /** Solo planes ARCA: reintento de débito (1º venc. + N días). */
  fechaSegundoVencimiento: Date | null;
  capital: number;
  interes: number;
  importe: number;
}

export interface GenerarCuotasInput {
  tipo: TipoPlan;
  cantidadCuotas: number;
  fechaPrimerVencimiento: Date;
  /** Si se informa, se usa el mismo importe para todas las cuotas. */
  importeCuota?: number;
  montoTotal?: number;
  /** Tasa mensual efectiva (ej. 0.04 = 4%). Si se informa con montoTotal → sistema francés. */
  tasaMensual?: number;
  diasReintento?: number;
  calendario: CalendarioHabil;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Genera el cronograma de cuotas.
 * - Planes ARCA: doble vencimiento (día X y día X + `diasReintento`, default 10).
 * - Préstamos: sistema francés si hay tasa, si no cuota fija.
 */
export function generarCuotas(input: GenerarCuotasInput): CuotaGenerada[] {
  const n = input.cantidadCuotas;
  if (n < 1) throw new Error("cantidadCuotas debe ser >= 1");
  const dobleVencimiento = input.tipo === TipoPlan.PLAN_ARCA;
  const reintento = input.diasReintento ?? 10;

  let cuotaFija: number;
  if (input.importeCuota != null) {
    cuotaFija = input.importeCuota;
  } else if (input.montoTotal != null && input.tasaMensual) {
    const i = input.tasaMensual;
    cuotaFija = (input.montoTotal * i) / (1 - Math.pow(1 + i, -n));
  } else if (input.montoTotal != null) {
    cuotaFija = input.montoTotal / n;
  } else {
    throw new Error("Debe informar importeCuota o montoTotal");
  }

  const base = input.fechaPrimerVencimiento;
  let saldo = input.montoTotal ?? cuotaFija * n;
  const cuotas: CuotaGenerada[] = [];
  for (let k = 0; k < n; k++) {
    const teorica = sumarMeses(fecha(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate()), k);
    const venc1 = siguienteDiaHabil(teorica, input.calendario);
    const venc2 = dobleVencimiento ? siguienteDiaHabil(sumarDias(teorica, reintento), input.calendario) : null;
    const interes = input.tasaMensual && input.montoTotal != null ? redondear(saldo * input.tasaMensual) : 0;
    let capital = redondear(cuotaFija - interes);
    if (k === n - 1 && input.montoTotal != null) capital = redondear(saldo); // ajuste de redondeo
    saldo = redondear(saldo - capital);
    cuotas.push({
      numero: k + 1,
      fechaVencimiento: venc1,
      fechaSegundoVencimiento: venc2,
      capital,
      interes,
      importe: redondear(capital + interes),
    });
  }
  return cuotas;
}

export type ResultadoDebito = "OK" | "ERROR" | "SIN_FONDOS";

const TRANSICIONES_CUOTA: Record<EstadoCuota, readonly EstadoCuota[]> = {
  VIGENTE: ["DEBITADA", "RECHAZADA", "CAIDA", "IMPUTADA"],
  RECHAZADA: ["DEBITADA", "CAIDA", "IMPUTADA"], // reintento en 2º vencimiento
  CAIDA: ["DEBITADA", "IMPUTADA"], // regularización manual / rehabilitación
  DEBITADA: ["IMPUTADA", "RECHAZADA"], // contracargo
  IMPUTADA: [],
};

export function puedeTransicionarCuota(desde: EstadoCuota, hacia: EstadoCuota): boolean {
  return TRANSICIONES_CUOTA[desde].includes(hacia);
}

/**
 * Evalúa el estado de una cuota a una fecha dada (job diario de débitos).
 * - Antes del 1º vencimiento: sin cambios.
 * - Entre 1º y 2º vencimiento sin débito: RECHAZADA (queda el reintento).
 * - Pasado el 2º vencimiento (o el único, si no es ARCA) sin débito: CAIDA.
 */
export function evaluarEstadoCuota(params: {
  estado: EstadoCuota;
  hoy: Date;
  fechaVencimiento: Date;
  fechaSegundoVencimiento: Date | null;
}): EstadoCuota {
  const { estado, hoy } = params;
  if (estado !== EstadoCuota.VIGENTE && estado !== EstadoCuota.RECHAZADA) return estado;
  const ultimo = params.fechaSegundoVencimiento ?? params.fechaVencimiento;
  if (hoy > ultimo) return EstadoCuota.CAIDA;
  if (hoy > params.fechaVencimiento && params.fechaSegundoVencimiento) return EstadoCuota.RECHAZADA;
  return estado;
}

/** Aplica el resultado informado por el banco/ARCA para un intento de débito. */
export function aplicarResultadoDebito(params: {
  estado: EstadoCuota;
  resultado: ResultadoDebito;
  intento: 1 | 2;
  tieneSegundoVencimiento: boolean;
}): EstadoCuota {
  if (params.resultado === "OK") return EstadoCuota.DEBITADA;
  // Falló el débito: si queda reintento, RECHAZADA; si no, CAIDA
  return params.intento === 1 && params.tieneSegundoVencimiento ? EstadoCuota.RECHAZADA : EstadoCuota.CAIDA;
}
