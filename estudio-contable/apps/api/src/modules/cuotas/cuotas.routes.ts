import { Router } from "express";
import { z } from "zod";
import { aplicarResultadoDebito, parseISODate, puedeTransicionarCuota, type EstadoCuota } from "@estudio/shared";
import { prisma } from "../../lib/prisma.js";
import { HttpError, notFound } from "../../lib/http.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform(parseISODate);
const ESTADOS = ["VIGENTE", "DEBITADA", "RECHAZADA", "CAIDA", "IMPUTADA"] as const;

export const cuotasRouter = Router();

cuotasRouter.get("/", async (req, res) => {
  const q = z.object({ desde: isoDate.optional(), hasta: isoDate.optional(), estado: z.enum(ESTADOS).optional(), clienteId: z.string().optional(), planId: z.string().optional() }).parse(req.query);
  const rango = q.desde || q.hasta ? { gte: q.desde, lte: q.hasta } : undefined;
  res.json(
    await prisma.cuota.findMany({
      where: {
        estado: q.estado,
        planId: q.planId,
        ...(q.clienteId && { plan: { clienteId: q.clienteId } }),
        ...(rango && { OR: [{ fechaVencimiento: rango }, { fechaSegundoVencimiento: rango }] }),
      },
      include: { plan: { select: { id: true, tipo: true, entidad: true, numero: true, cliente: { select: { id: true, razonSocial: true } } } } },
      orderBy: { fechaVencimiento: "asc" },
    }),
  );
});

/**
 * Informar resultado de un intento de débito (manual o importado del
 * extracto bancario / "Mis Facilidades").
 */
cuotasRouter.post("/:id/debito", async (req, res) => {
  const body = z.object({ resultado: z.enum(["OK", "ERROR", "SIN_FONDOS"]), intento: z.union([z.literal(1), z.literal(2)]), fecha: isoDate.optional(), motivo: z.string().optional(), interesResarcitorio: z.number().min(0).optional() }).parse(req.body);
  const c = await prisma.cuota.findUnique({ where: { id: req.params.id } });
  if (!c) throw notFound("Cuota");
  const nuevo = aplicarResultadoDebito({ estado: c.estado, resultado: body.resultado, intento: body.intento, tieneSegundoVencimiento: !!c.fechaSegundoVencimiento });
  if (!puedeTransicionarCuota(c.estado, nuevo)) throw new HttpError(422, `Transición inválida ${c.estado} → ${nuevo}`, "TRANSICION_INVALIDA");
  res.json(
    await prisma.cuota.update({
      where: { id: c.id },
      data: {
        estado: nuevo,
        intentosDebito: { increment: 1 },
        ...(nuevo === "DEBITADA" ? { fechaDebito: body.fecha ?? new Date(), motivoRechazo: null } : { motivoRechazo: body.motivo ?? body.resultado }),
        interesResarcitorio: body.interesResarcitorio,
      },
    }),
  );
});

/** Cambio de estado manual (ej. imputar pago, regularizar cuota caída). */
cuotasRouter.patch("/:id/estado", async (req, res) => {
  const body = z.object({ estado: z.enum(ESTADOS), fecha: isoDate.optional(), motivo: z.string().optional() }).parse(req.body);
  const c = await prisma.cuota.findUnique({ where: { id: req.params.id } });
  if (!c) throw notFound("Cuota");
  if (!puedeTransicionarCuota(c.estado, body.estado as EstadoCuota)) throw new HttpError(422, `Transición inválida ${c.estado} → ${body.estado}`, "TRANSICION_INVALIDA");
  const [cuota] = await prisma.$transaction([
    prisma.cuota.update({
      where: { id: c.id },
      data: {
        estado: body.estado,
        ...(body.estado === "IMPUTADA" && { fechaImputacion: body.fecha ?? new Date() }),
        ...(body.estado === "DEBITADA" && { fechaDebito: body.fecha ?? new Date() }),
        ...(body.motivo && { motivoRechazo: body.motivo }),
      },
    }),
    prisma.eventoAuditoria.create({ data: { entidad: "Cuota", entidadId: c.id, accion: "CAMBIO_ESTADO", antes: { estado: c.estado }, despues: { estado: body.estado, motivo: body.motivo }, usuarioId: res.locals.usuarioId } }),
  ]);
  res.json(cuota);
});
