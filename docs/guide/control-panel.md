# Control Panel

The Control Panel is a **Next.js 16** web application that serves as the unified management interface for the entire platform.

![Control Panel — Platform Overview](/dashboard.png)

## Features

- **Platform Overview** — Real-time pod status monitoring with auto-refresh
- **Observability** — Pod log viewer (live tail), Kubernetes events, and per-pod CPU/RAM metrics
- **Trino Management** — Create, delete, and configure SQL catalogs (Iceberg, Hive, PostgreSQL, MySQL)
- **Polaris Management** — Manage Iceberg REST catalogs and namespaces
- **SQL IDE** — Browser-based SQL editor with Monaco Editor, schema explorer, and query results
- **Service Actions** — Restart services directly from the dashboard
- **SSO Integration** — Keycloak OIDC and credentials-based authentication
- **Internationalization** — English and Turkish support with runtime switching

## Observability

![Observability — live pod logs](/observability.png)

The **Observability** page surfaces cluster introspection for every service in the
`aetherlake` namespace, without leaving the Control Panel:

- **Pod logs** — Select a pod (optionally filtered by service) and stream its logs
  live (`follow`), or load a snapshot of the last *N* lines. Includes a container
  selector, tail-line control, client-side search/filter, clear, and **download**
  as a `.log` file.
- **Events** — Recent Kubernetes events for the selected pod, newest first, with
  `Warning` events highlighted.
- **Details** — Per-pod container states, images, restart counts, node, pod IP,
  and labels.
- **Resource metrics** — Per-pod CPU and memory usage, shown live in the pod list
  and the detail cards.

### Requirements

The CPU/RAM figures are read from the Kubernetes Metrics API, so the cluster needs
[metrics-server](https://github.com/kubernetes-sigs/metrics-server) installed. On
Docker Desktop the kubelet serving certificate is self-signed, so install it with
the `--kubelet-insecure-tls` flag:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

The logs, events, and details still work without metrics-server — only the usage
numbers are hidden, and the page shows a notice.

## Running locally

If you want to run the Control Panel locally outside of the Kubernetes cluster:

```bash
cd control-panel
npm install
npm run dev
# -> http://localhost:3000
```
