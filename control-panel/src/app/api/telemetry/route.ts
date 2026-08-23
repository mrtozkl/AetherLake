import { NextResponse } from "next/server";
import { getTelemetryStatus, sendTelemetryHeartbeat } from "../../lib/telemetry";

export async function GET() {
    try {
        const status = getTelemetryStatus();
        return NextResponse.json({
            status: "ok",
            data: status,
        });
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Failed to retrieve telemetry status";
        return NextResponse.json({ status: "error", error: errMsg }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const result = await sendTelemetryHeartbeat(body);
        return NextResponse.json({
            status: "ok",
            data: result,
        });
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Failed to trigger telemetry ping";
        return NextResponse.json({ status: "error", error: errMsg }, { status: 500 });
    }
}
