import type { CalendarioHabil, OverrideCalendario } from "@estudio/shared";
import { prisma } from "./prisma.js";

/** Carga feriados desde la DB (cache simple en memoria por proceso). */
let cache: { at: number; cal: CalendarioHabil } | null = null;

export async function calendarioHabil(): Promise<CalendarioHabil> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.cal;
  const feriados = await prisma.feriado.findMany({ select: { fecha: true } });
  const cal = { feriados: new Set(feriados.map((f) => f.fecha.toISOString().slice(0, 10))) };
  cache = { at: Date.now(), cal };
  return cal;
}

export function invalidarCalendario() {
  cache = null;
}

export async function overridesPeriodo(periodos: string[]): Promise<OverrideCalendario[]> {
  const rows = await prisma.calendarioFiscal.findMany({ where: { periodo: { in: periodos } } });
  return rows.map((r) => ({
    impuesto: r.impuesto,
    jurisdiccion: r.jurisdiccion === "NACIONAL" ? null : r.jurisdiccion,
    periodo: r.periodo,
    terminacionDesde: r.terminacionDesde,
    terminacionHasta: r.terminacionHasta,
    fecha: r.fecha,
  }));
}
