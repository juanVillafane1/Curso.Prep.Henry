/**
 * Enumeraciones de dominio. Se mantienen sincronizadas con los enums de
 * `apps/api/prisma/schema.prisma` (mismos literales).
 */

export const TipoImpuesto = {
  IVA: "IVA",
  IIBB: "IIBB",
  TASA_MUNICIPAL: "TASA_MUNICIPAL",
  F931: "F931",
  GANANCIAS: "GANANCIAS",
  BIENES_PERSONALES: "BIENES_PERSONALES",
  AUTONOMOS: "AUTONOMOS",
  MONOTRIBUTO: "MONOTRIBUTO",
  OTRO: "OTRO",
} as const;
export type TipoImpuesto = (typeof TipoImpuesto)[keyof typeof TipoImpuesto];

export const EstadoVencimiento = {
  PENDIENTE: "PENDIENTE",
  /** DJ presentada con saldo > 0, falta el VEP/comprobante de pago. */
  PRESENTADO_PENDIENTE_PAGO: "PRESENTADO_PENDIENTE_PAGO",
  /** DJ en $0 presentada, o DJ pagada con comprobante adjunto. */
  FINALIZADO: "FINALIZADO",
  VENCIDO: "VENCIDO",
  ANULADO: "ANULADO",
} as const;
export type EstadoVencimiento = (typeof EstadoVencimiento)[keyof typeof EstadoVencimiento];

export const TipoPlan = {
  PLAN_ARCA: "PLAN_ARCA",
  PLAN_PROVINCIAL: "PLAN_PROVINCIAL",
  PLAN_MUNICIPAL: "PLAN_MUNICIPAL",
  PRESTAMO_BANCARIO: "PRESTAMO_BANCARIO",
} as const;
export type TipoPlan = (typeof TipoPlan)[keyof typeof TipoPlan];

export const EstadoCuota = {
  VIGENTE: "VIGENTE",
  DEBITADA: "DEBITADA",
  RECHAZADA: "RECHAZADA", // "Debitada con error / Rechazada"
  CAIDA: "CAIDA", // No debitada en 1º ni 2º vencimiento: pendiente de regularizar
  IMPUTADA: "IMPUTADA",
} as const;
export type EstadoCuota = (typeof EstadoCuota)[keyof typeof EstadoCuota];

export const TipoCheque = { FISICO: "FISICO", ECHEQ: "ECHEQ" } as const;
export type TipoCheque = (typeof TipoCheque)[keyof typeof TipoCheque];

/** RECIBIDO = valor a cobrar (cartera). EMITIDO = valor a pagar por el cliente. */
export const DireccionCheque = { RECIBIDO: "RECIBIDO", EMITIDO: "EMITIDO" } as const;
export type DireccionCheque = (typeof DireccionCheque)[keyof typeof DireccionCheque];

export const EstadoCheque = {
  EN_CARTERA: "EN_CARTERA",
  DEPOSITADO: "DEPOSITADO",
  ENDOSADO: "ENDOSADO",
  COBRADO: "COBRADO",
  RECHAZADO: "RECHAZADO",
  ANULADO: "ANULADO",
} as const;
export type EstadoCheque = (typeof EstadoCheque)[keyof typeof EstadoCheque];
