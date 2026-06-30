"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import {
    Activity, RefreshCw, Loader2, ScrollText, AlertTriangle,
    Box, Cpu, MemoryStick, Server, Download, Trash2, Play, Pause,
    Search, ChevronDown, Info, ListTree, Circle
} from "lucide-react";

const SERVICES = [
    "MinIO Storage", "Trino Analytics", "Apache Airflow", "Apache Superset",
    "Milvus Vector Search", "Apache Polaris", "Keycloak",
];

type Tab = "logs" | "events" | "details";

interface Container {
    name: string; image: string; ready: boolean; restartCount: number;
    state: string; reason: string | null; startedAt: string | null;
}
interface Pod {
    name: string; phase: string; ready: number; total: number; restarts: number;
    node: string | null; podIP: string | null; startTime: string | null; createdAt: string | null;
    labels: Record<string, string>; usage: { cpuMilli: number; memBytes: number } | null;
    containers: Container[];
}
interface K8sEvent {
    type: string; reason: string; message: string; object: string;
    count: number; firstTimestamp: string | null; lastTimestamp: string | null;
}

const MAX_LOG_CHARS = 1_000_000;

function age(ts: string | null): string {
    if (!ts) return "—";
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
}
function fmtCpu(milli?: number): string {
    if (milli == null) return "—";
    return milli >= 1000 ? `${(milli / 1000).toFixed(2)}` : `${Math.round(milli)}m`;
}
function fmtMem(bytes?: number): string {
    if (bytes == null) return "—";
    const mi = bytes / (1024 * 1024);
    return mi >= 1024 ? `${(mi / 1024).toFixed(2)}Gi` : `${Math.round(mi)}Mi`;
}
function healthy(p: Pod): boolean { return p.total > 0 && p.ready === p.total && p.phase === "Running"; }
function phaseColor(p: Pod): string {
    if (healthy(p)) return "text-success";
    if (p.phase === "Pending" || p.phase === "ContainerCreating") return "text-warning";
    return "text-error";
}

