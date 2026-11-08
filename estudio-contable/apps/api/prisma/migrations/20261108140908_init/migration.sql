-- CreateEnum
CREATE TYPE "TipoPersona" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "CondicionIva" AS ENUM ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', 'NO_ALCANZADO');

-- CreateEnum
CREATE TYPE "TipoImpuesto" AS ENUM ('IVA', 'IIBB', 'TASA_MUNICIPAL', 'F931', 'GANANCIAS', 'BIENES_PERSONALES', 'AUTONOMOS', 'MONOTRIBUTO', 'OTRO');

-- CreateEnum
CREATE TYPE "Periodicidad" AS ENUM ('MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "EstadoVencimiento" AS ENUM ('PENDIENTE', 'PRESENTADO_PENDIENTE_PAGO', 'FINALIZADO', 'VENCIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "TipoPlan" AS ENUM ('PLAN_ARCA', 'PLAN_PROVINCIAL', 'PLAN_MUNICIPAL', 'PRESTAMO_BANCARIO');

-- CreateEnum
CREATE TYPE "EstadoPlan" AS ENUM ('VIGENTE', 'CADUCO', 'CANCELADO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "EstadoCuota" AS ENUM ('VIGENTE', 'DEBITADA', 'RECHAZADA', 'CAIDA', 'IMPUTADA');

-- CreateEnum
CREATE TYPE "TipoCheque" AS ENUM ('FISICO', 'ECHEQ');

-- CreateEnum
CREATE TYPE "DireccionCheque" AS ENUM ('RECIBIDO', 'EMITIDO');

-- CreateEnum
CREATE TYPE "EstadoCheque" AS ENUM ('EN_CARTERA', 'DEPOSITADO', 'ENDOSADO', 'COBRADO', 'RECHAZADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "TipoAdjunto" AS ENUM ('VEP', 'COMPROBANTE_PAGO', 'ACUSE_DJ', 'CONSTANCIA_PLAN', 'IMAGEN_CHEQUE', 'OTRO');

-- CreateEnum
CREATE TYPE "CanalNotificacion" AS ENUM ('WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "EstadoNotificacion" AS ENUM ('PENDIENTE', 'ENVIADA', 'ENTREGADA', 'LEIDA', 'FALLIDA');

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'CONTADOR', 'ADMINISTRATIVO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'ADMINISTRATIVO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nombre_fantasia" TEXT,
    "tipo_persona" "TipoPersona" NOT NULL DEFAULT 'FISICA',
    "cuit" TEXT NOT NULL,
    "terminacion_cuit" SMALLINT NOT NULL,
    "condicion_iva" "CondicionIva" NOT NULL DEFAULT 'RESPONSABLE_INSCRIPTO',
    "tiene_empleados" BOOLEAN NOT NULL DEFAULT false,
    "es_iva_diferido" BOOLEAN NOT NULL DEFAULT false,
    "maneja_contabilidad_completa" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "telefono_whatsapp" TEXT,
    "acepta_notificaciones" BOOLEAN NOT NULL DEFAULT true,
    "domicilio_fiscal" TEXT,
    "jurisdiccion_iibb" TEXT,
    "municipio" TEXT,
    "notas" TEXT,
    "responsable_id" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_impuestos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "impuesto" "TipoImpuesto" NOT NULL,
    "jurisdiccion" TEXT NOT NULL DEFAULT 'NACIONAL',
    "periodicidad" "Periodicidad" NOT NULL DEFAULT 'MENSUAL',
    "dia_fijo" SMALLINT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "desde" DATE,
    "hasta" DATE,

    CONSTRAINT "cliente_impuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendario_fiscal" (
    "id" TEXT NOT NULL,
    "impuesto" "TipoImpuesto" NOT NULL,
    "jurisdiccion" TEXT NOT NULL DEFAULT 'NACIONAL',
    "periodo" TEXT NOT NULL,
    "terminacion_desde" SMALLINT NOT NULL,
    "terminacion_hasta" SMALLINT NOT NULL,
    "fecha" DATE NOT NULL,
    "fuente" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendario_fiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feriados" (
    "fecha" DATE NOT NULL,
    "descripcion" TEXT NOT NULL,
    "es_nacional" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "feriados_pkey" PRIMARY KEY ("fecha")
);

-- CreateTable
CREATE TABLE "vencimientos_fiscales" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "impuesto" "TipoImpuesto" NOT NULL,
    "jurisdiccion" TEXT NOT NULL DEFAULT 'NACIONAL',
    "periodo" TEXT NOT NULL,
    "fecha_vencimiento_calculada" DATE NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "fecha_vencimiento_pago" DATE NOT NULL,
    "es_override_manual" BOOLEAN NOT NULL DEFAULT false,
    "motivo_override" TEXT,
    "monto" DECIMAL(15,2),
    "saldo_a_favor" DECIMAL(15,2),
    "fecha_presentacion" TIMESTAMP(3),
    "fecha_pago" TIMESTAMP(3),
    "numero_vep" TEXT,
    "estado" "EstadoVencimiento" NOT NULL DEFAULT 'PENDIENTE',
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vencimientos_fiscales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planes_creditos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "tipo" "TipoPlan" NOT NULL,
    "numero" TEXT,
    "entidad" TEXT NOT NULL,
    "descripcion" TEXT,
    "obligaciones_incluidas" TEXT,
    "monto_total" DECIMAL(15,2) NOT NULL,
    "tasa_mensual" DECIMAL(8,6),
    "cantidad_cuotas" INTEGER NOT NULL,
    "fecha_alta" DATE NOT NULL,
    "fecha_primer_vencimiento" DATE NOT NULL,
    "dia_debito" SMALLINT NOT NULL,
    "dias_reintento" SMALLINT,
    "cbu_debito" TEXT,
    "cuotas_caidas_caducidad" SMALLINT,
    "estado" "EstadoPlan" NOT NULL DEFAULT 'VIGENTE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planes_creditos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuotas" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "fecha_segundo_vencimiento" DATE,
    "capital" DECIMAL(15,2) NOT NULL,
    "interes" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "importe" DECIMAL(15,2) NOT NULL,
    "interes_resarcitorio" DECIMAL(15,2),
    "estado" "EstadoCuota" NOT NULL DEFAULT 'VIGENTE',
    "intentos_debito" SMALLINT NOT NULL DEFAULT 0,
    "fecha_debito" DATE,
    "motivo_rechazo" TEXT,
    "fecha_imputacion" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuit" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_gasto" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "nombre" TEXT NOT NULL,
    "cuenta_contable" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cheques" (
    "id" TEXT NOT NULL,
    "tipo" "TipoCheque" NOT NULL,
    "direccion" "DireccionCheque" NOT NULL,
    "numero" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "sucursal" TEXT,
    "cuit_librador" TEXT,
    "librador" TEXT,
    "importe" DECIMAL(15,2) NOT NULL,
    "es_diferido" BOOLEAN NOT NULL DEFAULT false,
    "echeq_id" TEXT,
    "fecha_emision" DATE NOT NULL,
    "fecha_pago" DATE,
    "fecha_vencimiento_legal" DATE NOT NULL,
    "fecha_limite_deposito" DATE NOT NULL,
    "fecha_deposito" DATE,
    "fecha_acreditacion" DATE,
    "fecha_endoso" DATE,
    "fecha_rechazo" DATE,
    "motivo_rechazo" TEXT,
    "cliente_emisor_id" TEXT,
    "cliente_receptor_id" TEXT,
    "proveedor_entregado_id" TEXT,
    "categoria_gasto_id" TEXT,
    "estado" "EstadoCheque" NOT NULL DEFAULT 'EN_CARTERA',
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_cheque" (
    "id" TEXT NOT NULL,
    "cheque_id" TEXT NOT NULL,
    "estado_desde" "EstadoCheque",
    "estado_hasta" "EstadoCheque" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detalle" TEXT,
    "usuario_id" TEXT,

    CONSTRAINT "movimientos_cheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjuntos" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAdjunto" NOT NULL,
    "nombre_archivo" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanio_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sha256" TEXT,
    "vencimiento_id" TEXT,
    "plan_id" TEXT,
    "cuota_id" TEXT,
    "cheque_id" TEXT,
    "subido_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adjuntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "canal" "CanalNotificacion" NOT NULL DEFAULT 'WHATSAPP',
    "destino" TEXT NOT NULL,
    "plantilla" TEXT,
    "mensaje" TEXT NOT NULL,
    "clave_idempotencia" TEXT NOT NULL,
    "vencimiento_id" TEXT,
    "cuota_id" TEXT,
    "estado" "EstadoNotificacion" NOT NULL DEFAULT 'PENDIENTE',
    "proveedor_msg_id" TEXT,
    "error" TEXT,
    "programada_para" TIMESTAMP(3) NOT NULL,
    "enviada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resumenes_semanales" (
    "id" TEXT NOT NULL,
    "semana_desde" DATE NOT NULL,
    "semana_hasta" DATE NOT NULL,
    "total_importe" DECIMAL(15,2) NOT NULL,
    "contenido" JSONB NOT NULL,
    "generado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resumenes_semanales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_auditoria" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "usuario_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_cuit_key" ON "clientes"("cuit");

-- CreateIndex
CREATE INDEX "clientes_terminacion_cuit_idx" ON "clientes"("terminacion_cuit");

-- CreateIndex
CREATE INDEX "clientes_activo_idx" ON "clientes"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_impuestos_cliente_id_impuesto_jurisdiccion_key" ON "cliente_impuestos"("cliente_id", "impuesto", "jurisdiccion");

-- CreateIndex
CREATE UNIQUE INDEX "calendario_fiscal_impuesto_jurisdiccion_periodo_terminacion_key" ON "calendario_fiscal"("impuesto", "jurisdiccion", "periodo", "terminacion_desde", "terminacion_hasta");

-- CreateIndex
CREATE INDEX "vencimientos_fiscales_fecha_vencimiento_estado_idx" ON "vencimientos_fiscales"("fecha_vencimiento", "estado");

-- CreateIndex
CREATE INDEX "vencimientos_fiscales_fecha_vencimiento_pago_estado_idx" ON "vencimientos_fiscales"("fecha_vencimiento_pago", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "vencimientos_fiscales_cliente_id_impuesto_jurisdiccion_peri_key" ON "vencimientos_fiscales"("cliente_id", "impuesto", "jurisdiccion", "periodo");

-- CreateIndex
CREATE INDEX "planes_creditos_cliente_id_estado_idx" ON "planes_creditos"("cliente_id", "estado");

-- CreateIndex
CREATE INDEX "cuotas_fecha_vencimiento_estado_idx" ON "cuotas"("fecha_vencimiento", "estado");

-- CreateIndex
CREATE INDEX "cuotas_fecha_segundo_vencimiento_estado_idx" ON "cuotas"("fecha_segundo_vencimiento", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "cuotas_plan_id_numero_key" ON "cuotas"("plan_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_cliente_id_nombre_key" ON "proveedores"("cliente_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_gasto_cliente_id_nombre_key" ON "categorias_gasto"("cliente_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "cheques_echeq_id_key" ON "cheques"("echeq_id");

-- CreateIndex
CREATE INDEX "cheques_estado_fecha_limite_deposito_idx" ON "cheques"("estado", "fecha_limite_deposito");

-- CreateIndex
CREATE INDEX "cheques_direccion_fecha_pago_idx" ON "cheques"("direccion", "fecha_pago");

-- CreateIndex
CREATE UNIQUE INDEX "cheques_banco_numero_cuit_librador_key" ON "cheques"("banco", "numero", "cuit_librador");

-- CreateIndex
CREATE INDEX "movimientos_cheque_cheque_id_fecha_idx" ON "movimientos_cheque"("cheque_id", "fecha");

-- CreateIndex
CREATE INDEX "adjuntos_vencimiento_id_idx" ON "adjuntos"("vencimiento_id");

-- CreateIndex
CREATE INDEX "adjuntos_cuota_id_idx" ON "adjuntos"("cuota_id");

-- CreateIndex
CREATE INDEX "adjuntos_cheque_id_idx" ON "adjuntos"("cheque_id");

-- CreateIndex
CREATE UNIQUE INDEX "notificaciones_clave_idempotencia_key" ON "notificaciones"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "notificaciones_estado_programada_para_idx" ON "notificaciones"("estado", "programada_para");

-- CreateIndex
CREATE UNIQUE INDEX "resumenes_semanales_semana_desde_key" ON "resumenes_semanales"("semana_desde");

-- CreateIndex
CREATE INDEX "eventos_auditoria_entidad_entidad_id_idx" ON "eventos_auditoria"("entidad", "entidad_id");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_impuestos" ADD CONSTRAINT "cliente_impuestos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vencimientos_fiscales" ADD CONSTRAINT "vencimientos_fiscales_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_creditos" ADD CONSTRAINT "planes_creditos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuotas" ADD CONSTRAINT "cuotas_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes_creditos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_gasto" ADD CONSTRAINT "categorias_gasto_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_cliente_emisor_id_fkey" FOREIGN KEY ("cliente_emisor_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_cliente_receptor_id_fkey" FOREIGN KEY ("cliente_receptor_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_proveedor_entregado_id_fkey" FOREIGN KEY ("proveedor_entregado_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_categoria_gasto_id_fkey" FOREIGN KEY ("categoria_gasto_id") REFERENCES "categorias_gasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cheque" ADD CONSTRAINT "movimientos_cheque_cheque_id_fkey" FOREIGN KEY ("cheque_id") REFERENCES "cheques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_vencimiento_id_fkey" FOREIGN KEY ("vencimiento_id") REFERENCES "vencimientos_fiscales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes_creditos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_cuota_id_fkey" FOREIGN KEY ("cuota_id") REFERENCES "cuotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_cheque_id_fkey" FOREIGN KEY ("cheque_id") REFERENCES "cheques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_vencimiento_id_fkey" FOREIGN KEY ("vencimiento_id") REFERENCES "vencimientos_fiscales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_cuota_id_fkey" FOREIGN KEY ("cuota_id") REFERENCES "cuotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_auditoria" ADD CONSTRAINT "eventos_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
