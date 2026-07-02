# Third-Party Licenses

AetherLake's own code (Helm chart glue, the Control Panel, the MCP server,
pipelines, and install scripts) is licensed under the
[Business Source License 1.1](LICENSE).

AetherLake deploys a number of independent, upstream open-source projects as
unmodified containers/Helm charts. AetherLake does not vendor or modify their
source, so orchestrating them does not create a combined work — but each
component remains governed by **its own license**, and you are responsible
for complying with those licenses (and any commercial terms their vendors
require) independently of your AetherLake license.

| Component | License | Notes |
|---|---|---|
| Trino | Apache License 2.0 | |
| Apache Polaris | Apache License 2.0 | |
| Apache Airflow | Apache License 2.0 | |
| Apache Superset | Apache License 2.0 | |
| Apache Spark / Spark Operator | Apache License 2.0 | |
| Milvus | Apache License 2.0 | |
| Keycloak | Apache License 2.0 | |
| PostgreSQL | PostgreSQL License | Permissive, BSD-style |
| Redis | BSD-3-Clause | Verify the exact image tag you deploy — Redis moved to a dual RSALv2/SSPLv1 license starting with the 7.4/8.0 release line |
| **MinIO** | **GNU AGPLv3** | See below |

## A note on MinIO

MinIO has been licensed under the **GNU Affero General Public License v3
(AGPLv3)** since 2021, and MinIO Inc. has progressively restricted its free
community offering in favor of a commercial product ("AIStor"). AetherLake
deploys the unmodified upstream MinIO container, so **AetherLake does not
inherit any AGPL obligations from this** — running independent programs
together in a Kubernetes cluster is not a "combined work" under the AGPL.

However, this is independent of your AetherLake license. If you (or your
customers) modify MinIO, or offer a hosted/managed service built on it, that
usage is separately governed by MinIO's AGPLv3 terms — which generally
require you to make your modifications' source available to users of the
service — or by a commercial license purchased directly from MinIO Inc.

**A commercial license for AetherLake does not cover MinIO, or any other
third-party component listed above.** It only grants rights to AetherLake's
own code. Plan accordingly if you intend to offer AetherLake as a hosted or
paid service.

For questions about AetherLake's own commercial licensing, contact
murat.ozkl@gmail.com.
