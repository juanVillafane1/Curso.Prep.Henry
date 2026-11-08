import { Router } from "express";
import { z } from "zod";
import { alertaCheque, calcularFechasCheque, parseISODate, puedeImputarCategoria, transicionesPermitidas, validarTransicionCheque } from "@estudio/shared";
import { prisma } from "../../lib/prisma.js";
import { HttpError, notFound } from "../../lib/http.js";
import { env } from "../../config/env.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform(parseISODate);
const ESTADOS = ["EN_CARTERA", "DEPOSITADO", "ENDOSADO", "COBRADO", "RECHAZADO", "ANULADO"] as const;

const chequeSchema = z
  .object({
    tipo: z.enum(["FISICO", "ECHEQ"]),
    direccion: z.enum(["RECIBIDO", "EMITIDO"]),
    numero: z.string().min(1),
    banco: z.string().min(2),
    sucursal: z.string().optional(),
    cuitLibrador: z.string().optional(),
    librador: z.string().optional(),
    importe: z.number().positive(),
    echeqId: z.string().optional(),
    fechaEmision: isoDate,
    fechaPago: isoDate.optional(),
    fechaLimiteDeposito: isoDate.optional(), // si no se informa: vencimiento legal
    clienteEmisorId: z.string().optional(),
    clienteReceptorId: z.string().optional(),
    proveedorEntregadoId: z.string().optional(),
    categoriaGastoId: z.string().optional(),
    observaciones: z.string().optional(),
  })
  .refine((c) => c.clienteEmisorId || c.clienteReceptorId, "Debe indicar cliente emisor o receptor")
  .refine((c) => !c.fechaPago || c.fechaPago >= c.fechaEmision, "La fecha de pago no puede ser anterior a la emisión");

async function validarCategoria(clienteId: string | undefined, categoriaGastoId: string | undefined) {
  if (!categoriaGastoId) return;
  const cliente = clienteId ? await prisma.cliente.findUnique({ where: { id: clienteId } }) : null;
  if (!cliente || !puedeImputarCategoria(cliente)) {
    throw new HttpError(422, "La imputación de categorías de gasto solo está disponible para clientes con contabilidad completa", "CATEGORIA_NO_HABILITADA");
  }
}

export const chequesRouter = Router();

chequesRouter.get("/", async (req, res) => {
  const q = z
    .object({ estado: z.enum(ESTADOS).optional(), direccion: z.enum(["RECIBIDO", "EMITIDO"]).optional(), tipo: z.enum(["FISICO", "ECHEQ"]).optional(), clienteId: z.string().optional(), desde: isoDate.optional(), hasta: isoDate.optional() })
    .parse(req.query);
  const cheques = await prisma.cheque.findMany({
    where: {
      estado: q.estado,
      direccion: q.direccion,
      tipo: q.tipo,
      ...(q.clienteId && { OR: [{ clienteEmisorId: q.clienteId }, { clienteReceptorId: q.clienteId }] }),
      ...((q.desde || q.hasta) && { fechaPago: { gte: q.desde, lte: q.hasta } }),
    },
    include: { clienteEmisor: { select: { id: true, razonSocial: true } }, clienteReceptor: { select: { id: true, razonSocial: true } }, proveedorEntregado: true, categoriaGasto: true },
    orderBy: [{ fechaPago: "asc" }, { fechaEmision: "asc" }],
  });
  const hoy = new Date();
  res.json(cheques.map((c) => ({ ...c, alerta: alertaCheque({ estado: c.estado, direccion: c.direccion, hoy, fechaPago: c.fechaPago, fechaLimiteDeposito: c.fechaLimiteDeposito }) })));
});

chequesRouter.post("/", async (req, res) => {
  const body = chequeSchema.parse(req.body);
  const clienteContable = body.direccion === "EMITIDO" ? body.clienteEmisorId : body.clienteReceptorId;
  await validarCategoria(clienteContable, body.categoriaGastoId);
  const fechas = calcularFechasCheque({ fechaEmision: body.fechaEmision, fechaPago: body.fechaPago, diasValidez: env.CHEQUE_DIAS_VALIDEZ });
  const cheque = await prisma.cheque.create({
    data: {
      ...body,
      esDiferido: !!body.fechaPago && body.fechaPago > body.fechaEmision,
      fechaVencimientoLegal: fechas.fechaVencimientoLegal,
      fechaLimiteDeposito: body.fechaLimiteDeposito ?? fechas.fechaLimiteDeposito,
      movimientos: { create: { estadoHasta: "EN_CARTERA", detalle: "Alta" } },
    },
  });
  res.status(201).json(cheque);
});

