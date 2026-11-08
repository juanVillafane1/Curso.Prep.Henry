import { normalizar } from "@estudio/shared";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

/** Marca como VENCIDO lo pendiente de presentación cuya fecha ya pasó. */
export async function marcarVencidos(hoy = new Date()) {
  const r = await prisma.vencimientoFiscal.updateMany({
    where: { estado: "PENDIENTE", fechaVencimiento: { lt: normalizar(hoy) } },
    data: { estado: "VENCIDO" },
  });
  logger.info({ marcados: r.count }, "Vencimientos marcados como VENCIDO");
  return r.count;
}
