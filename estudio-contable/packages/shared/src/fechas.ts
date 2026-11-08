/**
 * Utilidades de fechas "civiles" (sin hora). Todas las fechas se normalizan a
 * medianoche UTC para evitar corrimientos por zona horaria: una fecha de
 * vencimiento es un día del calendario, no un instante.
 */

export type ISODate = string; // "YYYY-MM-DD"

export function fecha(y: number, m: number, d: number): Date {
  // m es 1-12
  return new Date(Date.UTC(y, m - 1, d));
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Fecha inválida: ${s}`);
  return fecha(y, m, d);
}

export function toISODate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function normalizar(d: Date): Date {
  return fecha(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function sumarDias(d: Date, dias: number): Date {
  const r = normalizar(d);
  r.setUTCDate(r.getUTCDate() + dias);
  return r;
}

/** Suma meses respetando fin de mes (31/01 + 1 mes = 28/29-02). */
export function sumarMeses(d: Date, meses: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + meses;
  const ultimoDia = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), ultimoDia)));
}

export function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((normalizar(hasta).getTime() - normalizar(desde).getTime()) / 86_400_000);
}

export function esFinDeSemana(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

export interface CalendarioHabil {
  /** Fechas ISO de feriados nacionales / no laborables. */
  feriados: ReadonlySet<ISODate>;
}

export function esDiaHabil(d: Date, cal: CalendarioHabil): boolean {
  return !esFinDeSemana(d) && !cal.feriados.has(toISODate(d));
}

/** Si la fecha cae en día inhábil, se traslada al día hábil inmediato posterior. */
export function siguienteDiaHabil(d: Date, cal: CalendarioHabil): Date {
  let r = normalizar(d);
  while (!esDiaHabil(r, cal)) r = sumarDias(r, 1);
  return r;
}

/** Lunes de la semana (ISO) que contiene la fecha. */
export function inicioSemana(d: Date): Date {
  const r = normalizar(d);
  const dow = r.getUTCDay(); // 0=domingo
  return sumarDias(r, dow === 0 ? -6 : 1 - dow);
}
