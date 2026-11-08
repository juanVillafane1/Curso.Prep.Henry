import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

interface Cliente { id: string; razonSocial: string; cuit: string; tieneEmpleados: boolean; esIvaDiferido: boolean; manejaContabilidadCompleta: boolean }

export default async function ClientesPage() {
  const { data } = await api<{ data: Cliente[] }>("/clientes?activo=true");
  const si = (b: boolean) => (b ? "Sí" : "—");
  return (
    <>
      <h2 style={{ marginTop: 0 }}>Clientes</h2>
      <div className="card">
        <table>
          <thead><tr><th>Razón social</th><th>CUIT/DNI</th><th>Empleados (F.931)</th><th>IVA diferido</th><th>Contab. completa</th></tr></thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}><td>{c.razonSocial}</td><td>{c.cuit}</td><td>{si(c.tieneEmpleados)}</td><td>{si(c.esIvaDiferido)}</td><td>{si(c.manejaContabilidadCompleta)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
