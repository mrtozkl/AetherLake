---
layout: home

hero:
  name: "AetherLake"
  text: "Open-Source Data Lakehouse"
  tagline: "Storage, catalog, query, streaming, BI and identity — deploy the whole platform on Kubernetes with a single helm install."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/mrtozkl/AetherLake

features:
  - title: 🏗️ Modular Design
    details: Enable or disable any component (Trino, Spark, Airflow, Kafka, Flink, MinIO…) via a single Helm value toggle.
  - title: 🔐 Secure by Default
    details: One Keycloak login for every UI — native OIDC where it exists, an oauth2-proxy SSO gate where it doesn't — plus random per-install secrets.
  - title: 🌊 Streaming Included
    details: Apache Kafka (Strimzi, KRaft) with Flink SQL jobs, and topics queryable as SQL tables through the Trino kafka catalog.
  - title: 🧊 Open Lakehouse
    details: Iceberg tables on S3-compatible MinIO, Apache Polaris REST catalog with credential vending, federated SQL via Trino.
  - title: 🎛️ Unified Control
    details: Manage the platform, write Flink SQL, browse Kafka topics, run Trino queries and watch pod logs from the Next.js Control Panel (EN/TR).
  - title: 🤖 Agent Ready
    details: A built-in MCP server lets AI assistants check status, query Trino and manage catalogs and pipelines.
---

<div style="margin-top: 3rem; display: flex; flex-direction: column; gap: 2rem; align-items: center;">
  <img src="/dashboard.png" alt="AetherLake Dashboard" style="border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);" />
  <img src="/observability.png" alt="AetherLake Observability — live pod logs, events, and metrics" style="border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);" />
</div>
