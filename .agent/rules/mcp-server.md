# 🤖 MCP Server Development Standards

This document defines guidelines for expanding, modifying, and debugging the AetherLake Model Context Protocol (MCP) Server.

---

## 🏗️ Architecture & Stack

- **Standard**: Model Context Protocol (MCP) v1.x (Stdio transport client-server integration)
- **Library**: `@modelcontextprotocol/sdk`
- **Kubernetes Client**: `@kubernetes/client-node`
- **Runtime**: Node.js ESM (`type: module` in `package.json`)
- **Language**: TypeScript

---

## 🛠️ MCP Tool Specifications

Any new tools registered on the server must conform to these conventions:

1. **Self-Documenting Input Schemas**: Every tool must define a strict JSON Schema detailing all input parameters, parameter types, descriptions, and list required fields.
2. **Standard Response Structure**: Use the MCP SDK response format (returning `{ content: [{ type: "text", text: ... }] }` or objects).
3. **Error Reporting**: Do **not** let the server crash on tool failures. Catch errors, format the error messages descriptively, and return them as plain text responses so the AI client can diagnose the issue.

---

## 🔒 Security & Logging

- **Console Pollution**: 
  > [!CAUTION]
  > Because the MCP Server communicates with AI assistants via standard input/output (`stdio`), you must **NEVER** use `console.log` for debugging statements. Use `console.error` or specific logging utilities to avoid corrupting the MCP JSON-RPC protocol packets.
- **Sensitive Data**: Strip authorization headers, API keys, or raw secret values from tool output payloads before transmitting them to the client.

---

## 🚀 Build and Test Workflows

1. **Compilation**: Run TypeScript compiler before launching:
   ```bash
   cd mcp-server
   npm run build
   ```
2. **Locally Testing Execution**: Use `ts-node` or node to start the server:
   ```bash
   npm run dev
   # or
   npm run start
   ```
3. **Claude Config**: Ensure paths are correct in your client configuration file.
