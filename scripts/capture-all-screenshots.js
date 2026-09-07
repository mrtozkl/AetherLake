const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");
const DOCS_PUBLIC = path.resolve(__dirname, "../docs/public");
const ASSETS_DIR = path.resolve(__dirname, "../assets");
const { chromium } = require(path.resolve(__dirname, "../control-panel/node_modules/playwright"));

function checkServer() {
    return new Promise((resolve) => {
        const req = http.get("http://localhost:3000", (res) => {
            resolve(true);
        });
        req.on("error", () => resolve(false));
        req.setTimeout(1500, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function main() {
    console.log("📸 Starting comprehensive live enterprise screenshot capture (zero mocks)...");

    let serverProc = null;
    const isUp = await checkServer();
    if (!isUp) {
        console.log("🚀 Starting Next.js dev server on port 3000...");
        serverProc = spawn("npx", ["next", "dev", "-p", "3000"], {
            cwd: path.resolve(__dirname, "../control-panel"),
            env: {
                ...process.env,
                PORT: "3000",
                NEXTAUTH_SECRET: "aetherlake-dev-secret-key-32-chars-long!",
                NODE_ENV: "development",
            },
            stdio: "pipe",
        });

        let ready = false;
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            if (await checkServer()) {
                ready = true;
                break;
            }
        }
        if (!ready) {
            if (serverProc) serverProc.kill();
            throw new Error("Could not start Next.js server on port 3000");
        }
        console.log("   ✓ Next.js server is responsive!");
    } else {
        console.log("   ✓ Using existing Next.js server on port 3000");
    }

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

    // Authenticate with live Control Panel via NextAuth credentials (zero mocks)
    console.log("🔐 Authenticating on live Control Panel via NextAuth credentials...");
    await page.goto("http://localhost:3000/");
    await page.waitForSelector("input[name=\"username\"]", { timeout: 15000 });
    await page.locator("input[name=\"username\"]").fill("admin");
    await page.locator("input[name=\"password\"]").fill("admin");
    await page.locator("button[type=\"submit\"]").click();
    await page.waitForSelector("text=Trino Analytics", { timeout: 20000 });
    console.log("   ✓ Successfully authenticated with live cluster as admin!");

    const capturePage = async (routePath, filename, prepareFn) => {
        console.log(`📷 Capturing ${routePath} -> ${filename}...`);
        await page.goto(`http://localhost:3000${routePath}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);
        if (prepareFn) await prepareFn(page);
        await page.waitForTimeout(1500);
        const docsPath = path.join(DOCS_PUBLIC, filename);
        const assetsPath = path.join(ASSETS_DIR, filename);
        await page.screenshot({ path: docsPath, fullPage: false });
        fs.copyFileSync(docsPath, assetsPath);
        console.log(`   ✓ Saved to ${docsPath} and ${assetsPath}`);
    };

    try {
        // 1. Overview Dashboard
        await capturePage("/", "dashboard.png");

        // 2. Iceberg Tables Explorer (with Data Preview active)
        await capturePage("/tables", "tables.png", async (p) => {
            try {
                await p.waitForSelector("button:has-text('demo')", { timeout: 8000 });
                const demoBtn = p.locator("button:has-text('demo')").first();
                if (await demoBtn.isVisible()) await demoBtn.click();
                await p.waitForTimeout(800);

                const eventsBtn = p.locator("button:has-text('events')").first();
                if (await eventsBtn.isVisible()) await eventsBtn.click();
                await p.waitForTimeout(1000);

                const previewTab = p.locator("button:has-text('Data Preview'), button:has-text('Veri Önizleme')").first();
                if (await previewTab.isVisible()) {
                    await previewTab.click();
                    await p.waitForTimeout(2000);
                }
            } catch (err) {
                console.log("   (tables interact note: " + err.message + ")");
            }
        });

        // 3. SQL IDE (running real query with real data results)
        await capturePage("/query?sql=SELECT%20id%2C%20event_type%2C%20user_id%2C%20amount%2C%20created_at%20FROM%20iceberg.demo.events%20LIMIT%2010", "ide.png", async (p) => {
            try {
                const runBtn = p.locator("button:has-text('Run Query'), button:has-text('Sorgu Çalıştır')").first();
                if (await runBtn.isVisible()) {
                    await runBtn.click();
                    await p.waitForTimeout(3500);
                }
            } catch (err) {
                console.log("   (query interact note: " + err.message + ")");
            }
        });

        // 4. Kafka Management
        await capturePage("/kafka", "kafka.png");

        // 5. Flink SQL Workspace
        await capturePage("/flink", "flink.png", async (p) => {
            try {
                const templatePill = p.locator("button:has-text('Kafka → Iceberg')").first();
                if (await templatePill.isVisible()) {
                    await templatePill.click();
                    await p.waitForTimeout(1000);
                }
            } catch (err) {
                console.log("   (flink interact note: " + err.message + ")");
            }
        });

        // 6. Apache Polaris (Client Snippets tab active)
        await capturePage("/polaris", "polaris.png", async (p) => {
            try {
                const snippetsTab = p.locator("button:has-text('Client Snippets'), button:has-text('İstemci Kodları')").first();
                if (await snippetsTab.isVisible()) {
                    await snippetsTab.click();
                    await p.waitForTimeout(1000);
                }
            } catch (err) {
                console.log("   (polaris interact note: " + err.message + ")");
            }
        });

        // 7. Trino Management
        await capturePage("/trino", "trino.png");

        // 8. Observability & Live Logs
        await capturePage("/observability", "observability.png", async (p) => {
            try {
                const podItem = p.locator("button:has-text('trino-coordinator')").first();
                if (await podItem.isVisible()) {
                    await podItem.click();
                    await p.waitForTimeout(2000);
                }
            } catch (err) {
                console.log("   (observability interact note: " + err.message + ")");
            }
        });

        // 9. Observability Details
        await capturePage("/observability", "observability-details.png", async (p) => {
            try {
                const podItem = p.locator("button:has-text('trino-coordinator')").first();
                if (await podItem.isVisible()) await podItem.click();
                await p.waitForTimeout(800);

                const detailsTab = p.locator("button:has-text('Details'), button:has-text('Detaylar')").first();
                if (await detailsTab.isVisible()) {
                    await detailsTab.click();
                    await p.waitForTimeout(1500);
                }
            } catch (err) {
                console.log("   (observability-details interact note: " + err.message + ")");
            }
        });

        // 10. dbt Lakehouse Workspace
        await capturePage("/dbt", "dbt.png", async (p) => {
            try {
                await p.waitForSelector(".react-flow__node", { timeout: 15000 });
                await p.waitForTimeout(1000);
                const fitBtn = p.locator(".react-flow__controls-fitview").first();
                if (await fitBtn.isVisible()) await fitBtn.click();
                await p.waitForTimeout(800);

                const node = p.locator('.react-flow__node:has-text("fct_event_summary")').first();
                if (await node.isVisible()) {
                    await node.click();
                    await p.waitForTimeout(1200);
                }
            } catch (err) {
                console.log("   (dbt interact note: " + err.message + ")");
            }
        });

        console.log("✨ All 10 target enterprise screenshots captured with LIVE data successfully!");
    } finally {
        await browser.close();
        if (serverProc) {
            console.log("🛑 Terminating Next.js server child process...");
            serverProc.kill();
        }
    }
}

main().catch((err) => {
    console.error("❌ Screenshot capture failed:", err);
    process.exit(1);
});
