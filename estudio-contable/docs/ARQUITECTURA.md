# Arquitectura

```
estudio-contable/
├── apps/
│   ├── api/                      Express 5 + Prisma (PostgreSQL)
│   │   ├── prisma/
│   │   │   ├── schema.prisma     Modelo de datos
│   │   │   ├── migrations/       Migraciones SQL versionadas
│   │   │   └── seed.ts           Feriados, categorías, clientes demo
│   │   └── src/
│   │       ├── config/env.ts     Variables de entorno validadas (Zod)
│   │       ├── lib/              prisma, logger, calendario hábil, errores HTTP
│   │       ├── middleware/       Manejo uniforme de errores
│   │       ├── modules/          Un router por agregado (clientes, vencimientos, planes, cuotas, cheques, adjuntos, dashboard)
│   │       ├── integrations/     WhatsApp (driver console | Meta Cloud API)
│   │       ├── jobs/             Tareas programadas + worker.ts (proceso separado)
│   │       ├── app.ts            Composición de la app
│   │       └── server.ts         Entry point HTTP
│   └── web/                      Next.js 15 (App Router)
│       ├── app/                  Dashboard, clientes, vencimientos, cheques
│       ├── components/           Dashboard (vista diaria/semanal)
│       └── lib/api.ts            Cliente HTTP tipado
├── packages/
│   └── shared/                   Lógica de dominio PURA (sin I/O) + tests
│       └── src/                  fechas, cuit, vencimientos, cuotas, cheques, dashboard, recordatorios
├── docs/
├── docker-compose.yml            PostgreSQL 16
└── .env.example
```

## Decisiones

1. **Dominio puro en `packages/shared`.** Todas las reglas (escalonamiento por CUIT, IVA diferido, doble vencimiento, máquina de estados de cheques, consolidación semanal) son funciones puras testeadas sin base de datos, compartidas por API y frontend. Los routers solo orquestan: leen, aplican la regla, persisten.
2. **Fechas civiles.** Los vencimientos se guardan como `DATE` (sin hora) y se manejan a medianoche UTC para evitar corrimientos de zona horaria.
3. **Calendario en dos capas.** (a) Regla por defecto por terminación de CUIT en código; (b) tabla `calendario_fiscal` con el cronograma oficial / prórrogas generales, que tiene prioridad; (c) override por vencimiento individual (`es_override_manual` + motivo + auditoría). Regenerar la agenda nunca pisa overrides ni vencimientos ya presentados.
4. **Días hábiles.** Fechas que caen en fin de semana o feriado (`feriados`) se trasladan al día hábil siguiente.
5. **Worker separado.** `npm run dev:worker` corre los cron (`node-cron`, TZ Buenos Aires). Los envíos son idempotentes (`notificaciones.clave_idempotencia` única), por lo que re-ejecutar un job no duplica mensajes. Para múltiples réplicas, migrar a BullMQ/pg-boss o agregar advisory lock.
6. **WhatsApp.** Meta Cloud API con plantilla aprobada (requisito para mensajes iniciados por la empresa). En desarrollo, `WHATSAPP_DRIVER=console`.
7. **Auditoría.** Overrides de fechas y cambios manuales de estado se registran en `eventos_auditoria`; cada cheque tiene su historial en `movimientos_cheque`.

## Tareas programadas

| Job | Cron default | Qué hace |
|---|---|---|
| `marcar-vencidos` | 00:30 diario | `PENDIENTE` con fecha pasada → `VENCIDO` |
| `cuotas-doble-vencimiento` | 07:00 diario | Sin débito tras el 1º venc. → `RECHAZADA`; tras el 2º → `CAIDA`; caducidad del plan si supera N caídas |
| `recordatorios-whatsapp` | 09:00 lun-vie | Avisos 3 y 2 días antes (presentación, pago de IVA diferido, cuotas) |
| `resumen-semanal` | 08:00 lunes | Snapshot de compromisos de los próximos 7 días |

## Próximos pasos sugeridos

- Autenticación (JWT + roles `ADMIN/CONTADOR/ADMINISTRATIVO`) – el hook `res.locals.usuarioId` ya está previsto.
- Webhook de estados de WhatsApp (entregado/leído) → `notificaciones.estado`.
- Importación de cronograma ARCA (CSV) y de extractos bancarios para conciliar débitos automáticamente.
- Almacenamiento de adjuntos en S3/GCS (misma `storage_key`).
- Formularios de alta/edición en el frontend y ficha 360° del cliente.
