import { describe, expect, it } from "vitest";
import {
  aplicarResultadoDebito,
  alertaCheque,
  calcularFechasCheque,
  calcularVencimientoPago,
  calcularVencimientoPresentacion,
  consolidar,
  correspondeRecordatorio,
  esCuitValido,
  estadoTrasPresentacion,
  evaluarEstadoCuota,
  fecha,
  generarCuotas,
  impuestoHabilitado,
  rangoVista,
  toISODate,
  validarCierre,
  validarTransicionCheque,
} from "../src/index.js";

const cal = { feriados: new Set<string>(["2026-12-08"]) };

describe("CUIT", () => {
  it("valida dígito verificador", () => {
    expect(esCuitValido("20-12345678-6")).toBe(true);
    expect(esCuitValido("20-12345678-1")).toBe(false);
  });
});

describe("Vencimientos fiscales", () => {
  it("escalona IVA por terminación de CUIT y traslada a día hábil", () => {
    // período 2026-10 → vence nov-2026; terminación 6 → día 21 (sábado) → lunes 23
    const f = calcularVencimientoPresentacion({ impuesto: "IVA", documento: "20123456786", periodo: "2026-10", calendario: cal });
    expect(toISODate(f)).toBe("2026-11-23");
  });

  it("respeta feriados", () => {
    // período 2026-11 → dic-2026; F931 terminación 6 → día 10 (jueves) ok
    const f = calcularVencimientoPresentacion({ impuesto: "F931", documento: "20123456786", periodo: "2026-11", calendario: cal });
    expect(toISODate(f)).toBe("2026-12-10");
  });

  it("override manual del calendario oficial (reprogramación ARCA) tiene prioridad", () => {
    const f = calcularVencimientoPresentacion({
      impuesto: "IVA",
      documento: "20123456786",
      periodo: "2026-10",
      calendario: cal,
      overrides: [{ impuesto: "IVA", periodo: "2026-10", terminacionDesde: 4, terminacionHasta: 7, fecha: fecha(2026, 11, 27) }],
    });
    expect(toISODate(f)).toBe("2026-11-27");
  });

  it("IVA diferido: pago a 3 meses de la presentación", () => {
    const pago = calcularVencimientoPago({ impuesto: "IVA", fechaPresentacion: fecha(2026, 11, 18), esIvaDiferido: true, calendario: cal });
    expect(toISODate(pago)).toBe("2027-02-18");
    const sinDiferir = calcularVencimientoPago({ impuesto: "IVA", fechaPresentacion: fecha(2026, 11, 18), esIvaDiferido: false, calendario: cal });
    expect(toISODate(sinDiferir)).toBe("2026-11-18");
    const iibb = calcularVencimientoPago({ impuesto: "IIBB", fechaPresentacion: fecha(2026, 11, 18), esIvaDiferido: true, calendario: cal });
    expect(toISODate(iibb)).toBe("2026-11-18");
  });

  it("F931 sólo para clientes con empleados", () => {
    expect(impuestoHabilitado("F931", { tieneEmpleados: false })).toBe(false);
    expect(impuestoHabilitado("F931", { tieneEmpleados: true })).toBe(true);
  });

  it("DJ en $0 finaliza sin comprobante; > 0 exige VEP", () => {
    expect(estadoTrasPresentacion({ estadoActual: "PENDIENTE", monto: 0, tieneComprobantePago: false })).toBe("FINALIZADO");
    expect(estadoTrasPresentacion({ estadoActual: "PENDIENTE", monto: 1500, tieneComprobantePago: false })).toBe("PRESENTADO_PENDIENTE_PAGO");
    expect(() => validarCierre({ monto: 1500, tieneComprobantePago: false })).toThrow(/VEP/);
    expect(() => validarCierre({ monto: 1500, tieneComprobantePago: true })).not.toThrow();
  });
});