chequesRouter.get("/:id", async (req, res) => {
  const c = await prisma.cheque.findUnique({ where: { id: req.params.id }, include: { movimientos: { orderBy: { fecha: "asc" } }, adjuntos: true, proveedorEntregado: true, categoriaGasto: true } });
  if (!c) throw notFound("Cheque");
  res.json({ ...c, transicionesPermitidas: transicionesPermitidas(c.estado) });
});

chequesRouter.patch("/:id", async (req, res) => {
  const body = z.object({ fechaLimiteDeposito: isoDate.optional(), categoriaGastoId: z.string().nullable().optional(), observaciones: z.string().optional() }).parse(req.body);
  const c = await prisma.cheque.findUnique({ where: { id: req.params.id } });
  if (!c) throw notFound("Cheque");
  if (body.categoriaGastoId) await validarCategoria((c.direccion === "EMITIDO" ? c.clienteEmisorId : c.clienteReceptorId) ?? undefined, body.categoriaGastoId);
  res.json(await prisma.cheque.update({ where: { id: c.id }, data: body }));
});

/** Transición de estado: En Cartera → Depositado / Endosado / Cobrado / Rechazado. */
chequesRouter.post("/:id/estado", async (req, res) => {
  const body = z.object({ estado: z.enum(ESTADOS), fecha: isoDate.optional(), proveedorEntregadoId: z.string().optional(), motivo: z.string().optional() }).parse(req.body);
  const c = await prisma.cheque.findUnique({ where: { id: req.params.id } });
  if (!c) throw notFound("Cheque");
  validarTransicionCheque({ desde: c.estado, hacia: body.estado, direccion: c.direccion, proveedorEndoso: body.proveedorEntregadoId ?? c.proveedorEntregadoId });
  const fecha = body.fecha ?? new Date();
  const extra = {
    DEPOSITADO: { fechaDeposito: fecha },
    ENDOSADO: { fechaEndoso: fecha, proveedorEntregadoId: body.proveedorEntregadoId ?? c.proveedorEntregadoId },
    COBRADO: { fechaAcreditacion: fecha },
    RECHAZADO: { fechaRechazo: fecha, motivoRechazo: body.motivo },
    EN_CARTERA: {},
    ANULADO: {},
  }[body.estado];
  const [cheque] = await prisma.$transaction([
    prisma.cheque.update({ where: { id: c.id }, data: { estado: body.estado, ...extra } }),
    prisma.movimientoCheque.create({ data: { chequeId: c.id, estadoDesde: c.estado, estadoHasta: body.estado, detalle: body.motivo, usuarioId: res.locals.usuarioId } }),
  ]);
  res.json(cheque);
});

// ---- Catálogos auxiliares ----
export const proveedoresRouter = Router();
proveedoresRouter.get("/", async (req, res) => {
  const { clienteId } = z.object({ clienteId: z.string() }).parse(req.query);
  res.json(await prisma.proveedor.findMany({ where: { clienteId }, orderBy: { nombre: "asc" } }));
});
proveedoresRouter.post("/", async (req, res) => {
  const body = z.object({ clienteId: z.string(), nombre: z.string().min(2), cuit: z.string().optional() }).parse(req.body);
  res.status(201).json(await prisma.proveedor.create({ data: body }));
});

export const categoriasRouter = Router();
categoriasRouter.get("/", async (req, res) => {
  const { clienteId } = z.object({ clienteId: z.string().optional() }).parse(req.query);
  res.json(await prisma.categoriaGasto.findMany({ where: { activo: true, OR: [{ clienteId: null }, ...(clienteId ? [{ clienteId }] : [])] }, orderBy: { nombre: "asc" } }));
});
categoriasRouter.post("/", async (req, res) => {
  const body = z.object({ clienteId: z.string().optional(), nombre: z.string().min(2), cuentaContable: z.string().optional() }).parse(req.body);
  if (body.clienteId) await validarCategoria(body.clienteId, "_");
  res.status(201).json(await prisma.categoriaGasto.create({ data: body }));
});
