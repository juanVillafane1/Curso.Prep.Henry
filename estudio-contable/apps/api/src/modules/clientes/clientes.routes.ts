import { Router } from "express";
import { z } from "zod";
import { esCuitValido, esDniValido, impuestoHabilitado, limpiarDocumento, terminacionDocumento } from "@estudio/shared";
import { prisma } from "../../lib/prisma.js";
import { HttpError, notFound } from "../../lib/http.js";

const documento = z
  .string()
  .transform(limpiarDocumento)
  .refine((d) => esCuitValido(d) || esDniValido(d), "CUIT/DNI inválido");

const clienteBase = z.object({
  razonSocial: z.string().min(2),
  nombreFantasia: z.string().optional(),
  tipoPersona: z.enum(["FISICA", "JURIDICA"]).default("FISICA"),
  cuit: documento,
  condicionIva: z.enum(["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO", "EXENTO", "NO_ALCANZADO"]).default("RESPONSABLE_INSCRIPTO"),
  tieneEmpleados: z.boolean().default(false),
  esIvaDiferido: z.boolean().default(false),
  manejaContabilidadCompleta: z.boolean().default(false),
  email: z.string().email().optional(),
  telefonoWhatsapp: z.string().regex(/^\+\d{10,15}$/, "Formato E.164, ej. +5491122334455").optional(),
  aceptaNotificaciones: z.boolean().default(true),
  domicilioFiscal: z.string().optional(),
  jurisdiccionIibb: z.string().optional(),
  municipio: z.string().optional(),
  responsableId: z.string().optional(),
  notas: z.string().optional(),
});

const impuestoSchema = z.object({
  impuesto: z.enum(["IVA", "IIBB", "TASA_MUNICIPAL", "F931", "GANANCIAS", "BIENES_PERSONALES", "AUTONOMOS", "MONOTRIBUTO", "OTRO"]),
  jurisdiccion: z.string().default("NACIONAL"),
  periodicidad: z.enum(["MENSUAL", "BIMESTRAL", "TRIMESTRAL", "ANUAL"]).default("MENSUAL"),
  diaFijo: z.number().int().min(1).max(31).optional(),
});

export const clientesRouter = Router();

clientesRouter.get("/", async (req, res) => {
  const q = z
    .object({
      buscar: z.string().optional(),
      activo: z.enum(["true", "false"]).optional(),
      tieneEmpleados: z.enum(["true", "false"]).optional(),
      esIvaDiferido: z.enum(["true", "false"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    })
    .parse(req.query);
  const where = {
    ...(q.activo && { activo: q.activo === "true" }),
    ...(q.tieneEmpleados && { tieneEmpleados: q.tieneEmpleados === "true" }),
    ...(q.esIvaDiferido && { esIvaDiferido: q.esIvaDiferido === "true" }),
    ...(q.buscar && {
      OR: [
        { razonSocial: { contains: q.buscar, mode: "insensitive" as const } },
        { cuit: { contains: limpiarDocumento(q.buscar) || q.buscar } },
      ],
    }),
  };
  const [total, data] = await prisma.$transaction([
    prisma.cliente.count({ where }),
    prisma.cliente.findMany({ where, orderBy: { razonSocial: "asc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  res.json({ total, page: q.page, pageSize: q.pageSize, data });
});

clientesRouter.post("/", async (req, res) => {
  const body = clienteBase.parse(req.body);
  const cliente = await prisma.cliente.create({ data: { ...body, terminacionCuit: terminacionDocumento(body.cuit) } });
  res.status(201).json(cliente);
});

clientesRouter.get("/:id", async (req, res) => {
  const cliente = await prisma.cliente.findUnique({ where: { id: req.params.id }, include: { impuestos: true } });
  if (!cliente) throw notFound("Cliente");
  res.json(cliente);
});

clientesRouter.patch("/:id", async (req, res) => {
  const body = clienteBase.partial().parse(req.body);
  const cliente = await prisma.cliente.update({
    where: { id: req.params.id },
    data: { ...body, ...(body.cuit && { terminacionCuit: terminacionDocumento(body.cuit) }) },
  });
  // Si deja de tener empleados, se desactiva el F.931
  if (body.tieneEmpleados === false) {
    await prisma.clienteImpuesto.updateMany({ where: { clienteId: cliente.id, impuesto: "F931" }, data: { activo: false } });
  }
  res.json(cliente);
});

/** Baja lógica: preserva historial de vencimientos, cuotas y cheques. */
clientesRouter.delete("/:id", async (req, res) => {
  await prisma.cliente.update({ where: { id: req.params.id }, data: { activo: false } });
  res.status(204).end();
});

// ---- Obligaciones del cliente ----
clientesRouter.get("/:id/impuestos", async (req, res) => {
  res.json(await prisma.clienteImpuesto.findMany({ where: { clienteId: req.params.id } }));
});

clientesRouter.post("/:id/impuestos", async (req, res) => {
  const body = impuestoSchema.parse(req.body);
  const cliente = await prisma.cliente.findUnique({ where: { id: req.params.id } });
  if (!cliente) throw notFound("Cliente");
  if (!impuestoHabilitado(body.impuesto, cliente)) {
    throw new HttpError(422, "El cliente no tiene empleados: no corresponde F.931", "F931_SIN_EMPLEADOS");
  }
  const row = await prisma.clienteImpuesto.upsert({
    where: { clienteId_impuesto_jurisdiccion: { clienteId: cliente.id, impuesto: body.impuesto, jurisdiccion: body.jurisdiccion } },
    create: { ...body, clienteId: cliente.id },
    update: { ...body, activo: true },
  });
  res.status(201).json(row);
});

clientesRouter.delete("/:id/impuestos/:impuestoId", async (req, res) => {
  await prisma.clienteImpuesto.update({ where: { id: req.params.impuestoId }, data: { activo: false } });
  res.status(204).end();
});

/** Ficha 360°: todo lo pendiente del cliente (útil para la atención). */
clientesRouter.get("/:id/resumen", async (req, res) => {
  const id = req.params.id;
  const [vencimientos, cuotas, cheques] = await Promise.all([
    prisma.vencimientoFiscal.findMany({
      where: { clienteId: id, estado: { in: ["PENDIENTE", "PRESENTADO_PENDIENTE_PAGO", "VENCIDO"] } },
      orderBy: { fechaVencimiento: "asc" },
    }),
    prisma.cuota.findMany({
      where: { plan: { clienteId: id }, estado: { in: ["VIGENTE", "RECHAZADA", "CAIDA"] } },
      include: { plan: { select: { tipo: true, entidad: true, numero: true } } },
      orderBy: { fechaVencimiento: "asc" },
      take: 50,
    }),
    prisma.cheque.findMany({
      where: { OR: [{ clienteEmisorId: id }, { clienteReceptorId: id }], estado: { in: ["EN_CARTERA", "DEPOSITADO"] } },
      orderBy: { fechaPago: "asc" },
    }),
  ]);
  res.json({ vencimientos, cuotas, cheques });
});
