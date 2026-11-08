import express, { Router } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error.js";
import { clientesRouter } from "./modules/clientes/clientes.routes.js";
import { calendarioRouter, vencimientosRouter } from "./modules/vencimientos/vencimientos.routes.js";
import { planesRouter } from "./modules/planes/planes.routes.js";
import { cuotasRouter } from "./modules/cuotas/cuotas.routes.js";
import { categoriasRouter, chequesRouter, proveedoresRouter } from "./modules/cheques/cheques.routes.js";
import { adjuntosRouter } from "./modules/adjuntos/adjuntos.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { jobsRouter } from "./modules/jobs.routes.js";

export function crearApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(","), credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // TODO(auth): middleware JWT que setee res.locals.usuarioId y valide rol
  const v1 = Router();
  v1.use("/clientes", clientesRouter);
  v1.use("/vencimientos", vencimientosRouter);
  v1.use("/calendario-fiscal", calendarioRouter);
  v1.use("/planes", planesRouter);
  v1.use("/cuotas", cuotasRouter);
  v1.use("/cheques", chequesRouter);
  v1.use("/proveedores", proveedoresRouter);
  v1.use("/categorias-gasto", categoriasRouter);
  v1.use("/adjuntos", adjuntosRouter);
  v1.use("/dashboard", dashboardRouter);
  v1.use("/jobs", jobsRouter);
  app.use("/api/v1", v1);

  app.use(errorHandler);
  return app;
}
