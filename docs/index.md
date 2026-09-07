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

<div style="margin-top: 3rem; display: flex; flex-direction: column; gap: 2.5rem; align-items: center; max-width: 1152px; margin-left: auto; margin-right: auto;">
  <div style="width: 100%; text-align: center;">
    <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--vp-c-text-1);">Platform Overview & Central Operations</h3>
    <img src="/dashboard.png" alt="AetherLake Dashboard" style="border-radius: 10px; border: 1px solid var(--vp-c-divider); box-shadow: 0 8px 24px -4px rgb(0 0 0 / 0.25);" />
  </div>

  <div style="width: 100%; text-align: center;">
    <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--vp-c-text-1);">Workload Observability & Live Resource Metrics</h3>
    <img src="/observability.png" alt="AetherLake Observability — live pod logs, events, and metrics" style="border-radius: 10px; border: 1px solid var(--vp-c-divider); box-shadow: 0 8px 24px -4px rgb(0 0 0 / 0.25);" />
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem; width: 100%;">
    <div style="text-align: center;">
      <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--vp-c-text-1);">Iceberg Tables & Live Data Preview</h4>
      <img src="/tables.png" alt="Iceberg Tables Explorer" style="border-radius: 8px; border: 1px solid var(--vp-c-divider); box-shadow: 0 4px 12px rgb(0 0 0 / 0.15);" />
    </div>
    <div style="text-align: center;">
      <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--vp-c-text-1);">dbt Medallion Lineage DAG</h4>
      <img src="/dbt.png" alt="dbt Lakehouse Workspace" style="border-radius: 8px; border: 1px solid var(--vp-c-divider); box-shadow: 0 4px 12px rgb(0 0 0 / 0.15);" />
    </div>
  </div>
</div>
