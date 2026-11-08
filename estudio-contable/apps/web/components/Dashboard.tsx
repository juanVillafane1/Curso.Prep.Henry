"use client";

import { useEffect, useState } from "react";
import { toISODate, type Compromiso } from "@estudio/shared";
import { api, fechaCorta, pesos, type DashboardResponse } from "@/lib/api";

type Vista = "diaria" | "semanal";

export function Dashboard() {
  const [vista, setVista] = useState<Vista>("semanal");
  const [fecha, setFecha] = useState(() => toISODate(new Date()));
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api<DashboardResponse>(`/dashboard?vista=${vista}&fecha=${fecha}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [vista, fecha]);

  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Vista">
          {(["diaria", "semanal"] as const).map((v) => (
            <button key={v} aria-pressed={vista === v} onClick={() => setVista(v)}>
              {v === "diaria" ? "Diaria" : "Semanal"}
            </button>
          ))}
        </div>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha de referencia" />
        {data && <span style={{ color: "var(--muted)" }}>{fechaCorta(data.desde)}{data.desde !== data.hasta && ` – ${fechaCorta(data.hasta)}`}</span>}
      </div>

      {error && <p className="alert">No se pudo cargar el dashboard: {error}</p>}

      {data && (
        <>
          <div className="grid-4">
            <Stat label="Total a pagar" value={pesos(data.total)} />
            <Stat label="Impuestos" value={`${data.porOrigen.IMPUESTO.cantidad} · ${pesos(data.porOrigen.IMPUESTO.importe)}`} />
            <Stat label="Cuotas" value={`${data.porOrigen.CUOTA.cantidad} · ${pesos(data.porOrigen.CUOTA.importe)}`} />
            <Stat label="Cheques" value={`${data.porOrigen.CHEQUE.cantidad} · ${pesos(data.porOrigen.CHEQUE.importe)}`} />
          </div>

          <div className="card" style={{ marginTop: 12, display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Alerta n={data.alertas.vencimientosVencidos} texto="vencimientos vencidos" />
            <Alerta n={data.alertas.pagosAtrasadosSinComprobante} texto="pagos sin comprobante" />
            <Alerta n={data.alertas.cuotasCaidas} texto="cuotas caídas" />
            <Alerta n={data.alertas.chequesRechazados} texto="cheques rechazados" />
          </div>

          {data.items.length === 0 ? (
            <p style={{ color: "var(--muted)", marginTop: 24 }}>Sin compromisos en el período.</p>
          ) : (
            Object.entries(data.porDia).map(([dia, items]) => <DiaTabla key={dia} dia={dia} items={items} />)
          )}
        </>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function Alerta({ n, texto }: { n: number; texto: string }) {
  return <span className={n > 0 ? "alert" : undefined}>{n} {texto}</span>;
}

function DiaTabla({ dia, items }: { dia: string; items: Compromiso[] }) {
  const nombre = new Date(`${dia}T12:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "2-digit" });
  return (
    <section className="dia card">
      <h3>{nombre}</h3>
      <table>
        <thead>
          <tr><th>Tipo</th><th>Cliente</th><th>Concepto</th><th>Estado</th><th style={{ textAlign: "right" }}>Importe</th></tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={`${i.origen}-${i.id}-${i.descripcion}`}>
              <td><span className={`tag ${i.origen}`}>{i.origen === "IMPUESTO" ? "Impuesto" : i.origen === "CUOTA" ? "Cuota" : "Cheque"}</span></td>
              <td>{i.clienteNombre}</td>
              <td>{i.descripcion}</td>
              <td>{i.estado.replaceAll("_", " ").toLowerCase()}</td>
              <td className="num" style={i.sentido === "INGRESO" ? { color: "var(--ok)" } : undefined}>{pesos(i.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
