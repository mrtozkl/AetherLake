---
layout: home

hero:
  name: "AetherLake"
  text: "Open-Source Data Lakehouse"
  tagline: "Deploy a production-grade, fully integrated data stack on Kubernetes with a single helm install."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/mrtozkl/AetherLake

features:
  - title: 🏗️ Modular Design
    details: Enable or disable any component (Trino, Spark, Airflow, MinIO) via a single Helm value toggle.
  - title: 🔐 Secure by Default
    details: Centralized SSO with Keycloak and RBAC across all services out of the box.
  - title: 🎛️ Unified Control
    details: Manage the entire platform, run SQL queries, and monitor pods from the Next.js Control Panel.
---

<div style="margin-top: 3rem; display: flex; flex-direction: column; gap: 2rem; align-items: center;">
  <img src="/dashboard.png" alt="AetherLake Dashboard" style="border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);" />
  <img src="/observability.png" alt="AetherLake Observability — live pod logs, events, and metrics" style="border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);" />
</div>
