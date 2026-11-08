import { api, fechaCorta, pesos } from "@/lib/api";

export const dynamic = "force-dynamic";

interface Venc { id: string; impuesto: string; periodo: string; fechaVencimiento: string; fechaVencimientoPago: string; esOverrideManual: boolean; monto: string | null; estado: string; cliente: { razonSocial: string } }

export default async function VencimientosPage() {
  const data = await api<Venc[]>("/vencimientos?estado=PENDIENTE");
  return (
    <>
      <h2 style={{ marginTop: 0 }}>Vencimientos pendientes</h2>
      <div className="card">
        <table>
          <thead><tr><th>Vence</th><th>Pago</th><th>Cliente</th><th>Impuesto</th><th>Período</th><th>Estado</th><th style={{ textAlign: "right" }}>Monto</th></tr></thead>
          <tbody>
            {data.map((v) => (
              <tr key={v.id}>
                <td>{fechaCorta(v.fechaVencimiento)}{v.esOverrideManual && " ✎"}</td>
                <td>{v.fechaVencimientoPago !== v.fechaVencimiento ? fechaCorta(v.fechaVencimientoPago) : "—"}</td>
                <td>{v.cliente.razonSocial}</td><td>{v.impuesto}</td><td>{v.periodo}</td><td>{v.estado}</td>
                <td className="num">{pesos(v.monto == null ? null : Number(v.monto))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
