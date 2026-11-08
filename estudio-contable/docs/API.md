# API REST – v1

Base: `http://localhost:4000/api/v1` · JSON · fechas civiles `YYYY-MM-DD` · importes en ARS (decimal).

Errores con forma uniforme:

| HTTP | `error` | Cuándo |
|---|---|---|
| 400 | `VALIDACION` | Body/query inválido (Zod) |
| 404 | `NOT_FOUND` | Recurso inexistente |
| 409 | `DUPLICADO` | Violación de unicidad (CUIT repetido, cheque repetido…) |
| 422 | `COMPROBANTE_REQUERIDO`, `F931_SIN_EMPLEADOS`, `CATEGORIA_NO_HABILITADA`, `TRANSICION_INVALIDA`, `REGLA_NEGOCIO`… | Regla de negocio violada |

## Clientes

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/clientes?buscar=&activo=&tieneEmpleados=&esIvaDiferido=&page=&pageSize=` | Listado paginado; `buscar` matchea razón social o CUIT |
| POST | `/clientes` | Alta. Valida CUIT (dígito verificador) o DNI; calcula `terminacionCuit` |
| GET | `/clientes/:id` | Detalle + obligaciones |
| PATCH | `/clientes/:id` | Edición. Si `tieneEmpleados=false` desactiva el F.931 |
| DELETE | `/clientes/:id` | Baja lógica |
| GET | `/clientes/:id/resumen` | Ficha 360°: vencimientos abiertos, cuotas impagas, cheques en curso |
| GET/POST | `/clientes/:id/impuestos` | Obligaciones periódicas (IVA, IIBB+jurisdicción, Tasa municipal, F931…). F931 rechazado si no tiene empleados |
| DELETE | `/clientes/:id/impuestos/:impuestoId` | Desactiva una obligación |

## Vencimientos fiscales

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/vencimientos?desde=&hasta=&clienteId=&impuesto=&estado=&periodo=` | Agenda filtrable |
| POST | `/vencimientos/generar` `{periodo, clienteId?}` | Genera (idempotente) la agenda del período por terminación de CUIT; recalcula pendientes sin override |
| POST | `/vencimientos` | Alta manual (obligaciones anuales/eventuales) |
| GET | `/vencimientos/:id` | Detalle + adjuntos + notificaciones |
| PATCH | `/vencimientos/:id/fecha` `{fechaVencimiento, fechaVencimientoPago?, motivo}` | **Override manual** (reprogramación ARCA). Auditado |
| DELETE | `/vencimientos/:id/fecha` | Revierte el override a la fecha calculada |
| POST | `/vencimientos/:id/presentacion` `{monto, saldoAFavor?, numeroVep?}` | `monto=0` → `FINALIZADO`; `monto>0` → `PRESENTADO_PENDIENTE_PAGO` |
| POST | `/vencimientos/:id/finalizar` `{fechaPago?}` | Cierra; **exige adjunto `VEP`/`COMPROBANTE_PAGO` si monto>0** |
| POST | `/vencimientos/:id/anular` `{motivo}` | Anula |
| GET | `/calendario-fiscal?periodo=&impuesto=` | Cronograma oficial cargado |
| PUT | `/calendario-fiscal` `[{impuesto, jurisdiccion, periodo, terminacionDesde, terminacionHasta, fecha, fuente}]` | Carga masiva del cronograma ARCA / prórrogas generales |

## Planes de pago y créditos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/planes?clienteId=&tipo=&estado=` | Listado |
| POST | `/planes` | Alta + **genera cuotas**. `PLAN_ARCA` → doble vencimiento (X y X+`diasReintento`, default 10). Préstamo con `tasaMensual` → sistema francés |
| GET | `/planes/:id` | Detalle con cronograma |
| PATCH | `/planes/:id` | Estado (`VIGENTE/CADUCO/CANCELADO/FINALIZADO`), CBU |
| GET | `/cuotas?desde=&hasta=&estado=&clienteId=&planId=` | Cuotas (rango contra 1º o 2º vencimiento) |
| POST | `/cuotas/:id/debito` `{resultado: OK\|ERROR\|SIN_FONDOS, intento: 1\|2, motivo?, interesResarcitorio?}` | Informa resultado del débito → `DEBITADA` / `RECHAZADA` / `CAIDA` |
| PATCH | `/cuotas/:id/estado` `{estado, fecha?, motivo?}` | Cambio manual validado (ej. `IMPUTADA`). Auditado |

## Cheques (físicos y ECHEQ)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/cheques?estado=&direccion=&tipo=&clienteId=&desde=&hasta=` | Incluye `alerta`. Recibidos: `OK`, `NO_DEPOSITABLE_AUN`, `PROXIMO_A_VENCER`, `VENCIDO_LEGAL`. Emitidos: `OK`, `DEBITO_PROXIMO`, `DEBITO_VENCIDO` |
| POST | `/cheques` | Alta. Calcula `fechaVencimientoLegal` (+30 días de la fecha de pago o emisión) y `fechaLimiteDeposito` |
| GET | `/cheques/:id` | Detalle + historial de movimientos + `transicionesPermitidas` |
| PATCH | `/cheques/:id` | Límite de depósito, categoría de gasto (solo contabilidad completa), observaciones |
| POST | `/cheques/:id/estado` `{estado, fecha?, proveedorEntregadoId?, motivo?}` | `EN_CARTERA → DEPOSITADO / ENDOSADO / COBRADO / RECHAZADO`. Endoso exige proveedor |
| GET/POST | `/proveedores?clienteId=` | Proveedores del cliente (destino de endosos / pagos) |
| GET/POST | `/categorias-gasto?clienteId=` | Categorías globales + propias del cliente |

## Adjuntos

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/adjuntos` (multipart: `archivo`, `tipo`, uno de `vencimientoId/planId/cuotaId/chequeId`) | PDF/JPG/PNG/WEBP ≤ 10MB, guarda SHA-256 |
| GET | `/adjuntos/:id/descargar` | Descarga |
| DELETE | `/adjuntos/:id` | Elimina |

## Dashboard y cash flow

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/dashboard?vista=diaria\|semanal&fecha=&clienteId=` | Compromisos del día o semana (lun-dom) + totales por origen + alertas |
| GET | `/dashboard/resumen-semanal?semana=` | Snapshot del lunes (lo genera si no existe) |
| POST | `/dashboard/resumen-semanal/regenerar` | Regenera snapshot |
| GET | `/dashboard/cash-flow?desde=&hasta=&clienteId=` | Egresos/ingresos proyectados por día (default 30 días) |

## Jobs (soporte)

`POST /jobs/recordatorios`, `POST /jobs/cuotas`, `POST /jobs/vencidos` con `{fecha?}` para ejecutar manualmente (simular una fecha).
