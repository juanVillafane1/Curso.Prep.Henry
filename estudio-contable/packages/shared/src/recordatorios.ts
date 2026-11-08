import { diasEntre } from "./fechas.js";

/**
 * Devuelve true si hoy corresponde enviar el recordatorio (2 o 3 días antes
 * del vencimiento, configurable). Si el aviso cae en fin de semana, el job
 * sólo corre en días hábiles, por eso se ofrecen dos ventanas.
 */
export function correspondeRecordatorio(hoy: Date, vencimiento: Date, diasAntes: readonly number[] = [3, 2]): number | null {
  const faltan = diasEntre(hoy, vencimiento);
  return diasAntes.includes(faltan) ? faltan : null;
}

export function mensajeRecordatorio(p: {
  cliente: string;
  concepto: string;
  fecha: string;
  importe?: number | null;
}): string {
  const imp = p.importe != null ? ` por $${p.importe.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "";
  return `Hola ${p.cliente}, te recordamos que el ${p.fecha} vence ${p.concepto}${imp}. Ante cualquier duda, comunicate con el estudio.`;
}
