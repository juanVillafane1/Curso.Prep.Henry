import {
  calcularVencimientoPago,
  calcularVencimientoPresentacion,
  impuestoHabilitado,
  type TipoImpuesto,
} from "@estudio/shared";
import { prisma } from "../../lib/prisma.js";
import { calendarioHabil, overridesPeriodo } from "../../lib/calendario.js";
import { env } from "../../config/env.js";

/**
 * Genera (idempotente) los vencimientos de un período para todos los clientes
 * activos según sus obligaciones (`cliente_impuestos`). No pisa vencimientos
 * existentes con override manual ni ya presentados.
 */
export async function generarVencimientosPeriodo(periodo: string, clienteId?: string) {
  const [cal, overrides] = await Promise.all([calendarioHabil(), overridesPeriodo([periodo])]);
  const obligaciones = await prisma.clienteImpuesto.findMany({
    where: { activo: true, periodicidad: "MENSUAL", cliente: { activo: true, ...(clienteId && { id: clienteId }) } },
    include: { cliente: true },
  });

  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;
  for (const ob of obligaciones) {
    if (!impuestoHabilitado(ob.impuesto as TipoImpuesto, ob.cliente)) {
      omitidos++;
      continue;
    }
    const jurisdiccion = ob.jurisdiccion === "NACIONAL" ? null : ob.jurisdiccion;
    const fechaVenc = ob.diaFijo
      ? calcularVencimientoPresentacion({
          impuesto: ob.impuesto,
          documento: ob.cliente.cuit,
          periodo,
          jurisdiccion,
          calendario: cal,
          overrides,
          reglas: { [ob.impuesto]: { mesesDesfase: 1, diaPorTerminacion: Array(10).fill(ob.diaFijo) } },
        })
      : calcularVencimientoPresentacion({ impuesto: ob.impuesto, documento: ob.cliente.cuit, periodo, jurisdiccion, calendario: cal, overrides });
    const fechaPago = calcularVencimientoPago({
      impuesto: ob.impuesto,
      fechaPresentacion: fechaVenc,
      esIvaDiferido: ob.cliente.esIvaDiferido,
      calendario: cal,
      mesesDiferimiento: env.IVA_DIFERIDO_MESES,
    });

    const key = { clienteId: ob.clienteId, impuesto: ob.impuesto, jurisdiccion: ob.jurisdiccion, periodo };
    const existente = await prisma.vencimientoFiscal.findUnique({ where: { clienteId_impuesto_jurisdiccion_periodo: key } });
    if (!existente) {
      await prisma.vencimientoFiscal.create({
        data: { ...key, fechaVencimientoCalculada: fechaVenc, fechaVencimiento: fechaVenc, fechaVencimientoPago: fechaPago },
      });
      creados++;
    } else if (!existente.esOverrideManual && existente.estado === "PENDIENTE") {
      // Recalcular (p.ej. se cargó una prórroga en calendario_fiscal)
      await prisma.vencimientoFiscal.update({
        where: { id: existente.id },
        data: { fechaVencimientoCalculada: fechaVenc, fechaVencimiento: fechaVenc, fechaVencimientoPago: fechaPago },
      });
      actualizados++;
    } else {
      omitidos++;
    }
  }
  return { periodo, creados, actualizados, omitidos };
}
