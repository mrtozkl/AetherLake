"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import {
    Table2, RefreshCw, Loader2, Database, ChevronRight, ChevronDown,
    Columns3, GitBranch, Layers, Settings2, Hash, FileStack, HardDrive,
    Key, FolderTree
} from "lucide-react";

type Tab = "schema" | "partitions" | "snapshots" | "properties";

interface Field { id: number; name: string; type: string; required: boolean; doc: string | null; }
interface PartitionField { name: string; transform: string; sourceColumn: string; }
interface Snapshot { id: string; parentId: string | null; timestampMs: number; operation: string; summary: Record<string, string>; }
interface TableDetail {
    name: string; namespace: string; location: string | null; formatVersion: number | null; uuid: string | null;
    currentSnapshotId: string | null; fields: Field[]; partitionFields: PartitionField[];
    snapshots: Snapshot[]; properties: Record<string, string>;
    metrics: { totalRecords: number | null; totalDataFiles: number | null; totalFilesSize: number | null };
}

function fmtBytes(b: number | null): string {
    if (b == null) return "—";
    if (b < 1024) return `${b} B`;
    const kb = b / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(2)} GB`;
}
function fmtNum(n: number | null): string { return n == null ? "—" : n.toLocaleString(); }
function fmtDate(ms: number): string { return new Date(ms).toLocaleString(); }

export default function TablesPage() {
    const { status } = useSession({ required: true });
    const { t } = useLocale();

    const [namespaces, setNamespaces] = useState<string[]>([]);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [tablesByNs, setTablesByNs] = useState<Record<string, string[]>>({});
    const [loadingNs, setLoadingNs] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const [selected, setSelected] = useState<{ namespace: string; table: string } | null>(null);
    const [detail, setDetail] = useState<TableDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [tab, setTab] = useState<Tab>("schema");

    const fetchNamespaces = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/iceberg?action=namespaces");
            if (res.ok) setNamespaces((await res.json()).namespaces || []);
        } catch { /* ignore */ }
        setLoading(false);
    }, []);

    useEffect(() => { if (status === "authenticated") fetchNamespaces(); }, [status, fetchNamespaces]);

    const toggleNamespace = async (ns: string) => {
        const next = new Set(expanded);
        if (next.has(ns)) { next.delete(ns); setExpanded(next); return; }
        next.add(ns); setExpanded(next);
        if (!tablesByNs[ns]) {
            setLoadingNs(ns);
            try {
                const res = await fetch(`/api/iceberg?action=tables&namespace=${encodeURIComponent(ns)}`);
                if (res.ok) {
                    const tables = (await res.json()).tables || [];
                    setTablesByNs((prev) => ({ ...prev, [ns]: tables }));
                }
            } catch { /* ignore */ }
            setLoadingNs(null);
        }
    };

    const selectTable = async (namespace: string, table: string) => {
        setSelected({ namespace, table });
        setTab("schema");
        setDetail(null);
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/iceberg?action=table&namespace=${encodeURIComponent(namespace)}&table=${encodeURIComponent(table)}`);
            if (res.ok) setDetail(await res.json());
        } catch { /* ignore */ }
        setDetailLoading(false);
    };

    if (status === "loading") {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    }

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-8 max-w-[1400px]">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                            <Table2 className="w-5 h-5 text-primary" /> {t("tbl.title")}
                        </h1>
                        <p className="text-sm text-muted mt-0.5">{t("tbl.subtitle")}</p>
                    </div>
                    <button onClick={fetchNamespaces} className="btn-ghost">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> {t("common.refresh")}
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                    {/* Namespace / table tree */}
                    <div className="panel-card overflow-hidden self-start">
                        <div className="px-4 py-3 border-b border-cardBorder flex items-center justify-between">
                            <h2 className="text-sm font-semibold flex items-center gap-2"><FolderTree className="w-4 h-4 text-muted" /> {t("tbl.namespaces")}</h2>
                            <span className="badge badge-neutral">{namespaces.length}</span>
                        </div>
                        <div className="max-h-[calc(100vh-220px)] overflow-y-auto py-1">
                            {loading && namespaces.length === 0 ? (
                                <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /></div>
                            ) : namespaces.length === 0 ? (
                                <div className="p-8 text-center text-xs text-muted">{t("tbl.noNamespaces")}</div>
                            ) : namespaces.map((ns) => (
                                <div key={ns}>
                                    <button onClick={() => toggleNamespace(ns)}
                                        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-secondary hover:text-foreground hover:bg-card-hover transition-colors">
                                        {expanded.has(ns) ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                                        <Database className="w-3.5 h-3.5 text-warning shrink-0" />
                                        <span className="truncate">{ns}</span>
                                    </button>
                                    {expanded.has(ns) && (
                                        <div className="pl-6">
                                            {loadingNs === ns ? (
                                                <div className="px-3 py-1.5 text-[11px] text-muted flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> {t("tbl.loading")}</div>
                                            ) : (tablesByNs[ns]?.length ?? 0) === 0 ? (
                                                <div className="px-3 py-1.5 text-[11px] text-muted">{t("tbl.noTables")}</div>
                                            ) : tablesByNs[ns].map((tbl) => {
                                                const active = selected?.namespace === ns && selected?.table === tbl;
                                                return (
                                                    <button key={tbl} onClick={() => selectTable(ns, tbl)}
                                                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-card-hover transition-colors ${active ? "bg-card-hover text-foreground" : "text-muted"}`}>
                                                        <Table2 className="w-3.5 h-3.5 text-primary shrink-0" />
                                                        <span className="truncate">{tbl}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Table detail */}
                    <div className="panel-card overflow-hidden flex flex-col min-h-[calc(100vh-220px)]">
                        {!selected ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                                <Table2 className="w-10 h-10 text-muted/40 mb-3" />
                                <p className="text-sm text-muted">{t("tbl.selectTable")}</p>
                            </div>
                        ) : detailLoading ? (
                            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                        ) : !detail ? (
                            <div className="flex-1 flex items-center justify-center text-sm text-muted">—</div>
                        ) : (
                            <>
                                {/* Header */}
                                <div className="px-4 py-3 border-b border-cardBorder">
                                    <div className="flex items-center gap-2">
                                        <Table2 className="w-4 h-4 text-primary" />
                                        <h3 className="text-sm font-semibold text-foreground truncate flex-1">
                                            <span className="text-muted">{detail.namespace}.</span>{detail.name}
                                        </h3>
                                        {detail.formatVersion && <span className="badge badge-neutral">v{detail.formatVersion}</span>}
                                        <a
                                            href={`/query?sql=${encodeURIComponent(`SELECT * FROM iceberg.${detail.namespace}.${detail.name} LIMIT 100`)}`}
                                            className="btn-ghost text-xs"
                                        >
                                            <Database className="w-3.5 h-3.5" /> {t("tbl.queryInIde")}
                                        </a>
                                    </div>
                                    {detail.location && <p className="text-[11px] text-muted font-mono mt-1 truncate">{detail.location}</p>}
                                </div>

                                {/* Metric cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-cardBorder">
                                    {[
                                        { icon: Hash, label: t("tbl.rows"), value: fmtNum(detail.metrics.totalRecords) },
                                        { icon: FileStack, label: t("tbl.dataFiles"), value: fmtNum(detail.metrics.totalDataFiles) },
                                        { icon: HardDrive, label: t("tbl.size"), value: fmtBytes(detail.metrics.totalFilesSize) },
                                        { icon: Layers, label: t("tbl.format"), value: detail.formatVersion ? `Iceberg v${detail.formatVersion}` : "—" },
                                    ].map((it, i) => (
                                        <div key={i} className="panel-card p-3">
                                            <it.icon className="w-4 h-4 text-muted mb-1.5" />
                                            <p className="text-[10px] text-muted uppercase">{it.label}</p>
                                            <p className="font-mono text-sm text-foreground truncate">{it.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Tabs */}
                                <div className="flex border-b border-cardBorder">
                                    {([
                                        { id: "schema", label: t("tbl.tabSchema"), icon: <Columns3 className="w-4 h-4" /> },
                                        { id: "partitions", label: t("tbl.tabPartitions"), icon: <GitBranch className="w-4 h-4" /> },
                                        { id: "snapshots", label: t("tbl.tabSnapshots"), icon: <Layers className="w-4 h-4" /> },
                                        { id: "properties", label: t("tbl.tabProperties"), icon: <Settings2 className="w-4 h-4" /> },
                                    ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((tb) => (
                                        <button key={tb.id} onClick={() => setTab(tb.id)} className={`tab-btn ${tab === tb.id ? "tab-btn-active" : ""}`}>
                                            {tb.icon}{tb.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex-1 overflow-auto">
                                    {/* Schema */}
                                    {tab === "schema" && (
                                        <table className="data-table">
                                            <thead><tr><th>#</th><th>{t("tbl.column")}</th><th>{t("tbl.type")}</th><th>{t("tbl.required")}</th></tr></thead>
                                            <tbody>
                                                {detail.fields.map((f) => (
                                                    <tr key={f.id}>
                                                        <td className="text-muted">{f.id}</td>
                                                        <td className="font-medium text-foreground">{f.name}</td>
                                                        <td><code className="text-[11px] text-primary/80">{f.type}</code></td>
                                                        <td>{f.required ? <span className="badge badge-warning">required</span> : <span className="text-muted text-xs">—</span>}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                    {/* Partitions */}
                                    {tab === "partitions" && (
                                        detail.partitionFields.length === 0 ? (
                                            <div className="p-8 text-center text-xs text-muted">{t("tbl.noPartitions")}</div>
                                        ) : (
                                            <table className="data-table">
                                                <thead><tr><th>{t("tbl.column")}</th><th>{t("tbl.transform")}</th><th>{t("tbl.sourceColumn")}</th></tr></thead>
                                                <tbody>
                                                    {detail.partitionFields.map((p, i) => (
                                                        <tr key={i}>
                                                            <td className="font-medium text-foreground flex items-center gap-1.5"><Key className="w-3 h-3 text-warning" />{p.name}</td>
                                                            <td><code className="text-[11px] text-accent">{p.transform}</code></td>
                                                            <td className="text-muted">{p.sourceColumn}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )
                                    )}

                                    {/* Snapshots */}
                                    {tab === "snapshots" && (
                                        <table className="data-table">
                                            <thead><tr><th>{t("tbl.snapshotId")}</th><th>{t("tbl.operation")}</th><th className="text-right">{t("tbl.addedRecords")}</th><th className="text-right">{t("tbl.committed")}</th></tr></thead>
                                            <tbody>
                                                {detail.snapshots.map((s) => (
                                                    <tr key={s.id}>
                                                        <td className="font-mono text-[11px] text-foreground">
                                                            {s.id}
                                                            {s.id === detail.currentSnapshotId && <span className="badge badge-success ml-2">{t("tbl.current")}</span>}
                                                        </td>
                                                        <td><span className="badge badge-neutral">{s.operation}</span></td>
                                                        <td className="text-right text-muted">{s.summary["added-records"] ?? "—"}</td>
                                                        <td className="text-right text-muted text-xs">{fmtDate(s.timestampMs)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                    {/* Properties */}
                                    {tab === "properties" && (
                                        Object.keys(detail.properties).length === 0 ? (
                                            <div className="p-8 text-center text-xs text-muted">—</div>
                                        ) : (
                                            <table className="data-table">
                                                <thead><tr><th>{t("tbl.key")}</th><th>{t("tbl.value")}</th></tr></thead>
                                                <tbody>
                                                    {Object.entries(detail.properties).map(([k, v]) => (
                                                        <tr key={k}><td className="font-mono text-[11px] text-primary/80">{k}</td><td className="font-mono text-[11px] text-muted">{v}</td></tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