export default function ObservabilityPage() {
    const { status } = useSession({ required: true });
    const { t } = useLocale();

    const [service, setService] = useState<string | null>(null);
    const [serviceOpen, setServiceOpen] = useState(false);
    const [pods, setPods] = useState<Pod[]>([]);
    const [loading, setLoading] = useState(false);
    const [metricsAvailable, setMetricsAvailable] = useState(true);
    const [selected, setSelected] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>("logs");

    // Logs state
    const [container, setContainer] = useState<string>("");
    const [tail, setTail] = useState(500);
    const [live, setLive] = useState(true);
    const [timestamps, setTimestamps] = useState(false);
    const [logText, setLogText] = useState("");
    const [logSearch, setLogSearch] = useState("");
    const [logLoading, setLogLoading] = useState(false);
    const logBoxRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Events state
    const [events, setEvents] = useState<K8sEvent[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);

    const selectedPod = pods.find((p) => p.name === selected) || null;

    const fetchPods = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/pods${service ? `?service=${encodeURIComponent(service)}` : ""}`);
            if (res.ok) {
                const data = await res.json();
                setPods(data.pods || []);
                setMetricsAvailable(data.metricsAvailable);
            }
        } catch { /* ignore */ }
        setLoading(false);
    }, [service]);

    useEffect(() => {
        if (status === "authenticated") {
            fetchPods();
            const i = setInterval(fetchPods, 15000);
            return () => clearInterval(i);
        }
    }, [status, fetchPods]);

    // Default the container selection whenever the selected pod changes.
    useEffect(() => {
        if (selectedPod && selectedPod.containers.length > 0) {
            setContainer((prev) =>
                selectedPod.containers.some((c) => c.name === prev) ? prev : selectedPod.containers[0].name
            );
        }
    }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---- Logs: live stream or snapshot ----
    const stopStream = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
    }, []);

    useEffect(() => {
        stopStream();
        if (tab !== "logs" || !selected || !container) return;
        setLogText("");

        if (!live) {
            // Snapshot
            setLogLoading(true);
            fetch(`/api/pods/logs?pod=${encodeURIComponent(selected)}&container=${encodeURIComponent(container)}&tail=${tail}&timestamps=${timestamps}`)
                .then((r) => r.text())
                .then((txt) => setLogText(txt))
                .catch(() => { /* ignore */ })
                .finally(() => setLogLoading(false));
            return;
        }

        // Live stream
        const controller = new AbortController();
        abortRef.current = controller;
        setLogLoading(true);
        (async () => {
            try {
                const res = await fetch(
                    `/api/pods/logs?pod=${encodeURIComponent(selected)}&container=${encodeURIComponent(container)}&tail=${tail}&timestamps=${timestamps}&follow=true`,
                    { signal: controller.signal }
                );
                if (!res.body) return;
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                setLogLoading(false);
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    setLogText((prev) => {
                        const next = prev + chunk;
                        return next.length > MAX_LOG_CHARS ? next.slice(next.length - MAX_LOG_CHARS) : next;
                    });
                }
            } catch { /* aborted or network */ } finally { setLogLoading(false); }
        })();

        return () => controller.abort();
    }, [tab, selected, container, tail, live, timestamps, stopStream]);

    // Auto-scroll to bottom on new log content while live.
    useEffect(() => {
        if (live && logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }, [logText, live]);

    // ---- Events ----
    const fetchEvents = useCallback(async () => {
        if (!selected) return;
        setEventsLoading(true);
        try {
            const res = await fetch(`/api/pods/events?pod=${encodeURIComponent(selected)}`);
            if (res.ok) setEvents((await res.json()).events || []);
        } catch { /* ignore */ }
        setEventsLoading(false);
    }, [selected]);

    useEffect(() => {
        if (tab === "events" && selected) {
            fetchEvents();
            const i = setInterval(fetchEvents, 15000);
            return () => clearInterval(i);
        }
    }, [tab, selected, fetchEvents]);

    const downloadLogs = () => {
        if (!selected || !container) return;
        const a = document.createElement("a");
        a.href = `/api/pods/logs?pod=${encodeURIComponent(selected)}&container=${encodeURIComponent(container)}&tail=10000&timestamps=${timestamps}&download=true`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const filteredLog = logSearch
        ? logText.split("\n").filter((l) => l.toLowerCase().includes(logSearch.toLowerCase())).join("\n")
        : logText;

    if (status === "loading") {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    }

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-8 max-w-[1400px]">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary" /> {t("obs.title")}
                        </h1>
                        <p className="text-sm text-muted mt-0.5">{t("obs.subtitle")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Service filter */}
                        <div className="relative">
                            <button onClick={() => setServiceOpen(!serviceOpen)} className="btn-secondary text-xs min-w-[160px] justify-between">
                                <span className="truncate">{service || t("obs.allServices")}</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${serviceOpen ? "rotate-180" : ""}`} />
                            </button>
                            {serviceOpen && (
                                <div className="absolute right-0 z-20 mt-1 w-[200px] rounded-md bg-card border border-cardBorder shadow-xl overflow-hidden">
                                    <button onClick={() => { setService(null); setServiceOpen(false); }}
                                        className={`w-full text-left px-3 py-2 text-xs hover:bg-card-hover ${!service ? "text-foreground bg-card-hover" : "text-muted"}`}>
                                        {t("obs.allServices")}
                                    </button>
                                    {SERVICES.map((s) => (
                                        <button key={s} onClick={() => { setService(s); setServiceOpen(false); }}
                                            className={`w-full text-left px-3 py-2 text-xs hover:bg-card-hover ${service === s ? "text-foreground bg-card-hover" : "text-muted"}`}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={fetchPods} className="btn-ghost">
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> {t("common.refresh")}
                        </button>
                    </div>
                </div>

                {!metricsAvailable && (
                    <div className="alert alert-warning mb-4 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" /> {t("obs.metricsUnavailable")}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
                    {/* Pod list */}
                    <div className="panel-card overflow-hidden self-start">
                        <div className="px-4 py-3 border-b border-cardBorder flex items-center justify-between">
                            <h2 className="text-sm font-semibold flex items-center gap-2"><Box className="w-4 h-4 text-muted" /> {t("obs.pods")}</h2>
                            <span className="badge badge-neutral">{pods.length}</span>
                        </div>
                        <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                            {loading && pods.length === 0 ? (
                                <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-2" /><p className="text-xs text-muted">{t("obs.loadingPods")}</p></div>
                            ) : pods.length === 0 ? (
                                <div className="p-8 text-center text-xs text-muted">{t("obs.noPods")}</div>
                            ) : pods.map((p) => (
                                <button key={p.name} onClick={() => { setSelected(p.name); setTab("logs"); }}
                                    className={`w-full text-left px-4 py-2.5 border-b border-cardBorder/50 hover:bg-card-hover transition-colors ${selected === p.name ? "bg-card-hover" : ""}`}>
                                    <div className="flex items-center gap-2">
                                        <Circle className={`w-2 h-2 shrink-0 fill-current ${phaseColor(p)}`} />
                                        <span className="text-xs font-medium text-foreground truncate flex-1">{p.name}</span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 pl-4 text-[11px] text-muted">
                                        <span>{p.ready}/{p.total}</span>
                                        <span className={p.restarts > 0 ? "text-warning" : ""}>↻ {p.restarts}</span>
                                        {p.usage && <span className="flex items-center gap-0.5"><Cpu className="w-3 h-3" />{fmtCpu(p.usage.cpuMilli)}</span>}
                                        {p.usage && <span className="flex items-center gap-0.5"><MemoryStick className="w-3 h-3" />{fmtMem(p.usage.memBytes)}</span>}
                                        <span className="ml-auto">{age(p.startTime)}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Detail panel */}
                    <div className="panel-card overflow-hidden flex flex-col min-h-[calc(100vh-220px)]">
                        {!selectedPod ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                                <ScrollText className="w-10 h-10 text-muted/40 mb-3" />
                                <p className="text-sm text-muted">{t("obs.selectPod")}</p>
                            </div>
                        ) : (
                            <>
                                {/* Pod header */}
                                <div className="px-4 py-3 border-b border-cardBorder">
                                    <div className="flex items-center gap-2">
                                        <Circle className={`w-2.5 h-2.5 fill-current ${phaseColor(selectedPod)}`} />
                                        <h3 className="text-sm font-semibold text-foreground truncate flex-1">{selectedPod.name}</h3>
                                        <span className={`badge ${healthy(selectedPod) ? "badge-success" : "badge-warning"}`}>{selectedPod.phase}</span>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className="flex border-b border-cardBorder">
                                    {([
                                        { id: "logs", label: t("obs.tabLogs"), icon: <ScrollText className="w-4 h-4" /> },
                                        { id: "events", label: t("obs.tabEvents"), icon: <ListTree className="w-4 h-4" /> },
                                        { id: "details", label: t("obs.tabDetails"), icon: <Info className="w-4 h-4" /> },
                                    ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((tb) => (
                                        <button key={tb.id} onClick={() => setTab(tb.id)} className={`tab-btn ${tab === tb.id ? "tab-btn-active" : ""}`}>
                                            {tb.icon}{tb.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Tab: Logs */}
                                {tab === "logs" && (
                                    <div className="flex flex-col flex-1 min-h-0">
                                        <div className="flex items-center gap-2 px-3 py-2 border-b border-cardBorder flex-wrap">
                                            {/* Container selector */}
                                            {selectedPod.containers.length > 1 && (
                                                <select value={container} onChange={(e) => setContainer(e.target.value)}
                                                    className="input-field text-xs py-1 w-auto">
                                                    {selectedPod.containers.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                </select>
                                            )}
                                            <select value={tail} onChange={(e) => setTail(parseInt(e.target.value))} className="input-field text-xs py-1 w-auto">
                                                {[100, 500, 1000, 5000].map((n) => <option key={n} value={n}>{t("obs.tailLines")}: {n}</option>)}
                                            </select>
                                            <button onClick={() => setLive(!live)} className={`btn-ghost text-xs ${live ? "text-success" : "text-muted"}`}>
                                                {live ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                                {live ? t("obs.live") : t("obs.paused")}
                                            </button>
                                            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                                                <input type="checkbox" checked={timestamps} onChange={(e) => setTimestamps(e.target.checked)} className="accent-[var(--color-primary)]" />
                                                {t("obs.timestamps")}
                                            </label>
                                            <div className="relative flex-1 min-w-[140px]">
                                                <Search className="w-3.5 h-3.5 text-muted absolute left-2 top-1/2 -translate-y-1/2" />
                                                <input value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder={t("obs.search")}
                                                    className="input-field text-xs py-1 pl-7 w-full" />
                                            </div>
                                            <button onClick={() => setLogText("")} className="btn-ghost text-xs" title={t("obs.clear")}><Trash2 className="w-3.5 h-3.5" /></button>
                                            <button onClick={downloadLogs} className="btn-ghost text-xs" title={t("obs.download")}><Download className="w-3.5 h-3.5" /></button>
                                        </div>
                                        <div ref={logBoxRef} className="flex-1 overflow-auto bg-[#0b0e14] p-3 font-mono text-[11px] leading-relaxed">
                                            {logLoading && !filteredLog ? (
                                                <div className="text-muted flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("common.loading")}</div>
                                            ) : filteredLog ? (
                                                <pre className="whitespace-pre-wrap break-all text-[#c9d1d9]">{filteredLog}</pre>
                                            ) : (
                                                <div className="text-muted">{t("obs.noLogs")}</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Tab: Events */}
                                {tab === "events" && (
                                    <div className="flex-1 overflow-auto">
                                        {eventsLoading && events.length === 0 ? (
                                            <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /></div>
                                        ) : events.length === 0 ? (
                                            <div className="p-8 text-center text-xs text-muted">{t("obs.noEvents")}</div>
                                        ) : (
                                            <table className="data-table">
                                                <thead><tr>
                                                    <th>{t("obs.type")}</th><th>{t("obs.reason")}</th><th>{t("obs.message")}</th>
                                                    <th className="text-right">{t("obs.count")}</th><th className="text-right">{t("obs.lastSeen")}</th>
                                                </tr></thead>
                                                <tbody>
                                                    {events.map((e, i) => (
                                                        <tr key={i}>
                                                            <td><span className={`badge ${e.type === "Warning" ? "badge-error" : "badge-neutral"}`}>{e.type}</span></td>
                                                            <td className="font-medium text-foreground">{e.reason}</td>
                                                            <td className="text-muted max-w-[400px]">{e.message}</td>
                                                            <td className="text-right text-muted">{e.count}</td>
                                                            <td className="text-right text-muted">{age(e.lastTimestamp)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}

                                {/* Tab: Details */}
                                {tab === "details" && (
                                    <div className="flex-1 overflow-auto p-4 space-y-4">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {[
                                                { icon: Server, label: t("obs.node"), value: selectedPod.node || "—" },
                                                { icon: Activity, label: t("obs.podIP"), value: selectedPod.podIP || "—" },
                                                { icon: RefreshCw, label: t("obs.restarts"), value: String(selectedPod.restarts) },
                                                { icon: Box, label: t("obs.started"), value: age(selectedPod.startTime) },
                                                { icon: Cpu, label: t("obs.cpu"), value: fmtCpu(selectedPod.usage?.cpuMilli) },
                                                { icon: MemoryStick, label: t("obs.memory"), value: fmtMem(selectedPod.usage?.memBytes) },
                                            ].map((it, i) => (
                                                <div key={i} className="panel-card p-3">
                                                    <it.icon className="w-4 h-4 text-muted mb-1.5" />
                                                    <p className="text-[10px] text-muted uppercase">{it.label}</p>
                                                    <p className="font-mono text-xs text-foreground truncate">{it.value}</p>
                                                </div>
                                            ))}
                                        </div>

                                        <div>
                                            <h4 className="text-xs font-semibold uppercase text-muted mb-2">{t("obs.containers")}</h4>
                                            <div className="space-y-2">
                                                {selectedPod.containers.map((c) => (
                                                    <div key={c.name} className="panel-card p-3">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <Circle className={`w-2 h-2 fill-current ${c.ready ? "text-success" : "text-error"}`} />
                                                                <span className="text-sm font-medium text-foreground">{c.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="badge badge-neutral">{c.state}{c.reason ? `: ${c.reason}` : ""}</span>
                                                                <span className="text-[11px] text-muted">↻ {c.restartCount}</span>
                                                            </div>
                                                        </div>
                                                        <p className="text-[11px] text-muted font-mono mt-1.5 truncate">{c.image}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {Object.keys(selectedPod.labels).length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-semibold uppercase text-muted mb-2">{t("obs.labels")}</h4>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {Object.entries(selectedPod.labels).map(([k, v]) => (
                                                        <code key={k} className="text-[11px] bg-surface border border-cardBorder rounded px-1.5 py-0.5 text-muted">
                                                            {k}={v}
                                                        </code>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
