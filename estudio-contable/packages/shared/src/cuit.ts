/** Validación y helpers de CUIT/CUIL/DNI. */

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function limpiarDocumento(doc: string): string {
  return doc.replace(/\D/g, "");
}

export function esCuitValido(cuit: string): boolean {
  const c = limpiarDocumento(cuit);
  if (!/^\d{11}$/.test(c)) return false;
  const suma = PESOS.reduce((acc, p, i) => acc + p * Number(c[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9; // caso especial aceptado por ARCA para algunos prefijos
  return dv === Number(c[10]);
}

export function esDniValido(dni: string): boolean {
  return /^\d{7,8}$/.test(limpiarDocumento(dni));
}

/**
 * Dígito usado por ARCA/AFIP y la mayoría de los fiscos provinciales para
 * escalonar vencimientos: el último dígito del CUIT (o del DNI).
 */
export function terminacionDocumento(doc: string): number {
  const c = limpiarDocumento(doc);
  if (!c) throw new Error("Documento vacío");
  return Number(c[c.length - 1]);
}

export function formatearCuit(cuit: string): string {
  const c = limpiarDocumento(cuit);
  return c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c;
}
