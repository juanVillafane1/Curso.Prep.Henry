import { Router } from "express";
import { z } from "zod";
import { generarCuotas, parseISODate } from "@estudio/shared";
import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http.js";
import { calendarioHabil } from "../../lib/calendario.js";
import { env } from "../../config/env.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform(parseISODate);
const TIPOS = ["PLAN_ARCA", "PLAN_PROVINCIAL", "PLAN_MUNICIPAL", "PRESTAMO_BANCARIO"] as const;

const planSchema = z.object({
  clienteId: z.string(),
  tipo: z.enum(TIPOS),
  numero: z.string().optional(),
  entidad: z.string(),
  descripcion: z.string().optional(),
  obligacionesIncluidas: z.string().optional(),
  montoTotal: z.number().positive(),
  tasaMensual: z.number().min(0).optional(),
  cantidadCuotas: z.number().int().min(1).max(360),
  importeCuota: z.number().positive().optional(), // si el plan ya informa cuota fija
  fechaAlta: isoDate,
  fechaPrimerVencimiento: isoDate,
  diasReintento: z.number().int().min(1).max(31).optional(),
  cbuDebito: z.string().regex(/^\d{22}$/).optional(),
  cuotasCaidasCaducidad: z.number().int().min(1).optional(),
});

export const planesRouter = Router();

planesRouter.get("/", async (req, res) => {
  const q = z.object({ clienteId: z.string().optional(), tipo: z.enum(TIPOS).optional(), estado: z.enum(["VIGENTE", "CADUCO", "CANCELADO", "FINALIZADO"]).optional() }).parse(req.query);
  res.json(
    await prisma.planCredito.findMany({
      where: q,
      include: { cliente: { select: { id: true, razonSocial: true } }, _count: { select: { cuotas: true } } },
      orderBy: { fechaAlta: "desc" },
    }),
  );
});

/** Alta de plan/préstamo + generación automática del cronograma de cuotas. */
planesRouter.post("/", async (req, res) => {
  const { importeCuota, ...body } = planSchema.parse(req.body);
  const esArca = body.tipo === "PLAN_ARCA";
  const diasReintento = esArca ? body.diasReintento ?? env.ARCA_DIAS_REINTENTO_DEBITO : null;
  const cuotas = generarCuotas({
    tipo: body.tipo,
    cantidadCuotas: body.cantidadCuotas,
    fechaPrimerVencimiento: body.fechaPrimerVencimiento,
    montoTotal: body.montoTotal,
    importeCuota,
    tasaMensual: body.tasaMensual,
    diasReintento: diasReintento ?? undefined,
    calendario: await calendarioHabil(),
  });
  const plan = await prisma.planCredito.create({
    data: {
      ...body,
      diasReintento,
      diaDebito: body.fechaPrimerVencimiento.getUTCDate(),
      cuotas: { create: cuotas },
    },
    include: { cuotas: { orderBy: { numero: "asc" } } },
  });
  res.status(201).json(plan);
});

planesRouter.get("/:id", async (req, res) => {
  const plan = await prisma.planCredito.findUnique({
    where: { id: req.params.id },
    include: { cliente: true, cuotas: { orderBy: { numero: "asc" } }, adjuntos: true },
  });
  if (!plan) throw notFound("Plan");
  res.json(plan);
});

planesRouter.patch("/:id", async (req, res) => {
  const body = z.object({ estado: z.enum(["VIGENTE", "CADUCO", "CANCELADO", "FINALIZADO"]).optional(), descripcion: z.string().optional(), cbuDebito: z.string().optional() }).parse(req.body);
  res.json(await prisma.planCredito.update({ where: { id: req.params.id }, data: body }));
});
