# Setup — Haltestellensimulator

Anleitung für die lokale Entwicklungsumgebung. Läuft vollständig auf deinem Rechner — keine externen Cloud-Dienste im MVP nötig.

## Voraussetzungen

- **Node.js ≥ 20**
- **pnpm** (oder npm/yarn)
- **Docker** + **Docker Compose**

## 1. Repository

```bash
git clone https://github.com/gotomogmbh/Haltestellensimulator
cd Haltestellensimulator
cp .env.example .env
```

## 2. Datenbank starten (PostgreSQL 16 + PostGIS 3.x)

Die Datenbank läuft via Docker Compose, lokal auf Port `5432`:

```bash
docker compose up -d
# oder: pnpm db:up
```

Verifizieren:

```bash
docker compose ps
docker compose logs db
```

**Verbindungsdaten** (entsprechen `docker-compose.yml` und `.env.example`):

| Feld | Wert |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Datenbank | `haltestellensimulator` |
| User | `app` |
| Passwort | `app` |

DATABASE_URL: `postgresql://app:app@localhost:5432/haltestellensimulator?schema=public`

Das verwendete Image `postgis/postgis:16-3.4` bringt die PostGIS-Extension mit; Prisma aktiviert sie bei der ersten Migration.

## 3. Dependencies installieren

```bash
pnpm install
```

## 4. Prisma: Erste Migration

```bash
pnpm prisma migrate dev --name init
```

Diese Migration:
- aktiviert die PostGIS-Extension in der DB,
- erstellt alle Tabellen, Enums und Indexe gemäss `prisma/schema.prisma`,
- generiert den Prisma Client (Output in `node_modules/.prisma/client`).

Bei späteren Schema-Änderungen:

```bash
pnpm prisma migrate dev --name <kurzbeschreibung>
```

## 5. Dev-Server starten

```bash
pnpm dev
```

App öffnen: <http://localhost:3000>

## Tägliche Befehle

| Zweck | Befehl |
|---|---|
| DB starten | `pnpm db:up` |
| DB stoppen | `pnpm db:down` |
| DB resetten (Daten löschen!) | `pnpm db:reset` |
| Prisma Studio (DB-Browser) | `pnpm prisma:studio` |
| Schema neu generieren | `pnpm prisma:generate` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Build | `pnpm build` |

## Troubleshooting

**Port 5432 ist belegt** — lokal laufenden Postgres stoppen oder Port in `docker-compose.yml` und `DATABASE_URL` anpassen (z. B. `5433`).

**`relation "postgis" does not exist`** — sicherstellen, dass das Docker-Image `postgis/postgis:16-3.4` läuft (nicht ein normales `postgres:16`-Image). Container neu starten: `pnpm db:reset`.

**Prisma findet keine Extensions** — Datasource enthält `extensions = [postgis]` und das Feature-Flag `postgresqlExtensions` ist gesetzt. Wenn die Migration nicht aktiviert: `pnpm prisma migrate reset` und neu migrieren.

**Permissions auf `storage/uploads/*`** — die Ordner sind mit `.gitkeep` versioniert, ihr Inhalt ist via `.gitignore` ausgeschlossen. Schreibrechte des Dev-Users prüfen.
