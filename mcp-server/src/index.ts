import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as k8s from "@kubernetes/client-node";
import axios from "axios";

// Environment variables or defaults (assuming running in a cluster or local with port-forwarding)
const NAMESPACE = process.env.AETHERLAKE_NAMESPACE || "aetherlake";
const TRINO_URL = process.env.TRINO_URL || "http://trino.aetherlake.local";
const POLARIS_URL = process.env.POLARIS_URL || "http://polaris.aetherlake.local";
const AIRFLOW_URL = process.env.AIRFLOW_URL || "http://airflow.aetherlake.local";
// Airflow API credentials must be supplied explicitly ("user:password") — a
// baked-in default like admin:admin would silently work against misconfigured
// deployments. Airflow tools return a clear error when unset.
const AIRFLOW_AUTH = process.env.AIRFLOW_AUTH
  ? Buffer.from(process.env.AIRFLOW_AUTH).toString("base64")
  : null;

function requireAirflowAuth(): string {
  if (!AIRFLOW_AUTH) {
    throw new Error("AIRFLOW_AUTH env var is not set (expected format: user:password)");
  }
  return AIRFLOW_AUTH;
}

// "user:pass" for the basic-auth gate on the Trino ingress (user: trino,
// password in the aetherlake-credentials secret, key trino-ingress-password).
// Leave unset when TRINO_URL points at the in-cluster service directly.
const TRINO_AUTH_HEADER: Record<string, string> = process.env.TRINO_BASIC_AUTH
  ? { Authorization: `Basic ${Buffer.from(process.env.TRINO_BASIC_AUTH).toString("base64")}` }
  : {};

// Kubernetes setup
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

// Initialize MCP Server
const server = new Server(
  {
    name: "AetherLake-MCP",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_platform_status",
        description: "Get the current running status of all AetherLake components in the Kubernetes cluster.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_service_logs",
        description: "Retrieve recent logs for a specific AetherLake service (e.g., trino, minio, airflow).",
        inputSchema: {
          type: "object",
          properties: {
            service: { type: "string", description: "Name of the service (e.g., 'core-data-stack-trino', 'minio', 'airflow')" },
            lines: { type: "number", description: "Number of recent log lines to fetch (default: 100)" }
          },
          required: ["service"],
        },
      },
      {
        name: "restart_service",
        description: "Restart a specific AetherLake service by deleting its pods. Kubernetes will automatically recreate them.",
        inputSchema: {
          type: "object",
          properties: {
            serviceLabel: { type: "string", description: "The label selector for the service (e.g., 'app.kubernetes.io/name=trino')" }
          },
          required: ["serviceLabel"],
        },
      },
      {
        name: "query_trino",
        description: "Execute a SQL query against the Trino engine to access data in the AetherLake.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The SQL query to execute" }
          },
          required: ["query"],
        },
      },
      {
        name: "list_catalogs",
        description: "List available data catalogs using the Apache Polaris REST API.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_airflow_dags",
        description: "List all Airflow DAGs (Data Pipelines).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "trigger_airflow_dag",
        description: "Trigger a specific Airflow DAG.",
        inputSchema: {
          type: "object",
          properties: {
            dag_id: { type: "string", description: "The ID of the DAG to trigger" }
          },
          required: ["dag_id"],
        },
      }
    ],
  };
});

// Implement Tool Handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "get_platform_status": {
        const res = await k8sApi.listNamespacedPod({ namespace: NAMESPACE });
        const statuses = res.items.map(pod => ({
          name: pod.metadata?.name,
          phase: pod.status?.phase,
          startTime: pod.status?.startTime
        }));
        return { content: [{ type: "text", text: JSON.stringify(statuses, null, 2) }] };
      }

      case "get_service_logs": {
        const { service, lines = 100 } = request.params.arguments as any;
        const podList = await k8sApi.listNamespacedPod({ namespace: NAMESPACE });
        const targetPod = podList.items.find(p => p.metadata?.name?.includes(service));
        
        if (!targetPod || !targetPod.metadata?.name) {
          return { content: [{ type: "text", text: `No pod found matching service: ${service}` }] };
        }
        
        const logs = await k8sApi.readNamespacedPodLog({
          name: targetPod.metadata.name,
          namespace: NAMESPACE,
          tailLines: lines
        });
        return { content: [{ type: "text", text: logs as unknown as string }] };
      }

      case "restart_service": {
        const { serviceLabel } = request.params.arguments as any;
        const res = await k8sApi.deleteCollectionNamespacedPod({
          namespace: NAMESPACE,
          labelSelector: serviceLabel
        });
        return { content: [{ type: "text", text: `Restart triggered for pods matching ${serviceLabel}` }] };
      }

      case "query_trino": {
        const { query } = request.params.arguments as any;
        // Note: In a real environment, you'd use a Trino driver or poll the REST API properly.
        // For MCP simplicity, we are hitting the v1/statement endpoint and just fetching the first chunk.
        const response = await axios.post(`${TRINO_URL}/v1/statement`, query, {
          headers: { 'X-Trino-User': 'aetherlake-mcp', 'Content-Type': 'text/plain', ...TRINO_AUTH_HEADER }
        });
        
        // Polling logic for Trino query execution
        let nextUri = response.data?.nextUri;
        let data = response.data?.data || [];
        let columns = response.data?.columns || [];
        
        while (nextUri) {
          await new Promise(r => setTimeout(r, 500));
          const nextRes = await axios.get(nextUri, { headers: { ...TRINO_AUTH_HEADER } });
          if (nextRes.data?.data) data.push(...nextRes.data.data);
          if (nextRes.data?.columns && columns.length === 0) columns = nextRes.data.columns;
          nextUri = nextRes.data?.nextUri;
        }

        return { content: [{ type: "text", text: JSON.stringify({ columns, data }, null, 2) }] };
      }

      case "list_catalogs": {
        try {
          const response = await axios.get(`${POLARIS_URL}/api/catalog`, {
            headers: { 'Authorization': `Bearer ${process.env.POLARIS_TOKEN || ''}` }
          });
          return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Polaris API error: ${e.message}` }] };
        }
      }

      case "list_airflow_dags": {
        try {
          const response = await axios.get(`${AIRFLOW_URL}/api/v1/dags`, {
            headers: { 'Authorization': `Basic ${requireAirflowAuth()}` }
          });
          return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Airflow API error: ${e.message}` }] };
        }
      }

      case "trigger_airflow_dag": {
        try {
          const { dag_id } = request.params.arguments as any;
          const response = await axios.post(`${AIRFLOW_URL}/api/v1/dags/${encodeURIComponent(dag_id)}/dagRuns`, {}, {
            headers: { 'Authorization': `Basic ${requireAirflowAuth()}`, 'Content-Type': 'application/json' }
          });
          return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Airflow API error: ${e.message}` }] };
        }
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${request.params.name}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AetherLake MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
