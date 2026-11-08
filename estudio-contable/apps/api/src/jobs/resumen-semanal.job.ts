import { inicioSemana, rangoResumenSemanal } from "@estudio/shared";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { resumen } from "../modules/dashboard/dashboard.service.js";

/**
 * Lunes: consolida los compromisos de los próximos 7 días (impuestos + cuotas
 * + cheques) y persiste un snapshot para consulta/envío interno.
 */
export async function generarResumenSemanal(referencia = new Date()) {
  const lunes = inicioSemana(referencia);
  const { desde, hasta } = rangoResumenSemanal(lunes);
  const contenido = await resumen(desde, hasta);
  const row = await prisma.resumenSemanal.upsert({
    where: { semanaDesde: desde },
    create: { semanaDesde: desde, semanaHasta: hasta, totalImporte: contenido.total, contenido: contenido as object },
    update: { semanaHasta: hasta, totalImporte: contenido.total, contenido: contenido as object, generadoAt: new Date() },
  });
  logger.info({ semana: desde.toISOString().slice(0, 10), items: contenido.items.length }, "Resumen semanal generado");
  return row;
}
