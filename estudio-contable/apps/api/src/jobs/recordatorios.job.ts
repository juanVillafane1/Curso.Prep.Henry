import { correspondeRecordatorio, mensajeRecordatorio, normalizar, sumarDias, toISODate } from "@estudio/shared";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { num } from "../lib/http.js";
import { env } from "../config/env.js";
import { whatsapp } from "../integrations/whatsapp/whatsapp.js";

const fmt = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Recordatorios por WhatsApp N días antes (default 3 y 2) de:
 *  - vencimientos fiscales pendientes (presentación) o de pago (IVA diferido)
 *  - cuotas de planes/préstamos vigentes
 * Idempotente gracias a `claveIdempotencia` única.
 */
export async function enviarRecordatorios(hoy = new Date()) {
  const ref = normalizar(hoy);
  const maxDias = Math.max(...env.RECORDATORIO_DIAS_ANTES);
  const rango = { gte: ref, lte: sumarDias(ref, maxDias) };
  const clienteNotificable = { activo: true, aceptaNotificaciones: true, telefonoWhatsapp: { not: null } };

  const [vencimientos, cuotas] = await Promise.all([
    prisma.vencimientoFiscal.findMany({
      where: {
        cliente: clienteNotificable,
        OR: [
          { estado: "PENDIENTE", fechaVencimiento: rango },
          { estado: "PRESENTADO_PENDIENTE_PAGO", fechaVencimientoPago: rango },
        ],
      },
      include: { cliente: true },
    }),
    prisma.cuota.findMany({
      where: { estado: "VIGENTE", fechaVencimiento: rango, plan: { estado: "VIGENTE", cliente: clienteNotificable } },
      include: { plan: { include: { cliente: true } } },
    }),
  ]);

  type Pendiente = { clienteId: string; destino: string; nombre: string; concepto: string; fecha: Date; importe: number | null; clave: string; vencimientoId?: string; cuotaId?: string };
  const pendientes: Pendiente[] = [];

  for (const v of vencimientos) {
    const esPago = v.estado === "PRESENTADO_PENDIENTE_PAGO";
    const fecha = esPago ? v.fechaVencimientoPago : v.fechaVencimiento;
    const dias = correspondeRecordatorio(ref, fecha, env.RECORDATORIO_DIAS_ANTES);
    if (dias == null) continue;
    pendientes.push({
      clienteId: v.clienteId,
      destino: v.cliente.telefonoWhatsapp!,
      nombre: v.cliente.nombreFantasia ?? v.cliente.razonSocial,
      concepto: `${esPago ? "el pago" : "la presentación"} de ${v.impuesto} período ${v.periodo}`,
      fecha,
      importe: esPago ? num(v.monto) : null,
      clave: `VENC:${v.id}:${esPago ? "PAGO" : "PRES"}:${dias}`,
      vencimientoId: v.id,
    });
  }
  for (const c of cuotas) {
    const dias = correspondeRecordatorio(ref, c.fechaVencimiento, env.RECORDATORIO_DIAS_ANTES);
    if (dias == null) continue;
    const cl = c.plan.cliente;
    pendientes.push({
      clienteId: cl.id,
      destino: cl.telefonoWhatsapp!,
      nombre: cl.nombreFantasia ?? cl.razonSocial,
      concepto: `la cuota ${c.numero}/${c.plan.cantidadCuotas} de ${c.plan.entidad}${c.plan.numero ? ` (${c.plan.numero})` : ""}. Verificá fondos en la cuenta de débito`,
      fecha: c.fechaVencimiento,
      importe: num(c.importe),
      clave: `CUOTA:${c.id}:${dias}`,
      cuotaId: c.id,
    });
  }

  let enviadas = 0;
  let fallidas = 0;
  for (const p of pendientes) {
    const fechaTxt = fmt(toISODate(p.fecha));
    const mensaje = mensajeRecordatorio({ cliente: p.nombre, concepto: p.concepto, fecha: fechaTxt, importe: p.importe });
    // Reserva idempotente: si ya existe la clave, se omite
    const notif = await prisma.notificacion
      .create({
        data: { clienteId: p.clienteId, destino: p.destino, plantilla: env.WHATSAPP_TEMPLATE_RECORDATORIO, mensaje, claveIdempotencia: p.clave, vencimientoId: p.vencimientoId, cuotaId: p.cuotaId, programadaPara: new Date() },
      })
      .catch(() => null);
    if (!notif) continue;
    try {
      const r = await whatsapp.enviar({
        destino: p.destino,
        plantilla: env.WHATSAPP_TEMPLATE_RECORDATORIO,
        parametros: [p.nombre, p.concepto, fechaTxt, p.importe != null ? `$${p.importe.toLocaleString("es-AR")}` : "-"],
        textoPlano: mensaje,
      });
      await prisma.notificacion.update({ where: { id: notif.id }, data: { estado: "ENVIADA", enviadaAt: new Date(), proveedorMsgId: r.id } });
      enviadas++;
    } catch (err) {
      await prisma.notificacion.update({ where: { id: notif.id }, data: { estado: "FALLIDA", error: String(err) } });
      fallidas++;
    }
  }
  logger.info({ enviadas, fallidas, candidatos: pendientes.length }, "Recordatorios WhatsApp procesados");
  return { enviadas, fallidas, candidatos: pendientes.length };
}
