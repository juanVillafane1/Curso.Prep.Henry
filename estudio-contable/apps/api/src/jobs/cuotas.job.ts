import { evaluarEstadoCuota, normalizar } from "@estudio/shared";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

/**
 * Job diario de doble vencimiento:
 *  VIGENTE pasado el 1º venc. sin débito informado → RECHAZADA (queda reintento X+10)
 *  VIGENTE/RECHAZADA pasado el último venc.        → CAIDA
 * Luego evalúa caducidad del plan según `cuotasCaidasCaducidad`.
 */
export async function procesarCuotasVencidas(hoy = new Date()) {
  const ref = normalizar(hoy);
  const candidatas = await prisma.cuota.findMany({
    where: { estado: { in: ["VIGENTE", "RECHAZADA"] }, fechaVencimiento: { lt: ref }, plan: { estado: "VIGENTE" } },
  });
  let cambios = 0;
  const planesAfectados = new Set<string>();
  for (const c of candidatas) {
    const nuevo = evaluarEstadoCuota({ estado: c.estado, hoy: ref, fechaVencimiento: c.fechaVencimiento, fechaSegundoVencimiento: c.fechaSegundoVencimiento });
    if (nuevo === c.estado) continue;
    await prisma.cuota.update({ where: { id: c.id }, data: { estado: nuevo, motivoRechazo: c.motivoRechazo ?? "Sin débito informado" } });
    cambios++;
    if (nuevo === "CAIDA") planesAfectados.add(c.planId);
  }
  for (const planId of planesAfectados) {
    const plan = await prisma.planCredito.findUnique({ where: { id: planId }, include: { _count: { select: { cuotas: { where: { estado: "CAIDA" } } } } } });
    if (plan?.cuotasCaidasCaducidad && plan._count.cuotas >= plan.cuotasCaidasCaducidad) {
      await prisma.planCredito.update({ where: { id: planId }, data: { estado: "CADUCO" } });
      logger.warn({ planId }, "Plan marcado como CADUCO por cuotas caídas");
    }
  }
  logger.info({ revisadas: candidatas.length, cambios }, "Cuotas procesadas");
  return { revisadas: candidatas.length, cambios };
}
