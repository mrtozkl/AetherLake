import test from "node:test";
import assert from "node:assert/strict";
import { getAnonymousClusterId, detectCloudProvider } from "./telemetry.ts";

test("telemetry - getAnonymousClusterId returns deterministic format", () => {
    const clusterId = getAnonymousClusterId();
    assert.ok(typeof clusterId === "string", "Cluster ID must be a string");
    assert.ok(clusterId.startsWith("cl-"), `Cluster ID must start with 'cl-', got: ${clusterId}`);
    assert.ok(clusterId.length > 5, "Cluster ID must have reasonable length");
});

test("telemetry - detectCloudProvider respects valid environment override", () => {
    const original = process.env.CLOUD_PROVIDER;
    try {
        process.env.CLOUD_PROVIDER = "aws";
        assert.strictEqual(detectCloudProvider(), "aws");

        process.env.CLOUD_PROVIDER = "gcp";
        assert.strictEqual(detectCloudProvider(), "gcp");
    } finally {
        if (original !== undefined) {
            process.env.CLOUD_PROVIDER = original;
        } else {
            delete process.env.CLOUD_PROVIDER;
        }
    }
});
