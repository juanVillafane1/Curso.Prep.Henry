/**
 * Proceso separado para tareas programadas (escalable independientemente de la API).
 * Ejecutar una sola instancia (o agregar lock en DB/Redis si se replica).
 */
import cron from "node-cron";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { enviarRecordatorios } from "./recordatorios.job.js";
import { procesarCuotasVencidas } from "./cuotas.job.js";
import { generarResumenSemanal } from "./resumen-semanal.job.js";
import { marcarVencidos } from "./vencidos.job.js";

const tareas: [string, string, () => Promise<unknown>][] = [
  ["marcar-vencidos", env.CRON_MARCAR_VENCIDOS, () => marcarVencidos()],
  ["cuotas-doble-vencimiento", env.CRON_CUOTAS_DEBITO, () => procesarCuotasVencidas()],
  ["recordatorios-whatsapp", env.CRON_RECORDATORIOS, () => enviarRecordatorios()],
  ["resumen-semanal", env.CRON_RESUMEN_SEMANAL, () => generarResumenSemanal()],
];

for (const [nombre, expr, fn] of tareas) {
  cron.schedule(
    expr,
    async () => {
      logger.info({ tarea: nombre }, "Iniciando tarea programada");
      try {
        await fn();
      } catch (err) {
        logger.error({ err, tarea: nombre }, "Tarea programada falló");
      }
    },
    { timezone: env.TZ, name: nombre },
  );
  logger.info({ tarea: nombre, cron: expr, tz: env.TZ }, "Tarea registrada");
}