describe("Planes de pago", () => {
  it("ARCA genera doble vencimiento (X y X+10)", () => {
    const cuotas = generarCuotas({ tipo: "PLAN_ARCA", cantidadCuotas: 3, fechaPrimerVencimiento: fecha(2026, 11, 16), importeCuota: 10000, calendario: cal });
    expect(cuotas.map((c) => toISODate(c.fechaVencimiento))).toEqual(["2026-11-16", "2026-12-16", "2027-01-18"]);
    expect(toISODate(cuotas[0]!.fechaSegundoVencimiento!)).toBe("2026-11-26");
  });

  it("préstamo bancario por sistema francés suma el capital", () => {
    const cuotas = generarCuotas({ tipo: "PRESTAMO_BANCARIO", cantidadCuotas: 12, fechaPrimerVencimiento: fecha(2026, 12, 10), montoTotal: 1_000_000, tasaMensual: 0.03, calendario: cal });
    expect(cuotas[0]!.fechaSegundoVencimiento).toBeNull();
    const capital = cuotas.reduce((a, c) => a + c.capital, 0);
    expect(Math.round(capital)).toBe(1_000_000);
  });

  it("cuota no debitada en ningún vencimiento pasa a CAIDA", () => {
    const base = { fechaVencimiento: fecha(2026, 11, 16), fechaSegundoVencimiento: fecha(2026, 11, 26) };
    expect(evaluarEstadoCuota({ ...base, estado: "VIGENTE", hoy: fecha(2026, 11, 16) })).toBe("VIGENTE");
    expect(evaluarEstadoCuota({ ...base, estado: "VIGENTE", hoy: fecha(2026, 11, 17) })).toBe("RECHAZADA");
    expect(evaluarEstadoCuota({ ...base, estado: "RECHAZADA", hoy: fecha(2026, 11, 27) })).toBe("CAIDA");
    expect(evaluarEstadoCuota({ ...base, estado: "DEBITADA", hoy: fecha(2026, 11, 27) })).toBe("DEBITADA");
    expect(aplicarResultadoDebito({ estado: "VIGENTE", resultado: "SIN_FONDOS", intento: 1, tieneSegundoVencimiento: true })).toBe("RECHAZADA");
    expect(aplicarResultadoDebito({ estado: "RECHAZADA", resultado: "SIN_FONDOS", intento: 2, tieneSegundoVencimiento: true })).toBe("CAIDA");
  });
});

describe("Cheques", () => {
  it("vencimiento legal a 30 días de la fecha de pago", () => {
    const r = calcularFechasCheque({ fechaEmision: fecha(2026, 11, 1), fechaPago: fecha(2026, 12, 15) });
    expect(toISODate(r.fechaVencimientoLegal)).toBe("2027-01-14");
  });

  it("valida el flujo de estados", () => {
    expect(() => validarTransicionCheque({ desde: "EN_CARTERA", hacia: "DEPOSITADO", direccion: "RECIBIDO" })).not.toThrow();
    expect(() => validarTransicionCheque({ desde: "COBRADO", hacia: "DEPOSITADO", direccion: "RECIBIDO" })).toThrow();
    expect(() => validarTransicionCheque({ desde: "EN_CARTERA", hacia: "ENDOSADO", direccion: "RECIBIDO" })).toThrow(/proveedor/);
  });

  it("semáforo de cartera", () => {
    const base = { estado: "EN_CARTERA" as const, direccion: "RECIBIDO" as const, fechaPago: fecha(2026, 11, 1), fechaLimiteDeposito: fecha(2026, 12, 1) };
    expect(alertaCheque({ ...base, hoy: fecha(2026, 11, 28) })).toBe("PROXIMO_A_VENCER");
    expect(alertaCheque({ ...base, hoy: fecha(2026, 12, 2) })).toBe("VENCIDO_LEGAL");
    // Un cheque emitido nunca es "no depositable": se avisa el débito
    const emitido = { estado: "EN_CARTERA" as const, direccion: "EMITIDO" as const, fechaPago: fecha(2026, 11, 11), fechaLimiteDeposito: fecha(2026, 12, 11) };
    expect(alertaCheque({ ...emitido, hoy: fecha(2026, 11, 8) })).toBe("DEBITO_PROXIMO");
    expect(alertaCheque({ ...emitido, hoy: fecha(2026, 10, 1) })).toBe("OK");
  });
});

describe("Dashboard y recordatorios", () => {
  it("vista semanal va de lunes a domingo", () => {
    const r = rangoVista("semanal", fecha(2026, 11, 11));
    expect(toISODate(r.desde)).toBe("2026-11-09");
    expect(toISODate(r.hasta)).toBe("2026-11-15");
  });

  it("consolida compromisos por origen", () => {
    const r = consolidar(fecha(2026, 11, 9), fecha(2026, 11, 15), [
      { origen: "IMPUESTO", sentido: "EGRESO", id: "1", clienteId: "c", clienteNombre: "X", descripcion: "IVA", fecha: "2026-11-18", importe: 100, estado: "PENDIENTE" },
      { origen: "CHEQUE", sentido: "EGRESO", id: "2", clienteId: "c", clienteNombre: "X", descripcion: "Ch", fecha: "2026-11-10", importe: 50, estado: "EN_CARTERA" },
    ]);
    expect(r.total).toBe(150);
    expect(r.totalIngresos).toBe(0);
    expect(r.items[0]!.origen).toBe("CHEQUE");
  });

  it("recordatorio 2 o 3 días antes", () => {
    expect(correspondeRecordatorio(fecha(2026, 11, 15), fecha(2026, 11, 18))).toBe(3);
    expect(correspondeRecordatorio(fecha(2026, 11, 16), fecha(2026, 11, 18))).toBe(2);
    expect(correspondeRecordatorio(fecha(2026, 11, 17), fecha(2026, 11, 18))).toBeNull();
  });
});
