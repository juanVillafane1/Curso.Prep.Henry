import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Estudio Contable", description: "Agenda de vencimientos, planes de pago y cheques" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>
        <div className="layout">
          <aside className="sidebar">
            <h1>Estudio Contable</h1>
            <nav>
              <Link href="/">Dashboard</Link>
              <Link href="/clientes">Clientes</Link>
              <Link href="/vencimientos">Vencimientos</Link>
              <Link href="/cheques">Cheques</Link>
            </nav>
          </aside>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
