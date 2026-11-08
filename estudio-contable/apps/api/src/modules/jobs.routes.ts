import { Router } from "express";
import { z } from "zod";
import { parseISODate } from "@estudio/shared";
import { enviarRecordatorios } from "../jobs/recordatorios.job.js";
import { procesarCuotasVencidas } from "../jobs/cuotas.job.js";
import { marcarVencidos } from "../jobs/vencidos.job.js";

/** Ejecución manual de jobs (soporte / pruebas). Proteger con rol ADMIN. */
export const jobsRouter = Router();
const body = z.object({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform(parseISODate).optional() });

jobsRouter.post("/recordatorios", async (req, res) => res.json(await enviarRecordatorios(body.parse(req.body ?? {}).fecha)));
jobsRouter.post("/cuotas", async (req, res) => res.json(await procesarCuotasVencidas(body.parse(req.body ?? {}).fecha)));
jobsRouter.post("/vencidos", async (req, res) => res.json({ marcados: await marcarVencidos(body.parse(req.body ?? {}).fecha) }));
