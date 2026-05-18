# Control Panel

The Control Panel is a **Next.js 16** web application that serves as the unified management interface for the entire platform.

## Features

- **Platform Overview** — Real-time pod status monitoring with auto-refresh
- **Trino Management** — Create, delete, and configure SQL catalogs (Iceberg, Hive, PostgreSQL, MySQL)
- **Polaris Management** — Manage Iceberg REST catalogs and namespaces
- **SQL IDE** — Browser-based SQL editor with Monaco Editor, schema explorer, and query results
- **Service Actions** — Restart services directly from the dashboard
- **SSO Integration** — Keycloak OIDC and credentials-based authentication
- **Internationalization** — English and Turkish support with runtime switching

## Running locally

If you want to run the Control Panel locally outside of the Kubernetes cluster:

```bash
cd control-panel
npm install
npm run dev
# -> http://localhost:3000
```
