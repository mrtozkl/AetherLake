# 🎨 Frontend Development Standards: Control Panel

This document contains instructions for modifying the AetherLake Control Panel, a web-based dashboard built on Next.js 16 and React 19.

---

## 🏗️ Technology Stack

- **Framework**: Next.js 16 (App Router)
- **Library**: React 19 (Functional Components, Hooks)
- **Language**: TypeScript (Strict type checks, zero `any`)
- **Styling**: Tailwind CSS (Utility classes) & Framer Motion (Transitions)
- **Icons**: Lucide React
- **Code Editor**: `@monaco-editor/react` (Used in Query, Flink Studio, dbt Inspector)
- **Lineage DAG**: `@xyflow/react` (React Flow) with `@dagrejs/dagre` hierarchical auto-layout
- **Auth**: NextAuth.js (Keycloak OpenID Connect / Credentials dev fallback)

---

## 🌐 Internationalization (i18n)

AetherLake Control Panel is bilingual, supporting English (`en`) and Turkish (`tr`).

1. **Locales**: All UI text is structured in [control-panel/src/app/i18n.ts](file:///Users/mrtozkl/Documents/open-lake/control-panel/src/app/i18n.ts).
2. **Usage**:
   - Wrap views/components in the `LocaleProvider` context.
   - Use the `useLocale` hook to read the translation keys:
     ```tsx
     const { t } = useLocale();
     return <h1>{t.overview.title}</h1>;
     ```
3. **Requirement**: 
   > [!IMPORTANT]
   > Do **NOT** hardcode text strings inside component files. Always add corresponding keys to the translation dictionary in `i18n.ts` for both Turkish (`tr`) and English (`en`).
4. **Verification**: Run `npm test` to verify key parity between English and Turkish.

---

## 💅 Styling & Visual Standards

AetherLake uses a modern, dark-themed, glassmorphic design. Follow these standards:

- **Typography**: Clean, sans-serif font family defined in `layout.tsx`.
- **Theme**: Consistency in dark background palette (`bg-slate-950`, `bg-slate-900`, `border-slate-800`).
- **Glassmorphism**: Use backdrop filters for overlay panels (`backdrop-blur-md bg-slate-900/70 border border-slate-800`).
- **4-Card Metric Grids**: Maintain standardized KPI metric cards at the top of each view for quick operational insights.
- **Interactive States**: Always include hover and active states (transitions, subtle glows, scale changes) to make components feel responsive.
- **Animations**: Use `framer-motion` for page transitions, drawer slides, and modal reveals.

---

## ⚙️ Routing & Page Structure

1. **Pages (`src/app/`)**:
   - `/` - **Dashboard / Overview**: Cluster health KPI, quick launchpad, active services list, restart actions.
   - `/observability` - **Observability & Logs**: Live container log streaming (`follow=true`), Kubernetes events, pod CPU/RAM metrics.
   - `/tables` - **Iceberg Tables Explorer**: Schema inspector, snapshot commit history, partitions, live data preview via Trino.
   - `/query` - **SQL IDE**: Federated Trino queries with Monaco SQL editor, persistent history drawer, CSV/JSON export.
   - `/kafka` - **Kafka Management**: KRaft cluster readiness, broker list, topic inspector, shortcuts to SQL IDE and Flink Studio.
   - `/flink` - **Flink Streaming Studio**: Streaming templates, topic explorer, Monaco SQL runner, FlinkDeployment job status.
   - `/dbt` - **dbt Lakehouse Workspace**: React Flow DAG lineage canvas, Dagre auto-layout, Monaco model inspector, execution triggers.
   - `/polaris` - **Polaris Catalog Governance**: REST catalogs, namespaces, and client integration snippets (Trino, Spark, PyIceberg).
   - `/trino` - **Trino Management**: Configured catalogs, active workers, catalog configuration viewer, add-catalog wizard.

2. **API Routes (`src/app/api/`)**:
   - `/api/status` - Live platform pod health and component counts.
   - `/api/pods` - Pod listing, `/api/pods/logs` (streaming logs), `/api/pods/events` (cluster events).
   - `/api/query` - Trino SQL query execution engine.
   - `/api/iceberg` - Polaris metadata & table schema introspection.
   - `/api/kafka` - Strimzi Kafka topics and cluster status.
   - `/api/flink/jobs` - FlinkDeployment CRD management (submit, list, cancel).
   - `/api/dbt` - dbt models and lineage metadata.
   - `/api/telemetry` - Anonymous health telemetry opt-out & heartbeat status.
   - `/api/action` - Pod deletion / service restart triggers.

---

## 🚀 Testing & Build Verification

Always verify before committing:
```bash
cd control-panel
npm test         # Validates i18n key consistency, auth helpers, telemetry
npm run lint     # Next.js ESLint
npm run build    # Production bundle verification
```
