import test from "node:test";
import assert from "node:assert/strict";
import { TOOLS_DEFINITION, requireAirflowAuth, server } from "./index.ts";

test("mcp - server instance is initialized", () => {
    assert.ok(server, "MCP server instance must be defined");
});

test("mcp - TOOLS_DEFINITION registers all required tools", () => {
    const expectedTools = [
        "get_platform_status",
        "get_service_logs",
        "restart_service",
        "query_trino",
        "list_catalogs",
        "list_airflow_dags",
        "trigger_airflow_dag",
    ];

    const registeredToolNames = TOOLS_DEFINITION.map((t) => t.name);

    for (const expected of expectedTools) {
        assert.ok(
            registeredToolNames.includes(expected),
            `Expected tool '${expected}' to be registered in TOOLS_DEFINITION`
        );
    }

    assert.strictEqual(
        TOOLS_DEFINITION.length,
        expectedTools.length,
        `Tool count should match expected. Got ${TOOLS_DEFINITION.length}, expected ${expectedTools.length}`
    );
});

test("mcp - each tool defines a valid JSON schema with name and description", () => {
    for (const tool of TOOLS_DEFINITION) {
        assert.ok(tool.name && tool.name.trim().length > 0, "Tool name must not be empty");
        assert.ok(
            tool.description && tool.description.trim().length > 0,
            `Tool '${tool.name}' must have a description`
        );
        assert.strictEqual(
            tool.inputSchema.type,
            "object",
            `Tool '${tool.name}' inputSchema must be of type 'object'`
        );
        assert.ok(
            typeof tool.inputSchema.properties === "object",
            `Tool '${tool.name}' must have a properties object`
        );
    }
});

test("mcp - required tool arguments are properly enforced in schema", () => {
    const serviceLogs = TOOLS_DEFINITION.find((t) => t.name === "get_service_logs");
    assert.deepStrictEqual(serviceLogs?.inputSchema.required, ["service"]);

    const restartService = TOOLS_DEFINITION.find((t) => t.name === "restart_service");
    assert.deepStrictEqual(restartService?.inputSchema.required, ["serviceLabel"]);

    const queryTrino = TOOLS_DEFINITION.find((t) => t.name === "query_trino");
    assert.deepStrictEqual(queryTrino?.inputSchema.required, ["query"]);

    const triggerDag = TOOLS_DEFINITION.find((t) => t.name === "trigger_airflow_dag");
    assert.deepStrictEqual(triggerDag?.inputSchema.required, ["dag_id"]);
});

test("mcp - requireAirflowAuth enforces auth presence", () => {
    assert.throws(
        () => requireAirflowAuth(null),
        /AIRFLOW_AUTH env var is not set/
    );

    const validAuth = Buffer.from("admin:secret").toString("base64");
    assert.strictEqual(requireAirflowAuth(validAuth), validAuth);
});
