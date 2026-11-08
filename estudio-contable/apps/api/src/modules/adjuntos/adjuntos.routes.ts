import { Router } from "express";
import multer from "multer";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, notFound } from "../../lib/http.js";
import { env } from "../../config/env.js";

const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, MIME_PERMITIDOS.includes(file.mimetype)),
});

const metaSchema = z
  .object({
    tipo: z.enum(["VEP", "COMPROBANTE_PAGO", "ACUSE_DJ", "CONSTANCIA_PLAN", "IMAGEN_CHEQUE", "OTRO"]),
    vencimientoId: z.string().optional(),
    planId: z.string().optional(),
    cuotaId: z.string().optional(),
    chequeId: z.string().optional(),
  })
  .refine((m) => [m.vencimientoId, m.planId, m.cuotaId, m.chequeId].filter(Boolean).length === 1, "Debe asociarse a exactamente una entidad");

export const adjuntosRouter = Router();

/**
 * multipart/form-data: archivo + tipo + (vencimientoId | planId | cuotaId | chequeId)
 * Almacenamiento local en UPLOADS_DIR (reemplazable por S3/GCS con la misma storageKey).
 */
adjuntosRouter.post("/", upload.single("archivo"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Archivo requerido (PDF/JPG/PNG/WEBP, máx. 10MB)", "ARCHIVO_REQUERIDO");
  const meta = metaSchema.parse(req.body);
  const storageKey = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}${path.extname(req.file.originalname)}`;
  const destino = path.resolve(env.UPLOADS_DIR, storageKey);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, req.file.buffer);
  const adjunto = await prisma.adjunto.create({
    data: {
      ...meta,
      nombreArchivo: req.file.originalname,
      mimeType: req.file.mimetype,
      tamanioBytes: req.file.size,
      storageKey,
      sha256: createHash("sha256").update(req.file.buffer).digest("hex"),
      subidoPorId: res.locals.usuarioId,
    },
  });
  res.status(201).json(adjunto);
});

adjuntosRouter.get("/:id/descargar", async (req, res) => {
  const a = await prisma.adjunto.findUnique({ where: { id: req.params.id } });
  if (!a) throw notFound("Adjunto");
  res.setHeader("Content-Type", a.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(a.nombreArchivo)}"`);
  res.send(await readFile(path.resolve(env.UPLOADS_DIR, a.storageKey)));
});

adjuntosRouter.delete("/:id", async (req, res) => {
  await prisma.adjunto.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
