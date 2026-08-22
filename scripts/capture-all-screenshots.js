const path = require("path");
const fs = require("fs");
const DOCS_PUBLIC = path.resolve(__dirname, "../docs/public");
const ASSETS_DIR = path.resolve(__dirname, "../assets");
const { chromium } = require(path.resolve(__dirname, "../control-panel/node_modules/playwright"));

async function main() {
    console.log("📸 Starting comprehensive screenshot capture...");
    const browser = await chromium.launch({
        channel: "chrome",
        headless: true,
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2, // High-DPI / Retina quality
        colorScheme: "dark",
    });

    const page = await context.newPage();

    // Mock API routes for fully populated, production UI screenshots
    await page.route("**/api/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                "MinIO Storage": "Healthy",
                "Trino Analytics": "Healthy",
                "Apache Airflow": "Healthy",
                "Apache Superset": "Healthy",
                "Milvus Vector Search": "Healthy",
                "Apache Polaris": "Healthy",
                "Apache Kafka": "Healthy",
                "Apache Flink": "Healthy",
                "Keycloak": "Healthy",
            }),
        });
    });

    await page.route("**/api/kafka", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                cluster: {
                    name: "aetherlake",
                    ready: true,
                    kafkaVersion: "4.3.0 (KRaft)",
                    bootstrapServers: "aetherlake-kafka-bootstrap:9092",
                    listeners: [
                        { name: "plain", type: "internal", port: 9092 },
                        { name: "external", type: "nodeport (TLS + SCRAM-SHA-512)", port: 9094 },
                    ],
                    conditions: [
                        {
                            type: "Ready",
                            status: "True",
                            lastTransitionTime: "2026-08-21T18:00:00Z",
                            message: "Cluster is healthy, all brokers operational.",
                        },
                    ],
                },
                brokers: [
                    {
                        name: "aetherlake-kafka-0 (controller + broker)",
                        ready: true,
                        restarts: 0,
                        nodeId: "0",
                    },
                ],
                topics: [
                    {
                        name: "events",
                        partitions: 3,
                        replicas: 1,
                        ready: true,
                        message: "Topic created and ready for streaming",
                        config: {
                            "cleanup.policy": "delete",
                            "min.insync.replicas": "1",
                            "retention.ms": "604800000",
                        },
                    },
                    {
                        name: "telemetry",
                        partitions: 2,
                        replicas: 1,
                        ready: true,
                        message: "Topic ready",
                        config: {
                            "cleanup.policy": "delete",
                            "retention.ms": "86400000",
                        },
                    },
                ],
            }),
        });
    });

    await page.route("**/api/flink/jobs", async (route) => {
        if (route.request().method() === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    jobs: [
                        {
                            name: "kafka-to-iceberg",
                            state: "RUNNING",
                            lifecycle: "DEPLOYED",
                            startTime: Date.now() - 3600000,
                            jobId: "c8e19f7a2d4b60128e45a90123456789",
                            parallelism: 1,
                            error: null,
                        },
                        {
                            name: "datagen-to-kafka",
                            state: "RUNNING",
                            lifecycle: "DEPLOYED",
                            startTime: Date.now() - 7200000,
                            jobId: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
                            parallelism: 1,
                            error: null,
                        },
                    ],
                }),
            });
        } else {
            await route.continue();
        }
    });

    console.log("🔑 Navigating to http://localhost:3000/ to authenticate...");
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });

    // Check if sign-in form is present
    const usernameInput = page.locator('input[name="username"]');
    if (await usernameInput.isVisible()) {
        console.log("🔐 Logging in with dev credentials (admin/admin)...");
        await usernameInput.fill("admin");
        await page.locator('input[name="password"]').fill("admin");
        await page.locator('button[type="submit"]').click();
        await page.waitForTimeout(3000);
        await page.waitForLoadState("networkidle");
    }

    const capturePage = async (routePath, filename, prepareFn) => {
        console.log(`📷 Capturing ${routePath} -> ${filename}...`);
        await page.goto(`http://localhost:3000${routePath}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1500);
        if (prepareFn) await prepareFn(page);
        await page.waitForTimeout(1000);
        const docsPath = path.join(DOCS_PUBLIC, filename);
        const assetsPath = path.join(ASSETS_DIR, filename);
        await page.screenshot({ path: docsPath, fullPage: false });
        fs.copyFileSync(docsPath, assetsPath);
        console.log(`   ✓ Saved to ${docsPath} and ${assetsPath}`);
    };

    // 1. Overview Dashboard
    await capturePage("/", "dashboard.png");

    // 2. Kafka Management
    await capturePage("/kafka", "kafka.png");

    // 3. Flink SQL Workspace
    await capturePage("/flink", "flink.png", async (p) => {
        const loadExampleBtn = p.locator('button:has-text("Load Kafka Example")');
        if (await loadExampleBtn.isVisible()) {
            await loadExampleBtn.click();
            await p.waitForTimeout(1000);
        }
    });

    // 4. dbt Lakehouse Workspace
    await capturePage("/dbt", "dbt.png");

    await browser.close();
    console.log("✨ All target screenshots updated successfully!");
}

main().catch((err) => {
    console.error("❌ Screenshot capture failed:", err);
    process.exit(1);
});
