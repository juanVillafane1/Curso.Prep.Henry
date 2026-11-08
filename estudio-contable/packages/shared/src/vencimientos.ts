import { CalendarioHabil, fecha, siguienteDiaHabil, sumarMeses } from "./fechas.js";
import { terminacionDocumento } from "./cuit.js";
import { EstadoVencimiento, TipoImpuesto } from "./enums.js";

/**
 * Regla de escalonamiento: para un impuesto, qué día del mes de vencimiento
 * corresponde a cada terminación de CUIT. ARCA y los fiscos publican el
 * cronograma anual; estas reglas son el DEFAULT y se pueden sobreescribir por
 * período desde la tabla `calendario_fiscal` (reprogramaciones, prórrogas).
 */
export interface ReglaEscalonada {
  /** Meses a sumar al período fiscal para obtener el mes de vencimiento (normalmente 1). */
  mesesDesfase: number;
  /** Día del mes por terminación 0..9. */
  diaPorTerminacion: readonly [number, number, number, number, number, number, number, number, number, number];
}

export const REGLAS_DEFAULT: Partial<Record<TipoImpuesto, ReglaEscalonada>> = {
  // IVA DJ mensual (F.2002) – escalonado típico ARCA
  IVA: { mesesDesfase: 1, diaPorTerminacion: [18, 18, 19, 19, 20, 20, 21, 21, 22, 22] },
  // SUSS – F.931
  F931: { mesesDesfase: 1, diaPorTerminacion: [9, 9, 9, 9, 10, 10, 10, 11, 11, 11] },
  // IIBB Convenio Multilateral (CM03) – referencia; cada jurisdicción local puede diferir
  IIBB: { mesesDesfase: 1, diaPorTerminacion: [15, 15, 16, 16, 17, 17, 18, 18, 19, 19] },
  // Tasas municipales: suelen ser fecha fija; se modela como día único
  TASA_MUNICIPAL: { mesesDesfase: 1, diaPorTerminacion: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20] },
};

/** Override puntual cargado desde la tabla `calendario_fiscal`. */
export interface OverrideCalendario {
  impuesto: TipoImpuesto;
  jurisdiccion?: string | null;
  periodo: string; // "YYYY-MM"
  terminacionDesde: number;
  terminacionHasta: number;
  fecha: Date;
}

export interface CalculoVencimientoInput {
  impuesto: TipoImpuesto;
  documento: string; // CUIT o DNI
  periodo: string; // "YYYY-MM" (período fiscal devengado)
  jurisdiccion?: string | null;
  calendario: CalendarioHabil;
  overrides?: readonly OverrideCalendario[];
  reglas?: Partial<Record<TipoImpuesto, ReglaEscalonada>>;
}

export function parsePeriodo(periodo: string): { anio: number; mes: number } {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodo);
  if (!m) throw new Error(`Período inválido (YYYY-MM): ${periodo}`);
  return { anio: Number(m[1]), mes: Number(m[2]) };
}

/**
 * Fecha de vencimiento de PRESENTACIÓN de la DJ.
 * Prioridad: override del calendario oficial > regla por terminación (+ traslado a día hábil).
 */
export function calcularVencimientoPresentacion(input: CalculoVencimientoInput): Date {
  const terminacion = terminacionDocumento(input.documento);
  const override = input.overrides?.find(
    (o) =>
      o.impuesto === input.impuesto &&
      o.periodo === input.periodo &&
      (o.jurisdiccion ?? null) === (input.jurisdiccion ?? null) &&
      terminacion >= o.terminacionDesde &&
      terminacion <= o.terminacionHasta,
  );
  if (override) return override.fecha; // la fecha oficial ya es día hábil

  const regla = (input.reglas ?? REGLAS_DEFAULT)[input.impuesto];
  if (!regla) {
    throw new Error(`No hay regla de vencimiento para ${input.impuesto}; cargar en calendario_fiscal`);
  }
  const { anio, mes } = parsePeriodo(input.periodo);
  const base = sumarMeses(fecha(anio, mes, 1), regla.mesesDesfase);
  const dia = regla.diaPorTerminacion[terminacion]!;
  return siguienteDiaHabil(fecha(base.getUTCFullYear(), base.getUTCMonth() + 1, dia), input.calendario);
}

/**
 * Fecha de vencimiento de PAGO.
 * Regla del estudio: si el cliente tiene IVA diferido (PyME), el pago del IVA
 * se desplaza `mesesDiferimiento` meses (default 3) desde la presentación.
 */
export function calcularVencimientoPago(params: {
  impuesto: TipoImpuesto;
  fechaPresentacion: Date;
  esIvaDiferido: boolean;
  calendario: CalendarioHabil;
  mesesDiferimiento?: number;
}): Date {
  if (params.impuesto === TipoImpuesto.IVA && params.esIvaDiferido) {
    const meses = params.mesesDiferimiento ?? 3;
    return siguienteDiaHabil(sumarMeses(params.fechaPresentacion, meses), params.calendario);
  }
  return params.fechaPresentacion;
}

/** Determina qué impuestos aplican al cliente según su segmentación. */
export function impuestoHabilitado(
  impuesto: TipoImpuesto,
  cliente: { tieneEmpleados: boolean },
): boolean {
  if (impuesto === TipoImpuesto.F931) return cliente.tieneEmpleados;
  return true;
}

export class ReglaNegocioError extends Error {
  constructor(
    message: string,
    public readonly codigo: string,
  ) {
    super(message);
    this.name = "ReglaNegocioError";
  }
}

/**
 * Registrar la presentación de la DJ.
 * - Monto $0 → FINALIZADO sin exigir comprobante.
 * - Monto > 0 → PRESENTADO_PENDIENTE_PAGO (o FINALIZADO si ya trae comprobante).
 */
export function estadoTrasPresentacion(params: {
  estadoActual: EstadoVencimiento;
  monto: number;
  tieneComprobantePago: boolean;
}): EstadoVencimiento {
  if (params.estadoActual === EstadoVencimiento.ANULADO || params.estadoActual === EstadoVencimiento.FINALIZADO) {
    throw new ReglaNegocioError(`No se puede presentar un vencimiento en estado ${params.estadoActual}`, "ESTADO_INVALIDO");
  }
  if (params.monto < 0) throw new ReglaNegocioError("El monto no puede ser negativo", "MONTO_INVALIDO");
  if (params.monto === 0) return EstadoVencimiento.FINALIZADO;
  return params.tieneComprobantePago ? EstadoVencimiento.FINALIZADO : EstadoVencimiento.PRESENTADO_PENDIENTE_PAGO;
}

/** Cierre de un vencimiento con saldo: exige comprobante (VEP / ticket de pago). */
export function validarCierre(params: { monto: number | null; tieneComprobantePago: boolean }): void {
  if (params.monto === null) {
    throw new ReglaNegocioError("Primero debe registrarse la presentación con su monto", "SIN_PRESENTACION");
  }
  if (params.monto > 0 && !params.tieneComprobantePago) {
    throw new ReglaNegocioError("Monto > $0: debe adjuntar el VEP/comprobante de pago para finalizar", "COMPROBANTE_REQUERIDO");
  }
}
