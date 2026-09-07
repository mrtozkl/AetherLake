"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import {
    Table2, RefreshCw, Loader2, Database, ChevronRight, ChevronDown,
    Columns3, GitBranch, Layers, Settings2, Hash, FileStack, HardDrive,
    Key, FolderTree, Search, X, Copy, Check, Eye, AlertCircle
} from "lucide-react";

type Tab = "schema" | "partitions" | "snapshots" | "properties" | "preview";

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

    // Search filter
    const [searchTerm, setSearchTerm] = useState("");

    // Selected table and detail
    const [selected, setSelected] = useState<{ namespace: string; table: string } | null>(null);
    const [detail, setDetail] = useState<TableDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [tab, setTab] = useState<Tab>("schema");

    // Copy states
    const [copiedId, setCopiedId] = useState(false);
    const [copiedLocation, setCopiedLocation] = useState(false);

    // Data Preview state
    const [previewData, setPreviewData] = useState<{ columns: { name: string; type: string }[]; data: any[][] } | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

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

    const fetchPreview = useCallback(async (namespace: string, table: string) => {
        setPreviewLoading(true);
        setPreviewError(null);
        try {
            const sql = `SELECT * FROM iceberg.${namespace}.${table} LIMIT 20`;
            const res = await fetch("/api/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: sql }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Preview failed");
            setPreviewData({ columns: data.columns || [], data: data.data || [] });
        } catch (err: any) {
            setPreviewError(err.message || "Failed to load preview");
        }
        setPreviewLoading(false);
    }, []);

    const selectTable = async (namespace: string, table: string) => {
        setSelected({ namespace, table });
        setTab("schema");
        setDetail(null);
        setPreviewData(null);
        setPreviewError(null);
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/iceberg?action=table&namespace=${encodeURIComponent(namespace)}&table=${encodeURIComponent(table)}`);
            if (res.ok) setDetail(await res.json());
        } catch { /* ignore */ }
        setDetailLoading(false);
    };

    const handleTabChange = (newTab: Tab) => {
        setTab(newTab);
        if (newTab === "preview" && selected && !previewData && !previewLoading) {
            fetchPreview(selected.namespace, selected.table);
        }
    };

    const copyToClipboard = (text: string, type: "id" | "location") => {
        navigator.clipboard.writeText(text);
        if (type === "id") {
            setCopiedId(true);
            setTimeout(() => setCopiedId(false), 2000);
        } else {
            setCopiedLocation(true);
            setTimeout(() => setCopiedLocation(false), 2000);
        }
    };

    const filteredNamespaces = useMemo(() => {
        if (!searchTerm.trim()) return namespaces;
        const q = searchTerm.toLowerCase();
        return namespaces.filter((ns) => {
            if (ns.toLowerCase().includes(q)) return true;
            const tbls = tablesByNs[ns] || [];
            return tbls.some((tbl) => tbl.toLowerCase().includes(q));
        });
    }, [namespaces, tablesByNs, searchTerm]);

    if (status === "loading") {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    }

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-8 max-w-[1400px]">
                {/* Standardized Enterprise Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-cardBorder">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                <Table2 className="w-4 h-4" />
                            </div>
                            <h1 className="text-lg font-semibold text-foreground tracking-tight">
                                {t("tbl.title")}
                            </h1>
                            <span className="badge badge-neutral text-[10px]">Iceberg REST</span>
                        </div>
                        <p className="text-xs text-muted mt-1">{t("tbl.subtitle")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={fetchNamespaces} className="btn-ghost text-xs">
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> {t("common.refresh")}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                    {/* Namespace / table tree with Search */}
                    <div className="panel-card overflow-hidden self-start">
                        <div className="px-4 py-3 border-b border-cardBorder flex items-center justify-between">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-2">
                                <FolderTree className="w-3.5 h-3.5 text-muted" /> {t("tbl.namespaces")}
                            </h2>
                            <span className="badge badge-neutral text-[10px]">{namespaces.length}</span>
                        </div>

                        {/* Search Bar in tree */}
                        <div className="p-2 border-b border-cardBorder bg-surface/30">
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder={t("tbl.search")}
                                    className="input-field text-xs py-1.5 pl-8 pr-7 w-full"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm("")}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="max-h-[calc(100vh-270px)] overflow-y-auto py-1">
                            {loading && namespaces.length === 0 ? (
                                <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /></div>
                            ) : filteredNamespaces.length === 0 ? (
                                <div className="p-8 text-center text-xs text-muted">{t("tbl.noNamespaces")}</div>
                            ) : filteredNamespaces.map((ns) => {
                                const q = searchTerm.toLowerCase();
                                const isNsMatch = !searchTerm || ns.toLowerCase().includes(q);
                                const tbls = tablesByNs[ns] || [];
                                const visibleTbls = !searchTerm ? tbls : tbls.filter(tbl => isNsMatch || tbl.toLowerCase().includes(q));

                                return (
                                    <div key={ns}>
                                        <button onClick={() => toggleNamespace(ns)}
                                            className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-secondary hover:text-foreground hover:bg-card-hover transition-colors">
                                            {expanded.has(ns) || (searchTerm && visibleTbls.length > 0) ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                                            <Database className="w-3.5 h-3.5 text-warning shrink-0" />
                                            <span className="truncate">{ns}</span>
                                        </button>
                                        {(expanded.has(ns) || (searchTerm && visibleTbls.length > 0)) && (
                                            <div className="pl-6">
                                                {loadingNs === ns ? (
                                                    <div className="px-3 py-1.5 text-[11px] text-muted flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> {t("tbl.loading")}</div>
                                                ) : visibleTbls.length === 0 ? (
                                                    <div className="px-3 py-1.5 text-[11px] text-muted">{t("tbl.noTables")}</div>
                                                ) : visibleTbls.map((tbl) => {
                                                    const active = selected?.namespace === ns && selected?.table === tbl;
                                                    return (
                                                        <button key={tbl} onClick={() => selectTable(ns, tbl)}
                                                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-card-hover transition-colors ${active ? "bg-card-hover text-foreground font-medium" : "text-muted"}`}>
                                                            <Table2 className="w-3.5 h-3.5 text-primary shrink-0" />
                                                            <span className="truncate">{tbl}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
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
                                <div className="px-4 py-3 border-b border-cardBorder bg-surface/30">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                                                <Table2 className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-semibold text-foreground truncate">
                                                        <span className="text-muted font-normal">{detail.namespace}.</span>{detail.name}
                                                    </h3>
                                                    {detail.formatVersion && (
                                                        <span className="badge badge-neutral text-[10px]">v{detail.formatVersion}</span>
                                                    )}
                                                </div>
                                                {detail.location && (
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <p className="text-[11px] text-muted font-mono truncate max-w-[360px]">{detail.location}</p>
                                                        <button
                                                            onClick={() => copyToClipboard(detail.location || "", "location")}
                                                            className="text-muted hover:text-foreground transition-colors p-0.5"
                                                            title={copiedLocation ? t("common.copied") : t("tbl.copyLocation")}
                                                        >
                                                            {copiedLocation ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                            <button
                                                onClick={() => copyToClipboard(`iceberg.${detail.namespace}.${detail.name}`, "id")}
                                                className="btn-secondary text-xs py-1 px-2.5"
                                                title={copiedId ? t("common.copied") : t("tbl.copyPath")}
                                            >
                                                {copiedId ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                                                <span>{copiedId ? t("common.copied") : t("tbl.copyPath")}</span>
                                            </button>
                                            <a
                                                href={`/query?sql=${encodeURIComponent(`SELECT * FROM iceberg.${detail.namespace}.${detail.name} LIMIT 100`)}`}
                                                className="btn-primary text-xs py-1 px-2.5"
                                            >
                                                <Database className="w-3.5 h-3.5" /> {t("tbl.queryInIde")}
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                {/* Standardized Metric cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-cardBorder bg-surface/10">
                                    {[
                                        { icon: Hash, label: t("tbl.rows"), value: fmtNum(detail.metrics.totalRecords) },
                                        { icon: FileStack, label: t("tbl.dataFiles"), value: fmtNum(detail.metrics.totalDataFiles) },
                                        { icon: HardDrive, label: t("tbl.size"), value: fmtBytes(detail.metrics.totalFilesSize) },
                                        { icon: Layers, label: t("tbl.format"), value: detail.formatVersion ? `Iceberg v${detail.formatVersion} (${detail.fields.length} ${t("tbl.columnsCount").toLowerCase()})` : "—" },
                                    ].map((it, i) => (
                                        <div key={i} className="panel-card p-3">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] text-muted uppercase tracking-wider">{it.label}</span>
                                                <it.icon className="w-3.5 h-3.5 text-muted/60" />
                                            </div>
                                            <p className="font-mono text-sm font-semibold text-foreground truncate">{it.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Tabs */}
                                <div className="flex border-b border-cardBorder overflow-x-auto">
                                    {([
                                        { id: "schema", label: t("tbl.tabSchema"), icon: <Columns3 className="w-4 h-4" /> },
                                        { id: "preview", label: t("tbl.tabDataPreview"), icon: <Eye className="w-4 h-4" /> },
                                        { id: "partitions", label: t("tbl.tabPartitions"), icon: <GitBranch className="w-4 h-4" /> },
                                        { id: "snapshots", label: t("tbl.tabSnapshots"), icon: <Layers className="w-4 h-4" /> },
                                        { id: "properties", label: t("tbl.tabProperties"), icon: <Settings2 className="w-4 h-4" /> },
                                    ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((tb) => (
                                        <button key={tb.id} onClick={() => handleTabChange(tb.id)} className={`tab-btn ${tab === tb.id ? "tab-btn-active" : ""}`}>
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
                                                        <td><code className="text-[11px] text-primary/80 font-mono">{f.type}</code></td>
                                                        <td>{f.required ? <span className="badge badge-warning">required</span> : <span className="text-muted text-xs">—</span>}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}

                                    {/* Data Preview Tab */}
                                    {tab === "preview" && (
                                        <div className="h-full flex flex-col">
                                            <div className="px-4 py-2 border-b border-cardBorder/50 flex items-center justify-between bg-surface/20">
                                                <span className="text-[11px] text-muted flex items-center gap-1.5">
                                                    <Eye className="w-3.5 h-3.5 text-primary" /> {t("tbl.previewHint")}
                                                </span>
                                                {previewData && (
                                                    <span className="badge badge-neutral text-[10px] font-mono">
                                                        {previewData.data.length} rows
                                                    </span>
                                                )}
                                            </div>

                                            {previewLoading ? (
                                                <div className="flex-1 flex flex-col items-center justify-center p-12 text-muted gap-2">
                                                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                                    <p className="text-xs">{t("tbl.previewLoading")}</p>
                                                </div>
                                            ) : previewError ? (
                                                <div className="p-6">
                                                    <div className="alert alert-error mb-4">
                                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                                        <div className="text-xs">
                                                            <p className="font-semibold mb-1">{t("tbl.previewError")}</p>
                                                            <p className="font-mono text-muted">{previewError}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => selected && fetchPreview(selected.namespace, selected.table)}
                                                        className="btn-secondary text-xs"
                                                    >
                                                        <RefreshCw className="w-3 h-3" /> {t("common.refresh")}
                                                    </button>
                                                </div>
                                            ) : !previewData || previewData.data.length === 0 ? (
                                                <div className="flex-1 flex flex-col items-center justify-center p-12 text-muted text-xs">
                                                    <Table2 className="w-8 h-8 text-muted/40 mb-2" />
                                                    <p>0 records in table</p>
                                                </div>
                                            ) : (
                                                <div className="overflow-x-auto">
                                                    <table className="data-table">
                                                        <thead>
                                                            <tr>
                                                                {previewData.columns.map((col, idx) => (
                                                                    <th key={idx}>
                                                                        {col.name}
                                                                        {col.type && (
                                                                            <span className="text-[10px] text-muted/60 font-mono ml-1">({col.type})</span>
                                                                        )}
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {previewData.data.map((row, rowIdx) => (
                                                                <tr key={rowIdx}>
                                                                    {row.map((cell, cellIdx) => (
                                                                        <td key={cellIdx}>
                                                                            {cell === null ? (
                                                                                <span className="text-muted/50 italic">NULL</span>
                                                                            ) : typeof cell === "object" ? (
                                                                                JSON.stringify(cell)
                                                                            ) : (
                                                                                String(cell)
                                                                            )}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
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
                                                            <td><code className="text-[11px] text-accent font-mono">{p.transform}</code></td>
                                                            <td className="text-muted font-mono text-xs">{p.sourceColumn}</td>
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
                                                        <td className="text-right text-muted font-mono">{s.summary["added-records"] ?? "—"}</td>
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
