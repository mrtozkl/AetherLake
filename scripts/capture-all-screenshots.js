const path = require("path");
const DOCS_PUBLIC = path.resolve(__dirname, "../docs/public");
const { chromium } = require(path.resolve(__dirname, "../control-panel/node_modules/playwright"));

async function main() {
    console.log("📸 Starting screenshot capture...");
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

    // Mock API routes for Kafka and Flink to render populated, production UI
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

    // Capture Kafka and Flink pages
    console.log("📷 Capturing Kafka Management (/kafka) -> docs/public/kafka.png...");
    await page.goto("http://localhost:3000/kafka", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(DOCS_PUBLIC, "kafka.png"), fullPage: false });

    console.log("📷 Capturing Flink SQL Workspace (/flink) -> docs/public/flink.png...");
    await page.goto("http://localhost:3000/flink", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    // Click Load Kafka Example button so editor is filled with SQL code
    const loadExampleBtn = page.locator('button:has-text("Load Kafka Example")');
    if (await loadExampleBtn.isVisible()) {
        await loadExampleBtn.click();
        await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(DOCS_PUBLIC, "flink.png"), fullPage: false });

    console.log("📷 Capturing dbt Workspace (/dbt) -> docs/public/dbt.png...");
    await page.goto("http://localhost:3000/dbt", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(DOCS_PUBLIC, "dbt.png"), fullPage: false });

    await browser.close();
    console.log("✨ Screenshots captured successfully!");
}

main().catch((err) => {
    console.error("❌ Screenshot capture failed:", err);
    process.exit(1);
});
