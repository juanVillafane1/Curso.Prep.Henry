import { api, fechaCorta, pesos } from "@/lib/api";

export const dynamic = "force-dynamic";

interface Cheque { id: string; tipo: string; direccion: string; numero: string; banco: string; importe: string; fechaPago: string | null; fechaLimiteDeposito: string; estado: string; alerta: string }

export default async function ChequesPage() {
  const data = await api<Cheque[]>("/cheques?estado=EN_CARTERA");
  return (
    <>
      <h2 style={{ marginTop: 0 }}>Cheques en cartera</h2>
      <div className="card">
        <table>
          <thead><tr><th>Tipo</th><th>Dirección</th><th>N°</th><th>Banco</th><th>Fecha pago</th><th>Límite depósito</th><th>Alerta</th><th style={{ textAlign: "right" }}>Importe</th></tr></thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td>{c.tipo}</td><td>{c.direccion === "RECIBIDO" ? "A cobrar" : "A pagar"}</td><td>{c.numero}</td><td>{c.banco}</td>
                <td>{c.fechaPago ? fechaCorta(c.fechaPago) : "—"}</td><td>{fechaCorta(c.fechaLimiteDeposito)}</td>
                <td className={c.alerta === "OK" ? undefined : "alert"}>{c.alerta.replaceAll("_", " ").toLowerCase()}</td>
                <td className="num">{pesos(Number(c.importe))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
