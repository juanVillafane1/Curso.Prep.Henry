import { Router } from "express";
import { z } from "zod";
import { inicioSemana, normalizar, parseISODate, rangoVista, toISODate } from "@estudio/shared";
import { prisma } from "../../lib/prisma.js";
import { resumen } from "./dashboard.service.js";
import { generarResumenSemanal } from "../../jobs/resumen-semanal.job.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform(parseISODate);

export const dashboardRouter = Router();

/** GET /dashboard?vista=diaria|semanal&fecha=YYYY-MM-DD&clienteId= */
dashboardRouter.get("/", async (req, res) => {
  const q = z.object({ vista: z.enum(["diaria", "semanal"]).default("diaria"), fecha: isoDate.optional(), clienteId: z.string().optional() }).parse(req.query);
  const { desde, hasta } = rangoVista(q.vista, q.fecha ?? new Date());
  const hoy = normalizar(new Date());
  const [data, alertas] = await Promise.all([
    resumen(desde, hasta, q.clienteId),
    Promise.all([
      prisma.vencimientoFiscal.count({ where: { estado: "VENCIDO" } }),
      prisma.cuota.count({ where: { estado: "CAIDA" } }),
      prisma.cheque.count({ where: { estado: "RECHAZADO" } }),
      prisma.vencimientoFiscal.count({ where: { estado: "PRESENTADO_PENDIENTE_PAGO", fechaVencimientoPago: { lt: hoy } } }),
    ]),
  ]);
  res.json({
    vista: q.vista,
    ...data,
    alertas: { vencimientosVencidos: alertas[0], cuotasCaidas: alertas[1], chequesRechazados: alertas[2], pagosAtrasadosSinComprobante: alertas[3] },
  });
});

/** Resumen semanal persistido (generado los lunes). Si no existe, lo genera. */
dashboardRouter.get("/resumen-semanal", async (req, res) => {
  const q = z.object({ semana: isoDate.optional() }).parse(req.query);
  const lunes = inicioSemana(q.semana ?? new Date());
  const existente = await prisma.resumenSemanal.findUnique({ where: { semanaDesde: lunes } });
  res.json(existente ?? (await generarResumenSemanal(lunes)));
});

dashboardRouter.post("/resumen-semanal/regenerar", async (req, res) => {
  const q = z.object({ semana: isoDate.optional() }).parse(req.body ?? {});
  res.json(await generarResumenSemanal(inicioSemana(q.semana ?? new Date())));
});

/** Cash flow proyectado: totales por día en un rango (default 30 días). */
dashboardRouter.get("/cash-flow", async (req, res) => {
  const q = z.object({ desde: isoDate.optional(), hasta: isoDate.optional(), clienteId: z.string().optional() }).parse(req.query);
  const desde = q.desde ?? normalizar(new Date());
  const hasta = q.hasta ?? new Date(desde.getTime() + 29 * 86_400_000);
  const r = await resumen(desde, hasta, q.clienteId);
  const porDia = Object.entries(r.porDia).map(([fecha, items]) => ({
    fecha,
    egresos: items.filter((i) => i.sentido === "EGRESO").reduce((a, i) => a + (i.importe ?? 0), 0),
    ingresos: items.filter((i) => i.sentido === "INGRESO").reduce((a, i) => a + (i.importe ?? 0), 0),
  }));
  res.json({ desde: toISODate(desde), hasta: toISODate(hasta), porDia });
});
