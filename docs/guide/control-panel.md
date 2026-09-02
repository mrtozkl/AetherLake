# Control Panel

The Control Panel is a **Next.js 16** web application that serves as the unified management interface for the entire platform.

![Control Panel — Platform Overview](/dashboard.png)

## Features

- **Platform Overview** — Real-time pod status monitoring with auto-refresh; the Kafka card links straight to the Kafka view
- **Kafka** — Cluster status/version, broker health, and topic details (partitions, replicas, config, reconciliation conditions)
- **Flink SQL** — Write Flink SQL in a Monaco editor with a Kafka topic explorer, submit jobs, track and cancel them
- **Observability** — Pod log viewer (live tail), Kubernetes events, and per-pod CPU/RAM metrics
- **Iceberg Tables** — Browse Polaris namespaces, table schemas, partitions, and snapshot history
- **Trino Management** — Create, delete, and configure SQL catalogs (Iceberg, Hive, PostgreSQL, MySQL)
- **Polaris Management** — Manage Iceberg REST catalogs and namespaces
- **SQL IDE** — Browser-based SQL editor with Monaco Editor, schema explorer, and query results
- **Service Actions** — Restart services directly from the dashboard
- **SSO Integration** — Keycloak OIDC and credentials-based authentication
- **Internationalization** — English and Turkish support with runtime switching

## Observability

![Observability — live pod logs](/observability.png)
![Observability — metrics & details](/observability-details.png)

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

## Kafka

![Kafka management](/kafka.png)

The **Kafka** page (`/kafka`) reads the Strimzi custom resources through
`/api/kafka` and shows:

- **Cluster status** — the `Kafka` CR state, Kafka version, and reconciliation
  conditions reported by the Strimzi operator.
- **Broker health** — the dual-role node pool (controller + broker) with pod
  status.
- **Topics** — every `KafkaTopic` with partitions, replicas, config and its
  reconciliation conditions.

See [Kafka — Streaming](./components/kafka) for the cluster itself and
external (SCRAM-authenticated) access.

## Flink SQL

![Flink SQL workspace](/flink.png)

The **Flink** page (`/flink`) is a workspace for Flink SQL jobs:

- **Topic explorer** — lists Kafka topics; clicking one inserts a Kafka
  source-table template into the editor.
- **Monaco editor** — write the SQL (`SET` statements and
  `EXECUTE STATEMENT SET` are supported).
- **Submit** — creates a ConfigMap with the script plus one application-mode
  `FlinkDeployment` (an isolated mini-cluster per job) using the
  `aetherlake/flink-sql-runner:flink-2.1` image built by `install.sh`.
- **Jobs list** — live status for every submitted job; cancelling deletes the
  `FlinkDeployment` and its SQL ConfigMap.

Ready-made scripts to try live in `pipelines/flink/examples/`
(datagen → Kafka, Kafka → Iceberg lakehouse bridge, Kafka → print). Platform
credentials (`POLARIS_CREDENTIAL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`) are
automatically injected into job pods and resolved via `${ENV:...}` placeholders.
Full reference: [Flink — Stream Processing](./components/flink).

## dbt Workspace & Lineage

![dbt Lakehouse Workspace](/dbt.png)

The **dbt** workspace (`/dbt`) provides visual management and monitoring for
Lakehouse data transformations:

- **Interactive Lineage DAG** — scalable React Flow canvas spanning Bronze sources,
  Silver curated tables, and Gold analytics marts with directional Bezier curves, arrowheads,
  animated upstream (blue) and downstream (emerald) flow pulses, Dagre auto-layout,
  interactive radar minimap, focus mode, and fullscreen view.
- **Model Explorer & Inspector** — inspect model metadata, tags, partitioning specs,
  raw Jinja SQL, and compiled Trino SQL in an embedded Monaco editor.
- **Dependencies Explorer** — inspect upstream parents and downstream children with clickable navigation.
- **Data Quality & Tests** — review column-level schema definitions and assertions
  (`unique`, `not_null`, `accepted_values`).
- **Run & Test Actions** — trigger `dbt run` and `dbt test` directly against the
  Trino cluster and view live execution logs and durations.

Full reference: [dbt — Data Transformations](./components/dbt).

## SQL IDE

![SQL IDE](/ide.png)

The **SQL IDE** is a browser-based SQL editor built on Monaco Editor, with a
schema explorer for browsing catalogs, schemas, and tables, plus a results
grid for query output. It talks to Trino directly, so any catalog Trino can
see (Iceberg, Kafka, Hive, PostgreSQL, MySQL) is queryable from the same
editor — including streamed data:

```sql
SELECT * FROM kafka.aetherlake.events LIMIT 10;
```

**Queries run as you, not as a shared app user.** For Keycloak logins the
panel forwards your own access token and Trino executes the statement under
your username (JWT verification); for the local dev login it authenticates as
the matching dev user. The toolbar shows the identity ("Executed as …"), and
Trino's role-based access control decides what you can do:

- the schema explorer lists only catalogs/schemas/tables your role may touch
  (`SHOW …` is filtered server-side);
- `data-scientist` runs SELECTs but gets *Access Denied* on writes and the
  `system` catalog; `data-engineer` can create/drop Iceberg tables;
  `data-admin` has full access.

All Trino calls go over TLS (port 8443); the panel verifies the AetherLake
CA automatically — from `control-panel/.ca/aetherlake-ca.crt` locally (exported
by `install.sh`) or from the `aetherlake-ca` ConfigMap in-cluster.

See [Trino — Authentication & Authorization](./components/trino#authentication-every-query-runs-as-a-real-user).

## Trino Management

![Trino catalogs](/trino.png)

The **Trino Management** page lists configured SQL catalogs and lets you
create, delete, or reconfigure them (Iceberg, Hive, PostgreSQL, MySQL)
without editing Helm values by hand.

## Polaris Management

![Apache Polaris catalogs](/polaris.png)

The **Polaris Management** page lists and manages Iceberg REST catalogs and
namespaces registered with Apache Polaris, including creating new catalogs
straight from the UI.

## Iceberg Tables

![Iceberg table explorer](/tables.png)

The **Iceberg Tables** page is a read-only explorer over the Polaris Iceberg REST
catalog:

- **Namespace / table tree** — Expand a namespace to list its tables.
- **Overview** — Row count, data-file count, total size, and Iceberg format
  version for the current snapshot.
- **Schema** — Columns with their Iceberg types and required flags.
- **Partitions** — Partition fields with their transform and source column.
- **Snapshots** — Snapshot history (operation, added rows, commit time), with the
  current snapshot flagged.
- **Properties** — Raw table properties.

It reads from Polaris via the bootstrap client credentials, so it works whether
you signed in with Keycloak SSO or the local `admin` account.

::: tip Demo dataset
A fresh install seeds a small demo dataset — `iceberg.demo.events` (partitioned by
`event_type`) and `iceberg.demo.users` — via a post-install hook, so this page and
the SQL IDE have something to show out of the box. Disable it with
`--set demoData.enabled=false`.
:::

## Running locally

If you want to run the Control Panel locally outside of the Kubernetes cluster:

```bash
cd control-panel
npm install
npm run dev
# -> http://localhost:3000
```
