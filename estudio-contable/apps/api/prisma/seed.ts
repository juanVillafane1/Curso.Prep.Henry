import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  // Feriados nacionales 2026 (completar/actualizar con el decreto anual)
  const feriados: [string, string][] = [
    ["2026-01-01", "Año Nuevo"], ["2026-02-16", "Carnaval"], ["2026-02-17", "Carnaval"],
    ["2026-03-24", "Día de la Memoria"], ["2026-04-02", "Malvinas"], ["2026-04-03", "Viernes Santo"],
    ["2026-05-01", "Día del Trabajador"], ["2026-05-25", "Revolución de Mayo"], ["2026-06-15", "Güemes (trasladable)"],
    ["2026-06-20", "Día de la Bandera"], ["2026-07-09", "Independencia"], ["2026-08-17", "San Martín (trasladable)"],
    ["2026-10-12", "Diversidad Cultural (trasladable)"], ["2026-11-23", "Soberanía Nacional (trasladable)"],
    ["2026-12-08", "Inmaculada Concepción"], ["2026-12-25", "Navidad"],
  ];
  for (const [f, desc] of feriados) {
    await prisma.feriado.upsert({ where: { fecha: d(f) }, create: { fecha: d(f), descripcion: desc }, update: { descripcion: desc } });
  }

  for (const nombre of ["Mantenimiento", "Gastos Administrativos", "Servicios", "Mercaderías", "Honorarios"]) {
    const existe = await prisma.categoriaGasto.findFirst({ where: { clienteId: null, nombre } });
    if (!existe) await prisma.categoriaGasto.create({ data: { nombre } });
  }

  const pyme = await prisma.cliente.upsert({
    where: { cuit: "30712345671" },
    create: {
      razonSocial: "Distribuidora Ejemplo SRL", tipoPersona: "JURIDICA", cuit: "30712345671", terminacionCuit: 1,
      tieneEmpleados: true, esIvaDiferido: true, manejaContabilidadCompleta: true,
      telefonoWhatsapp: "+5491100000001", jurisdiccionIibb: "CM",
    },
    update: {},
  });
  const monotrib = await prisma.cliente.upsert({
    where: { cuit: "20123456786" },
    create: { razonSocial: "Pérez Juan", cuit: "20123456786", terminacionCuit: 6, condicionIva: "RESPONSABLE_INSCRIPTO", telefonoWhatsapp: "+5491100000002", jurisdiccionIibb: "ARBA" },
    update: {},
  });

  const obligaciones = [
    { clienteId: pyme.id, impuesto: "IVA" as const },
    { clienteId: pyme.id, impuesto: "F931" as const },
    { clienteId: pyme.id, impuesto: "IIBB" as const, jurisdiccion: "CM" },
    { clienteId: monotrib.id, impuesto: "IVA" as const },
    { clienteId: monotrib.id, impuesto: "IIBB" as const, jurisdiccion: "ARBA" },
    { clienteId: monotrib.id, impuesto: "TASA_MUNICIPAL" as const, jurisdiccion: "MUNI_LA_PLATA", diaFijo: 15 },
  ];
  for (const o of obligaciones) {
    const jurisdiccion = o.jurisdiccion ?? "NACIONAL";
    await prisma.clienteImpuesto.upsert({
      where: { clienteId_impuesto_jurisdiccion: { clienteId: o.clienteId, impuesto: o.impuesto, jurisdiccion } },
      create: { ...o, jurisdiccion },
      update: {},
    });
  }
  console.log("Seed OK");
}

main().finally(() => prisma.$disconnect());
