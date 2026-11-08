import { Router } from "express";
import { z } from "zod";
import { calcularVencimientoPago, estadoTrasPresentacion, validarCierre, parseISODate } from "@estudio/shared";
import { prisma } from "../../lib/prisma.js";
import { HttpError, notFound, num } from "../../lib/http.js";
import { calendarioHabil } from "../../lib/calendario.js";
import { env } from "../../config/env.js";
import { generarVencimientosPeriodo } from "./vencimientos.service.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform(parseISODate);
const periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const ESTADOS = ["PENDIENTE", "PRESENTADO_PENDIENTE_PAGO", "FINALIZADO", "VENCIDO", "ANULADO"] as const;
const IMPUESTOS = ["IVA", "IIBB", "TASA_MUNICIPAL", "F931", "GANANCIAS", "BIENES_PERSONALES", "AUTONOMOS", "MONOTRIBUTO", "OTRO"] as const;

const COMPROBANTES = ["VEP", "COMPROBANTE_PAGO"] as const;

export const vencimientosRouter = Router();

vencimientosRouter.get("/", async (req, res) => {
  const q = z
    .object({
      desde: isoDate.optional(),
      hasta: isoDate.optional(),
      clienteId: z.string().optional(),
      impuesto: z.enum(IMPUESTOS).optional(),
      estado: z.enum(ESTADOS).optional(),
      periodo: periodo.optional(),
    })
    .parse(req.query);
  const data = await prisma.vencimientoFiscal.findMany({
    where: {
      clienteId: q.clienteId,
      impuesto: q.impuesto,
      estado: q.estado,
      periodo: q.periodo,
      ...((q.desde || q.hasta) && { fechaVencimiento: { gte: q.desde, lte: q.hasta } }),
    },
    include: { cliente: { select: { id: true, razonSocial: true, cuit: true } }, adjuntos: { select: { id: true, tipo: true } } },
    orderBy: [{ fechaVencimiento: "asc" }, { impuesto: "asc" }],
  });
  res.json(data);
});

/** Generación masiva/idempotente de la agenda de un período. */
vencimientosRouter.post("/generar", async (req, res) => {
  const body = z.object({ periodo, clienteId: z.string().optional() }).parse(req.body);
  res.json(await generarVencimientosPeriodo(body.periodo, body.clienteId));
});

/** Alta manual (obligaciones no periódicas o anuales). */
vencimientosRouter.post("/", async (req, res) => {
  const body = z
    .object({ clienteId: z.string(), impuesto: z.enum(IMPUESTOS), jurisdiccion: z.string().default("NACIONAL"), periodo: z.string(), fechaVencimiento: isoDate, observaciones: z.string().optional() })
    .parse(req.body);
  const cliente = await prisma.cliente.findUnique({ where: { id: body.clienteId } });
  if (!cliente) throw notFound("Cliente");
  const fechaPago = calcularVencimientoPago({
    impuesto: body.impuesto,
    fechaPresentacion: body.fechaVencimiento,
    esIvaDiferido: cliente.esIvaDiferido,
    calendario: await calendarioHabil(),
    mesesDiferimiento: env.IVA_DIFERIDO_MESES,
  });
  const v = await prisma.vencimientoFiscal.create({
    data: { ...body, fechaVencimientoCalculada: body.fechaVencimiento, fechaVencimientoPago: fechaPago, esOverrideManual: true, motivoOverride: "Alta manual" },
  });
  res.status(201).json(v);
});

vencimientosRouter.get("/:id", async (req, res) => {
  const v = await prisma.vencimientoFiscal.findUnique({ where: { id: req.params.id }, include: { cliente: true, adjuntos: true, notificaciones: true } });
  if (!v) throw notFound("Vencimiento");
  res.json(v);
});

/** Override manual de fecha (reprogramación ARCA/AFIP, prórroga). Queda auditado. */
vencimientosRouter.patch("/:id/fecha", async (req, res) => {
  const body = z.object({ fechaVencimiento: isoDate, fechaVencimientoPago: isoDate.optional(), motivo: z.string().min(3) }).parse(req.body);
  const actual = await prisma.vencimientoFiscal.findUnique({ where: { id: req.params.id }, include: { cliente: true } });
  if (!actual) throw notFound("Vencimiento");
  const fechaPago =
    body.fechaVencimientoPago ??
    calcularVencimientoPago({
      impuesto: actual.impuesto,
      fechaPresentacion: body.fechaVencimiento,
      esIvaDiferido: actual.cliente.esIvaDiferido,
      calendario: await calendarioHabil(),
      mesesDiferimiento: env.IVA_DIFERIDO_MESES,
    });
  const [v] = await prisma.$transaction([
    prisma.vencimientoFiscal.update({
      where: { id: actual.id },
      data: { fechaVencimiento: body.fechaVencimiento, fechaVencimientoPago: fechaPago, esOverrideManual: true, motivoOverride: body.motivo, ...(actual.estado === "VENCIDO" && { estado: "PENDIENTE" }) },
    }),
    prisma.eventoAuditoria.create({
      data: {
        entidad: "VencimientoFiscal",
        entidadId: actual.id,
        accion: "OVERRIDE_FECHA",
        antes: { fechaVencimiento: actual.fechaVencimiento, fechaVencimientoPago: actual.fechaVencimientoPago },
        despues: { fechaVencimiento: body.fechaVencimiento, fechaVencimientoPago: fechaPago, motivo: body.motivo },
        usuarioId: res.locals.usuarioId,
      },
    }),
  ]);
  res.json(v);
});

