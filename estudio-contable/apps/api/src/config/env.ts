import { z } from "zod";

const lista = (s: string) => s.split(",").map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  UPLOADS_DIR: z.string().default("./uploads"),

  IVA_DIFERIDO_MESES: z.coerce.number().int().min(0).default(3),
  RECORDATORIO_DIAS_ANTES: z.string().default("3,2").transform(lista),
  ARCA_DIAS_REINTENTO_DEBITO: z.coerce.number().int().default(10),
  CHEQUE_DIAS_VALIDEZ: z.coerce.number().int().default(30),

  WHATSAPP_DRIVER: z.enum(["console", "meta"]).default("console"),
  WHATSAPP_API_VERSION: z.string().default("v21.0"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_TEMPLATE_RECORDATORIO: z.string().default("recordatorio_vencimiento"),
  WHATSAPP_TEMPLATE_LANG: z.string().default("es_AR"),

  CRON_RECORDATORIOS: z.string().default("0 9 * * 1-5"),
  CRON_CUOTAS_DEBITO: z.string().default("0 7 * * *"),
  CRON_RESUMEN_SEMANAL: z.string().default("0 8 * * 1"),
  CRON_MARCAR_VENCIDOS: z.string().default("30 0 * * *"),
  TZ: z.string().default("America/Argentina/Buenos_Aires"),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
