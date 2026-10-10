# EVolve AI — frontend

React 18 · TypeScript · Vite 5 · Tailwind CSS 3 · Recharts · React Router · lucide-react.

## Run

```powershell
cd "...\evolve-audit\frontend"

npm install
npm run dev          # http://127.0.0.1:5173
```

Production build:

```powershell
npm run build        # type-checks with tsc, then bundles
npm run preview      # serve the build on :4173
```

> Open `http://127.0.0.1:5173`, **not** `localhost`. Vite is bound to IPv4 deliberately —
> on Windows `localhost` resolves to `::1` and the browser cannot connect.

The backend is reached through Vite's proxy (`/api` → `127.0.0.1:8000`), so the frontend
works unchanged on localhost, a LAN IP, or behind a demo laptop's firewall.

## Layout

```
src/
├── main.tsx              entry
├── App.tsx               routes
├── components/
│   ├── Layout.tsx        sidebar nav, synthetic-data banner, disclaimer
│   ├── ui.tsx            Card, Kpi, Notice, Spinner, EmptyState, Meter, MethodNote
│   ├── charts.tsx        Recharts wrappers
│   └── AppContext.tsx    data context, useAsync, toasts
├── pages/
│   ├── Dashboard.tsx     waste intelligence dashboard
│   ├── Fleet.tsx         fleet overview, battery intelligence, battery detail
│   ├── Collection.tsx    EOL priority queue, collection optimizer
│   ├── Planning.tsx      forecast, capacity, what-if simulator
│   ├── Insight.tsx       circularity, digital twin, action plan, methodology, about
│   └── Upload.tsx        CSV upload
├── services/api.ts       typed client
├── types/api.ts          backend response contracts
└── lib/format.ts         INR / percent / month formatting
```

## Conventions

**Charts render only what the API sends.** No chart seeds a hardcoded series. Empty data
produces an explicit empty state rather than an empty axis.

**Every score explains itself.** `MethodNote` is a disclosure under each chart and metric
that renders the backend's own `method` string, so the explanation cannot drift from the
number.

**Numbers use `tnum` (tabular figures)** so columns of figures align and a change is
visible at a glance.

**Provenance is not dismissible.** The synthetic-data banner is a permanent part of the
layout, not a toast — a prototype that can hide its own data disclaimer has no credibility.

**Types mirror the backend.** `types/api.ts` is checked against live payloads by
`test_api.py::test_*_payload_has_every_ui_field`, so a backend rename breaks the build
rather than rendering `undefined` inside a chart.