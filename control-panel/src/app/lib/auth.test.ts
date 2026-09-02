import test from "node:test";
import assert from "node:assert/strict";
import { authOptions, requireInProduction } from "./auth.ts";

test("auth - requireInProduction returns value when provided", () => {
    const result = requireInProduction("custom-secret", "TEST_SECRET", "fallback-secret");
    assert.strictEqual(result, "custom-secret");
});

test("auth - requireInProduction returns fallback in non-production", () => {
    // In test environment, NODE_ENV is not 'production'
    const result = requireInProduction(undefined, "TEST_SECRET", "fallback-secret");
    assert.strictEqual(result, "fallback-secret");
});

test("auth - authOptions defines required providers and callbacks", () => {
    assert.ok(authOptions.providers, "Providers must be defined");
    assert.ok(Array.isArray(authOptions.providers), "Providers must be an array");
    assert.ok(authOptions.callbacks?.jwt, "JWT callback must be defined");
    assert.ok(authOptions.callbacks?.session, "Session callback must be defined");
});