/** Revertir override: vuelve a la fecha calculada por reglas. */
vencimientosRouter.delete("/:id/fecha", async (req, res) => {
  const actual = await prisma.vencimientoFiscal.findUnique({ where: { id: req.params.id }, include: { cliente: true } });
  if (!actual) throw notFound("Vencimiento");
  const fechaPago = calcularVencimientoPago({
    impuesto: actual.impuesto,
    fechaPresentacion: actual.fechaVencimientoCalculada,
    esIvaDiferido: actual.cliente.esIvaDiferido,
    calendario: await calendarioHabil(),
    mesesDiferimiento: env.IVA_DIFERIDO_MESES,
  });
  res.json(
    await prisma.vencimientoFiscal.update({
      where: { id: actual.id },
      data: { fechaVencimiento: actual.fechaVencimientoCalculada, fechaVencimientoPago: fechaPago, esOverrideManual: false, motivoOverride: null },
    }),
  );
});

/**
 * Registrar presentación de la DJ.
 * monto = 0 → FINALIZADO (no exige comprobante). monto > 0 → PRESENTADO_PENDIENTE_PAGO.
 */
vencimientosRouter.post("/:id/presentacion", async (req, res) => {
  const body = z.object({ monto: z.number().min(0), saldoAFavor: z.number().min(0).optional(), fechaPresentacion: isoDate.optional(), numeroVep: z.string().optional() }).parse(req.body);
  const v = await prisma.vencimientoFiscal.findUnique({ where: { id: req.params.id }, include: { adjuntos: true } });
  if (!v) throw notFound("Vencimiento");
  const tieneComprobante = v.adjuntos.some((a) => (COMPROBANTES as readonly string[]).includes(a.tipo));
  const estado = estadoTrasPresentacion({ estadoActual: v.estado, monto: body.monto, tieneComprobantePago: tieneComprobante });
  res.json(
    await prisma.vencimientoFiscal.update({
      where: { id: v.id },
      data: { monto: body.monto, saldoAFavor: body.saldoAFavor, numeroVep: body.numeroVep, fechaPresentacion: body.fechaPresentacion ?? new Date(), estado, ...(estado === "FINALIZADO" && body.monto > 0 && { fechaPago: new Date() }) },
    }),
  );
});

/** Cierre por pago: exige adjunto VEP/COMPROBANTE_PAGO si monto > 0. */
vencimientosRouter.post("/:id/finalizar", async (req, res) => {
  const body = z.object({ fechaPago: isoDate.optional() }).parse(req.body ?? {});
  const v = await prisma.vencimientoFiscal.findUnique({ where: { id: req.params.id }, include: { adjuntos: true } });
  if (!v) throw notFound("Vencimiento");
  if (v.estado === "FINALIZADO" || v.estado === "ANULADO") throw new HttpError(422, `El vencimiento ya está ${v.estado}`, "ESTADO_INVALIDO");
  validarCierre({ monto: num(v.monto), tieneComprobantePago: v.adjuntos.some((a) => (COMPROBANTES as readonly string[]).includes(a.tipo)) });
  res.json(await prisma.vencimientoFiscal.update({ where: { id: v.id }, data: { estado: "FINALIZADO", fechaPago: body.fechaPago ?? new Date() } }));
});

vencimientosRouter.post("/:id/anular", async (req, res) => {
  const body = z.object({ motivo: z.string().min(3) }).parse(req.body);
  res.json(await prisma.vencimientoFiscal.update({ where: { id: req.params.id }, data: { estado: "ANULADO", observaciones: body.motivo } }));
});

// ---- Calendario fiscal oficial (overrides masivos por terminación) ----
export const calendarioRouter = Router();

calendarioRouter.get("/", async (req, res) => {
  const q = z.object({ periodo: periodo.optional(), impuesto: z.enum(IMPUESTOS).optional() }).parse(req.query);
  res.json(await prisma.calendarioFiscal.findMany({ where: q, orderBy: [{ periodo: "asc" }, { impuesto: "asc" }, { terminacionDesde: "asc" }] }));
});

calendarioRouter.put("/", async (req, res) => {
  const filas = z
    .array(z.object({ impuesto: z.enum(IMPUESTOS), jurisdiccion: z.string().default("NACIONAL"), periodo, terminacionDesde: z.number().int().min(0).max(9), terminacionHasta: z.number().int().min(0).max(9), fecha: isoDate, fuente: z.string().optional() }))
    .parse(req.body);
  await prisma.$transaction(
    filas.map((f) =>
      prisma.calendarioFiscal.upsert({
        where: { impuesto_jurisdiccion_periodo_terminacionDesde_terminacionHasta: { impuesto: f.impuesto, jurisdiccion: f.jurisdiccion, periodo: f.periodo, terminacionDesde: f.terminacionDesde, terminacionHasta: f.terminacionHasta } },
        create: f,
        update: { fecha: f.fecha, fuente: f.fuente },
      }),
    ),
  );
  res.json({ cargadas: filas.length, sugerencia: "Ejecutar POST /vencimientos/generar para recalcular los pendientes" });
});
