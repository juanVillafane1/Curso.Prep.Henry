import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { ReglaNegocioError } from "@estudio/shared";
import { HttpError } from "../lib/http.js";
import { logger } from "../lib/logger.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "VALIDACION", detalles: err.flatten() });
    return;
  }
  if (err instanceof ReglaNegocioError) {
    res.status(422).json({ error: err.codigo, mensaje: err.message });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.codigo ?? "ERROR", mensaje: err.message });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "DUPLICADO", mensaje: "Ya existe un registro con esos datos", campos: err.meta?.target });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: "NOT_FOUND", mensaje: "Registro no encontrado" });
      return;
    }
  }
  if (err instanceof Error && /Transición|Solo se|Debe indicar/.test(err.message)) {
    res.status(422).json({ error: "REGLA_NEGOCIO", mensaje: err.message });
    return;
  }
  logger.error({ err }, "Error no controlado");
  res.status(500).json({ error: "INTERNO", mensaje: "Error interno del servidor" });
};
