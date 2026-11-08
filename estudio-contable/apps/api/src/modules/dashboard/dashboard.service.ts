import { consolidar, toISODate, type Compromiso } from "@estudio/shared";
import { prisma } from "../../lib/prisma.js";
import { num } from "../../lib/http.js";

const ETIQUETA_IMPUESTO: Record<string, string> = {
  IVA: "IVA",
  IIBB: "Ingresos Brutos",
  TASA_MUNICIPAL: "Tasa Municipal",
  F931: "F.931 Cargas Sociales",
  GANANCIAS: "Ganancias",
  BIENES_PERSONALES: "Bienes Personales",
  AUTONOMOS: "Autónomos",
  MONOTRIBUTO: "Monotributo",
  OTRO: "Otro",
};

/**
 * Compromisos (impuestos + cuotas + cheques a pagar/depositar) entre dos fechas.
 * - Impuestos: vencimiento de presentación pendiente o de pago (IVA diferido).
 * - Cuotas: 1º vencimiento o 2º (reintento) si la primera fue rechazada.
 * - Cheques: emitidos a debitar (fecha de pago) y recibidos a depositar (límite).
 */
export async function compromisosEntre(desde: Date, hasta: Date, clienteId?: string): Promise<Compromiso[]> {
  const rango = { gte: desde, lte: hasta };
  const [presentaciones, pagos, cuotas, chequesEmitidos, chequesCartera] = await Promise.all([
    prisma.vencimientoFiscal.findMany({
      where: { fechaVencimiento: rango, estado: { in: ["PENDIENTE", "VENCIDO"] }, clienteId },
      include: { cliente: { select: { id: true, razonSocial: true } } },
    }),
    prisma.vencimientoFiscal.findMany({
      where: { fechaVencimientoPago: rango, estado: "PRESENTADO_PENDIENTE_PAGO", clienteId },
      include: { cliente: { select: { id: true, razonSocial: true } } },
    }),
    prisma.cuota.findMany({
      where: {
        plan: { estado: "VIGENTE", ...(clienteId && { clienteId }) },
        OR: [
          { estado: "VIGENTE", fechaVencimiento: rango },
          { estado: "RECHAZADA", fechaSegundoVencimiento: rango },
        ],
      },
      include: { plan: { select: { tipo: true, entidad: true, numero: true, cliente: { select: { id: true, razonSocial: true } } } } },
    }),
    prisma.cheque.findMany({
      where: { direccion: "EMITIDO", estado: "EN_CARTERA", fechaPago: rango, ...(clienteId && { clienteEmisorId: clienteId }) },
      include: { clienteEmisor: { select: { id: true, razonSocial: true } }, proveedorEntregado: true },
    }),
    prisma.cheque.findMany({
      where: { direccion: "RECIBIDO", estado: "EN_CARTERA", fechaLimiteDeposito: rango, ...(clienteId && { clienteReceptorId: clienteId }) },
      include: { clienteReceptor: { select: { id: true, razonSocial: true } } },
    }),
  ]);

  const items: Compromiso[] = [];
  for (const v of presentaciones) {
    items.push({ origen: "IMPUESTO", sentido: "EGRESO", id: v.id, clienteId: v.cliente.id, clienteNombre: v.cliente.razonSocial, descripcion: `Presentación ${ETIQUETA_IMPUESTO[v.impuesto]} ${v.periodo}`, fecha: toISODate(v.fechaVencimiento), importe: num(v.monto), estado: v.estado });
  }
  for (const v of pagos) {
    items.push({ origen: "IMPUESTO", sentido: "EGRESO", id: v.id, clienteId: v.cliente.id, clienteNombre: v.cliente.razonSocial, descripcion: `Pago ${ETIQUETA_IMPUESTO[v.impuesto]} ${v.periodo}`, fecha: toISODate(v.fechaVencimientoPago), importe: num(v.monto), estado: v.estado });
  }
  for (const c of cuotas) {
    const reintento = c.estado === "RECHAZADA";
    const f = reintento ? c.fechaSegundoVencimiento! : c.fechaVencimiento;
    items.push({ origen: "CUOTA", sentido: "EGRESO", id: c.id, clienteId: c.plan.cliente.id, clienteNombre: c.plan.cliente.razonSocial, descripcion: `${c.plan.entidad} ${c.plan.numero ?? ""} cuota ${c.numero}${reintento ? " (2º venc.)" : ""}`.trim(), fecha: toISODate(f), importe: num(c.importe), estado: c.estado });
  }
  for (const ch of chequesEmitidos) {
    if (!ch.clienteEmisor) continue;
    items.push({ origen: "CHEQUE", sentido: "EGRESO", id: ch.id, clienteId: ch.clienteEmisor.id, clienteNombre: ch.clienteEmisor.razonSocial, descripcion: `${ch.tipo === "ECHEQ" ? "ECHEQ" : "Cheque"} a pagar N° ${ch.numero}${ch.proveedorEntregado ? ` – ${ch.proveedorEntregado.nombre}` : ""}`, fecha: toISODate(ch.fechaPago!), importe: num(ch.importe), estado: ch.estado });
  }
  for (const ch of chequesCartera) {
    if (!ch.clienteReceptor) continue;
    items.push({ origen: "CHEQUE", sentido: "INGRESO", id: ch.id, clienteId: ch.clienteReceptor.id, clienteNombre: ch.clienteReceptor.razonSocial, descripcion: `Depositar ${ch.tipo === "ECHEQ" ? "ECHEQ" : "cheque"} N° ${ch.numero} (límite legal)`, fecha: toISODate(ch.fechaLimiteDeposito), importe: num(ch.importe), estado: ch.estado });
  }
  return items;
}

export async function resumen(desde: Date, hasta: Date, clienteId?: string) {
  return consolidar(desde, hasta, await compromisosEntre(desde, hasta, clienteId));
}
