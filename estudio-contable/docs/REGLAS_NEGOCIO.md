# Reglas de negocio implementadas

Ubicación del código entre paréntesis (`packages/shared/src/...`).

## Clientes
- CUIT validado por dígito verificador; DNI de 7-8 dígitos (`cuit.ts`).
- `tiene_empleados = false` → no se puede asignar F.931 y se desactiva si ya estaba (`impuestoHabilitado`).
- `es_iva_diferido = true` → el **pago** del IVA vence `IVA_DIFERIDO_MESES` (default **3**) meses después de la fecha de presentación, trasladado a día hábil (`calcularVencimientoPago`).
  > Nota: el régimen PyME (Ley 27.264) difiere el ingreso al vencimiento del 2º mes siguiente; el valor es parametrizable si el estudio quiere alinearse a la norma.
- `maneja_contabilidad_completa = true` → habilita imputar categorías de gasto en cheques.

## Vencimientos fiscales
- Fecha = regla por terminación de CUIT (IVA, F931, IIBB CM, Tasa municipal) o día fijo de la obligación, trasladada a día hábil (`vencimientos.ts`).
- Prioridad: override individual > `calendario_fiscal` oficial > regla default.
- Presentación: monto **$0 → FINALIZADO** sin comprobante; **monto > $0 → PRESENTADO_PENDIENTE_PAGO**, y para finalizar se exige adjunto `VEP` o `COMPROBANTE_PAGO` (`estadoTrasPresentacion`, `validarCierre`).
- Estados: `PENDIENTE → PRESENTADO_PENDIENTE_PAGO → FINALIZADO`, `PENDIENTE → VENCIDO`, `* → ANULADO`.

## Planes de pago / créditos
- `PLAN_ARCA`: cada cuota tiene 1º vencimiento (día X) y 2º (X + `ARCA_DIAS_REINTENTO_DEBITO`, default 10) (`generarCuotas`).
- Sin débito en el 1º → `RECHAZADA`; sin débito en ninguno → `CAIDA` (`evaluarEstadoCuota`, `aplicarResultadoDebito`).
- Estados: `VIGENTE`, `DEBITADA`, `RECHAZADA` (debitada con error), `CAIDA`, `IMPUTADA`; transiciones validadas (`puedeTransicionarCuota`).
- Plan pasa a `CADUCO` al alcanzar `cuotas_caidas_caducidad`.

## Cheques
- `fecha_vencimiento_legal` = fecha de pago (o emisión si no es diferido) + `CHEQUE_DIAS_VALIDEZ` (30) días (Ley 24.452).
- `fecha_limite_deposito` = vencimiento legal salvo que se indique un límite operativo menor.
- Flujo: `EN_CARTERA → DEPOSITADO | ENDOSADO | COBRADO | RECHAZADO | ANULADO`; `DEPOSITADO → COBRADO | RECHAZADO`; `ENDOSADO → RECHAZADO`; `RECHAZADO → EN_CARTERA` (re-presentación). Endoso exige proveedor; solo se depositan/endosan cheques recibidos (`cheques.ts`).

## Dashboard
- Vista diaria = un día; vista semanal = lunes a domingo de la fecha elegida.
- Compromisos consolidados: presentaciones pendientes, pagos de DJ presentadas (incluye IVA diferido), cuotas vigentes (o en 2º vencimiento si fueron rechazadas), cheques emitidos a debitar y cheques en cartera a depositar (ingreso).
- Cada lunes se persiste el resumen de los 7 días siguientes (`resumenes_semanales`).

## Recordatorios WhatsApp
- 3 y 2 días antes (`RECORDATORIO_DIAS_ANTES`), solo clientes activos con `acepta_notificaciones` y teléfono E.164.
- Una clave de idempotencia por aviso/día evita duplicados.
