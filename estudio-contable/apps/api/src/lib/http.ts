export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly codigo?: string,
  ) {
    super(message);
  }
}
export const notFound = (entidad: string) => new HttpError(404, `${entidad} no encontrado`, "NOT_FOUND");

/** Decimal de Prisma → number (importes de hasta 15,2 entran sin pérdida en double). */
export const num = (d: { toString(): string } | null | undefined): number | null => (d == null ? null : Number(d.toString()));
