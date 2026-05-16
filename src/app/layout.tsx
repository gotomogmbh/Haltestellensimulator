import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haltestellensimulator",
  description:
    "Planung und Bewertung modularer Fahrgastinformations-Elemente an VBZ-Haltestellen",
};

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/imports", label: "Importe" },
  { href: "/sites", label: "Haltestellen" },
  { href: "/pois", label: "POIs" },
  { href: "/scoring", label: "Scoring" },
  { href: "/map", label: "Karte" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>
        <header className="app-header">
          <div className="brand">Haltestellensimulator</div>
          <nav className="app-nav">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="app-main">{children}</main>
      </body>
    </html>
  );
}
