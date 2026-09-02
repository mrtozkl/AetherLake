"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import { AnimatePresence, motion } from "framer-motion";
import Editor from "@monaco-editor/react";
import {
    GitFork, Play, CheckCircle2, AlertCircle, RefreshCw, Loader2,
    Database, Layers, FileCode2, Terminal, ShieldCheck, Search,
    ArrowRight, ZoomIn, ZoomOut, RotateCcw, Table2, Tag, Clock,
    ChevronRight, ExternalLink, Sparkles, Check, X, Info
} from "lucide-react";
import { DbtModel, DbtSource, DbtDagNode, DbtDagEdge, DbtRunHistoryItem } from "../api/dbt/route";
import LineageGraph from "./LineageGraph";

export default function DbtPage() {
    const { data: session, status } = useSession({ required: true });
    const { t } = useLocale();

    // Data state
    const [project, setProject] = useState<any>(null);
    const [models, setModels] = useState<DbtModel[]>([]);
    const [sources, setSources] = useState<DbtSource[]>([]);
    const [dagNodes, setDagNodes] = useState<DbtDagNode[]>([]);
    const [dagEdges, setDagEdges] = useState<DbtDagEdge[]>([]);
    const [runHistory, setRunHistory] = useState<DbtRunHistoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    // Active view tab: "lineage" | "models" | "history"
    const [activeTab, setActiveTab] = useState<"lineage" | "models" | "history">("lineage");

    // Selected model/node for inspection
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [inspectorTab, setInspectorTab] = useState<"sql" | "compiled" | "columns" | "dependencies">("sql");

    // Filter state
    const [layerFilter, setLayerFilter] = useState<"all" | "bronze" | "silver" | "gold">("all");
    const [searchQuery, setSearchQuery] = useState("");

    // Execution state
    const [runningCommand, setRunningCommand] = useState<string | null>(null);

    // Fullscreen lineage state
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isFullscreen) {
                setIsFullscreen(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isFullscreen]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/dbt");
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to fetch dbt project metadata");
            }
            const data = await res.json();
            setProject(data.project);
            setModels(data.models || []);
            setSources(data.sources || []);
            setDagNodes(data.dag?.nodes || []);
            setDagEdges(data.dag?.edges || []);
            setRunHistory(data.runHistory || []);

            // Set default selected model if none
            if (!selectedNodeId && data.models?.length > 0) {
                setSelectedNodeId(data.models[0].id);
            }
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    }, [selectedNodeId]);

    useEffect(() => {
        if (status !== "authenticated") return;
        fetchData();
    }, [status, fetchData]);

    // Handle running dbt models or tests
    const handleRunDbt = async (command: string, select?: string) => {
        setRunningCommand(command);
        setActionMessage(null);
        setError(null);
        try {
            const res = await fetch("/api/dbt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command, select }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Execution failed");
            setActionMessage(data.message || t("dbt.triggeredSuccess"));
            await fetchData();
        } catch (err: any) {
            setError(err.message);
        }
        setRunningCommand(null);
    };

    // Filtered models
    const filteredModels = useMemo(() => {
        return models.filter((m) => {
            const matchesLayer = layerFilter === "all" || m.layer === layerFilter;
            const matchesSearch =
                m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                m.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
            return matchesLayer && matchesSearch;
        });
    }, [models, layerFilter, searchQuery]);

    // Currently selected model or source details
    const selectedModel = useMemo(() => {
        return models.find((m) => m.id === selectedNodeId);
    }, [models, selectedNodeId]);

    const selectedSource = useMemo(() => {
        if (!selectedNodeId || !selectedNodeId.startsWith("source.")) return null;
        const parts = selectedNodeId.split(".");
        const srcName = parts[1];
        const tblName = parts[2];
        const src = sources.find((s) => s.name === srcName);
        const tbl = src?.tables.find((t) => t.name === tblName);
        return src && tbl ? { source: src, table: tbl } : null;
    }, [sources, selectedNodeId]);

    // Calculate DAG upstream and downstream nodes for the selected node
    const activeLineage = useMemo(() => {
        if (!selectedNodeId) return { upstream: new Set<string>(), downstream: new Set<string>() };

        const upstream = new Set<string>();
        const downstream = new Set<string>();

        // Upstream traversal
        const findUpstream = (id: string) => {
            dagEdges
                .filter((e) => e.target === id)
                .forEach((e) => {
                    if (!upstream.has(e.source)) {
                        upstream.add(e.source);
                        findUpstream(e.source);
                    }
                });
        };

        // Downstream traversal
        const findDownstream = (id: string) => {
            dagEdges
                .filter((e) => e.source === id)
                .forEach((e) => {
                    if (!downstream.has(e.target)) {
                        downstream.add(e.target);
                        findDownstream(e.target);
                    }
                });
        };

        findUpstream(selectedNodeId);
        findDownstream(selectedNodeId);

        return { upstream, downstream };
    }, [selectedNodeId, dagEdges]);

    // Group DAG nodes by column/layer for visualization
    const groupedNodes = useMemo(() => {
        const bronzeNodes = dagNodes.filter((n) => n.layer === "bronze");
        const silverNodes = dagNodes.filter((n) => n.layer === "silver");
        const goldNodes = dagNodes.filter((n) => n.layer === "gold");
        return { bronzeNodes, silverNodes, goldNodes };
    }, [dagNodes]);

    if (status === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-8 max-w-[1400px]">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-semibold text-foreground">{t("dbt.title")}</h1>
                            <span className="badge-info text-[11px] font-mono">v1.8.0 / Trino</span>
                        </div>
                        <p className="text-sm text-muted mt-0.5">{t("dbt.subtitle")}</p>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={() => handleRunDbt("dbt run")}
                            disabled={!!runningCommand}
                            className="btn-primary flex items-center gap-2"
                        >
                            {runningCommand === "dbt run" ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>{t("dbt.running")}</span>
                                </>
                            ) : (
                                <>
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span>{t("dbt.runModels")}</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={() => handleRunDbt("dbt test")}
                            disabled={!!runningCommand}
                            className="btn-secondary flex items-center gap-2"
                        >
                            {runningCommand === "dbt test" ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>{t("dbt.running")}</span>
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span>{t("dbt.runTests")}</span>
                                </>
                            )}
                        </button>

                        <button onClick={fetchData} className="btn-ghost p-2" title={t("common.refresh")}>
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                {/* Notifications */}
                {actionMessage && (
                    <div className="mb-6 p-3 rounded-lg bg-success/10 border border-success/30 text-success text-sm flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            <span>{actionMessage}</span>
                        </div>
                        <button onClick={() => setActionMessage(null)} className="text-success/70 hover:text-success">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {error && (
                    <div className="mb-6 p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            <span>{error}</span>
                        </div>
                        <button onClick={() => setError(null)} className="text-error/70 hover:text-error">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Project Stats Summary Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
                    <div className="panel-card p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                            <GitFork className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[11px] text-muted uppercase font-medium">{t("dbt.models")}</p>
                            <p className="text-lg font-semibold text-foreground">{project?.modelsCount || models.length}</p>
                        </div>
                    </div>

                    <div className="panel-card p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                            <Database className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[11px] text-muted uppercase font-medium">{t("dbt.sources")}</p>
                            <p className="text-lg font-semibold text-foreground">{project?.sourcesCount || 2}</p>
                        </div>
                    </div>

                    <div className="panel-card p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[11px] text-muted uppercase font-medium">{t("dbt.tests")}</p>
                            <p className="text-lg font-semibold text-foreground">{project?.testsCount || 8}</p>
                        </div>
                    </div>

                    <div className="panel-card p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <Layers className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[11px] text-muted uppercase font-medium">{t("dbt.adapter")}</p>
                            <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                                Trino HTTPS <span className="text-[10px] text-muted">(8443)</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main View Tabs */}
                <div className="flex items-center justify-between border-b border-cardBorder mb-6">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setActiveTab("lineage")}
                            className={`pb-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
                                activeTab === "lineage"
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted hover:text-foreground"
                            }`}
                        >
                            <GitFork className="w-4 h-4" />
                            <span>{t("dbt.tabLineage")}</span>
                        </button>

                        <button
                            onClick={() => setActiveTab("models")}
                            className={`pb-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
                                activeTab === "models"
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted hover:text-foreground"
                            }`}
                        >
                            <Layers className="w-4 h-4" />
                            <span>{t("dbt.tabModels")}</span>
                            <span className="badge-neutral text-[10px]">{models.length}</span>
                        </button>

                        <button
                            onClick={() => setActiveTab("history")}
                            className={`pb-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
                                activeTab === "history"
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted hover:text-foreground"
                            }`}
                        >
                            <Clock className="w-4 h-4" />
                            <span>{t("dbt.tabHistory")}</span>
                            <span className="badge-neutral text-[10px]">{runHistory.length}</span>
                        </button>
                    </div>

                </div>

                {/* Tab 1: Interactive Lineage DAG */}
                {activeTab === "lineage" && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Interactive Graph Canvas */}
                        <div className="lg:col-span-8 panel-card overflow-hidden h-[660px] flex flex-col relative rounded-xl border border-cardBorder shadow-lg">
                            <LineageGraph
                                rawNodes={dagNodes}
                                rawEdges={dagEdges}
                                selectedNodeId={selectedNodeId}
                                onSelectNode={setSelectedNodeId}
                                isFullscreen={false}
                                onToggleFullscreen={() => setIsFullscreen(true)}
                            />
                        </div>

                        {/* Node Details & Code Inspector Panel */}
                        <div className="lg:col-span-4 panel-card p-6 flex flex-col justify-between h-[660px] overflow-hidden">
                            {selectedModel ? (
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <span
                                                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                                                    selectedModel.layer === "silver"
                                                        ? "bg-blue-500/20 text-blue-400"
                                                        : "bg-amber-400/20 text-amber-300"
                                                }`}
                                            >
                                                {selectedModel.layer} model
                                            </span>
                                            <span className="badge-neutral text-[10px] font-mono">
                                                {selectedModel.materialization}
                                            </span>
                                        </div>
                                        <h3 className="text-base font-semibold text-foreground mt-1 font-mono">
                                            {selectedModel.name}
                                        </h3>
                                        <p className="text-xs text-muted mt-1 leading-relaxed">
                                            {selectedModel.description}
                                        </p>
                                    </div>

                                    {/* Inspector Sub-Tabs */}
                                    <div className="flex items-center gap-3 border-b border-cardBorder text-xs">
                                        <button
                                            onClick={() => setInspectorTab("sql")}
                                            className={`pb-2 font-medium border-b-2 transition-colors ${
                                                inspectorTab === "sql"
                                                    ? "border-primary text-primary"
                                                    : "border-transparent text-muted hover:text-foreground"
                                            }`}
                                        >
                                            {t("dbt.rawSql")}
                                        </button>
                                        <button
                                            onClick={() => setInspectorTab("compiled")}
                                            className={`pb-2 font-medium border-b-2 transition-colors ${
                                                inspectorTab === "compiled"
                                                    ? "border-primary text-primary"
                                                    : "border-transparent text-muted hover:text-foreground"
                                            }`}
                                        >
                                            {t("dbt.compiledSql")}
                                        </button>
                                        <button
                                            onClick={() => setInspectorTab("columns")}
                                            className={`pb-2 font-medium border-b-2 transition-colors ${
                                                inspectorTab === "columns"
                                                    ? "border-primary text-primary"
                                                    : "border-transparent text-muted hover:text-foreground"
                                            }`}
                                        >
                                            {t("dbt.columns")} ({selectedModel.columns.length})
                                        </button>
                                        <button
                                            onClick={() => setInspectorTab("dependencies")}
                                            className={`pb-2 font-medium border-b-2 transition-colors ${
                                                inspectorTab === "dependencies"
                                                    ? "border-primary text-primary"
                                                    : "border-transparent text-muted hover:text-foreground"
                                            }`}
                                        >
                                            {t("dbt.dependsOn")}
                                        </button>
                                    </div>

                                    {/* Inspector Content */}
                                    {inspectorTab === "sql" && (
                                        <div className="rounded-lg overflow-hidden border border-cardBorder bg-[#1e1e1e]">
                                            <Editor
                                                height="260px"
                                                language="sql"
                                                theme="vs-dark"
                                                value={selectedModel.rawSql}
                                                options={{
                                                    readOnly: true,
                                                    minimap: { enabled: false },
                                                    fontSize: 12,
                                                    lineNumbers: "on",
                                                    scrollBeyondLastLine: false,
                                                }}
                                            />
                                        </div>
                                    )}

                                    {inspectorTab === "compiled" && (
                                        <div className="rounded-lg overflow-hidden border border-cardBorder bg-[#1e1e1e]">
                                            <Editor
                                                height="260px"
                                                language="sql"
                                                theme="vs-dark"
                                                value={selectedModel.compiledSql}
                                                options={{
                                                    readOnly: true,
                                                    minimap: { enabled: false },
                                                    fontSize: 12,
                                                    lineNumbers: "on",
                                                    scrollBeyondLastLine: false,
                                                }}
                                            />
                                        </div>
                                    )}

                                    {inspectorTab === "columns" && (
                                        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                                            {selectedModel.columns.map((col) => (
                                                <div
                                                    key={col.name}
                                                    className="p-2.5 rounded-lg bg-card/60 border border-cardBorder text-xs"
                                                >
                                                    <div className="flex items-center justify-between font-mono">
                                                        <span className="text-foreground font-semibold">{col.name}</span>
                                                        <span className="text-muted text-[10px]">{col.dataType}</span>
                                                    </div>
                                                    {col.description && (
                                                        <p className="text-[11px] text-muted mt-1">{col.description}</p>
                                                    )}
                                                    {col.dataTests.length > 0 && (
                                                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                            {col.dataTests.map((tst) => (
                                                                <span
                                                                    key={tst}
                                                                    className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-mono"
                                                                >
                                                                    ✓ {tst}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {inspectorTab === "dependencies" && (
                                        <div className="space-y-4 max-h-[260px] overflow-y-auto pr-1">
                                            {/* Upstream Parents */}
                                            <div className="space-y-1.5">
                                                <span className="text-[11px] font-semibold text-blue-400 font-mono uppercase tracking-wider flex items-center gap-1">
                                                    ▲ {t("dbt.upstream")} ({selectedModel.dependsOn.length})
                                                </span>
                                                {selectedModel.dependsOn.length === 0 ? (
                                                    <p className="text-xs text-muted italic">No upstream sources</p>
                                                ) : (
                                                    <div className="space-y-1">
                                                        {selectedModel.dependsOn.map((depId) => {
                                                            const targetNode = dagNodes.find((n) => n.id === depId);
                                                            return (
                                                                <div
                                                                    key={depId}
                                                                    onClick={() => setSelectedNodeId(depId)}
                                                                    className="p-2 rounded-lg bg-card/60 hover:bg-card border border-cardBorder cursor-pointer flex items-center justify-between text-xs transition-colors"
                                                                >
                                                                    <span className="font-mono text-foreground truncate">
                                                                        {targetNode?.label || depId}
                                                                    </span>
                                                                    <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                                                                        targetNode?.layer === "bronze" ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"
                                                                    }`}>
                                                                        {targetNode?.layer || "parent"}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Downstream Children */}
                                            <div className="space-y-1.5">
                                                <span className="text-[11px] font-semibold text-emerald-400 font-mono uppercase tracking-wider flex items-center gap-1">
                                                    ▼ {t("dbt.downstream")} ({dagEdges.filter((e) => e.source === selectedModel.id).length})
                                                </span>
                                                {dagEdges.filter((e) => e.source === selectedModel.id).length === 0 ? (
                                                    <p className="text-xs text-muted italic">No downstream models</p>
                                                ) : (
                                                    <div className="space-y-1">
                                                        {dagEdges
                                                            .filter((e) => e.source === selectedModel.id)
                                                            .map((edge) => {
                                                                const targetNode = dagNodes.find((n) => n.id === edge.target);
                                                                return (
                                                                    <div
                                                                        key={edge.id}
                                                                        onClick={() => setSelectedNodeId(edge.target)}
                                                                        className="p-2 rounded-lg bg-card/60 hover:bg-card border border-cardBorder cursor-pointer flex items-center justify-between text-xs transition-colors"
                                                                    >
                                                                        <span className="font-mono text-foreground truncate">
                                                                            {targetNode?.label || edge.target}
                                                                        </span>
                                                                        <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                                                                            targetNode?.layer === "gold" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"
                                                                        }`}>
                                                                            {targetNode?.layer || "child"}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Action: Run this model */}
                                    <div className="pt-3 border-t border-cardBorder flex items-center justify-between">
                                        <span className="text-xs text-muted">
                                            Last run: {selectedModel.lastRunDurationMs}ms
                                        </span>
                                        <button
                                            onClick={() => handleRunDbt("dbt run", selectedModel.name)}
                                            disabled={!!runningCommand}
                                            className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
                                        >
                                            <Play className="w-3 h-3" />
                                            <span>Run {selectedModel.name}</span>
                                        </button>
                                    </div>
                                </div>
                            ) : selectedSource ? (
                                <div className="space-y-4">
                                    <div>
                                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                            Bronze Source
                                        </span>
                                        <h3 className="text-base font-semibold text-foreground mt-1 font-mono">
                                            {selectedSource.source.name}.{selectedSource.table.name}
                                        </h3>
                                        <p className="text-xs text-muted mt-1 leading-relaxed">
                                            {selectedSource.table.description}
                                        </p>
                                    </div>

                                    <div className="p-3 rounded-lg bg-card/60 border border-cardBorder space-y-2 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-muted">Catalog / Schema:</span>
                                            <span className="text-foreground font-mono">
                                                {selectedSource.source.database}.{selectedSource.source.schema}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted">Status:</span>
                                            <span className="badge-success text-[10px]">
                                                {selectedSource.table.status}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                                        <p className="text-xs font-semibold text-foreground">Columns:</p>
                                        {selectedSource.table.columns.map((col) => (
                                            <div
                                                key={col.name}
                                                className="p-2 rounded bg-card/60 border border-cardBorder text-xs flex items-center justify-between"
                                            >
                                                <span className="font-mono text-foreground">{col.name}</span>
                                                <span className="text-muted text-[10px] font-mono">{col.dataType}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted">
                                    <GitFork className="w-10 h-10 mb-3 opacity-30" />
                                    <p className="text-sm font-medium">{t("dbt.selectNode")}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Tab 2: Models & Sources Explorer */}
                {activeTab === "models" && (
                    <div className="space-y-6">
                        {/* Search and Filters */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setLayerFilter("all")}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                        layerFilter === "all" ? "bg-primary text-white" : "btn-ghost"
                                    }`}
                                >
                                    {t("dbt.filterAll")}
                                </button>
                                <button
                                    onClick={() => setLayerFilter("silver")}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                        layerFilter === "silver" ? "bg-blue-500 text-white" : "btn-ghost"
                                    }`}
                                >
                                    Silver ({models.filter((m) => m.layer === "silver").length})
                                </button>
                                <button
                                    onClick={() => setLayerFilter("gold")}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                        layerFilter === "gold" ? "bg-amber-500 text-white" : "btn-ghost"
                                    }`}
                                >
                                    Gold ({models.filter((m) => m.layer === "gold").length})
                                </button>
                            </div>

                            <div className="relative w-full sm:w-72">
                                <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Search models, tags, descriptions..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="input-field pl-9 w-full text-xs"
                                />
                            </div>
                        </div>

                        {/* Models Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredModels.map((model) => (
                                <div key={model.id} className="panel-card p-5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                                                    model.layer === "silver"
                                                        ? "bg-blue-500/20 text-blue-400"
                                                        : "bg-amber-400/20 text-amber-300"
                                                }`}
                                            >
                                                {model.layer}
                                            </span>
                                            <span className="badge-neutral text-[10px] font-mono">
                                                {model.materialization}
                                            </span>
                                        </div>
                                        <span className="badge-success text-[10px] flex items-center gap-1">
                                            <Check className="w-2.5 h-2.5" /> OK
                                        </span>
                                    </div>

                                    <div>
                                        <h3 className="text-base font-semibold text-foreground font-mono">
                                            {model.name}
                                        </h3>
                                        <p className="text-xs text-muted mt-1 leading-relaxed">
                                            {model.description}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {model.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="px-2 py-0.5 rounded bg-cardBorder text-muted text-[10px] font-mono flex items-center gap-1"
                                            >
                                                <Tag className="w-2.5 h-2.5" /> {tag}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="pt-3 border-t border-cardBorder flex items-center justify-between text-xs">
                                        <span className="text-muted">
                                            {model.columns.length} columns · {model.tests.length} tests
                                        </span>
                                        <button
                                            onClick={() => {
                                                setSelectedNodeId(model.id);
                                                setActiveTab("lineage");
                                            }}
                                            className="text-primary hover:underline flex items-center gap-1"
                                        >
                                            <span>View in Lineage</span>
                                            <ArrowRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tab 3: Run History & Logs */}
                {activeTab === "history" && (
                    <div className="space-y-4">
                        {runHistory.length === 0 ? (
                            <div className="panel-card p-12 text-center text-muted">
                                <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                <p className="text-sm font-medium">{t("dbt.noRuns")}</p>
                            </div>
                        ) : (
                            runHistory.map((run) => (
                                <div key={run.id} className="panel-card p-5 space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="flex items-center gap-3">
                                            <span
                                                className={`px-2.5 py-1 rounded text-xs font-semibold font-mono ${
                                                    run.status === "SUCCESS"
                                                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                                        : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                                }`}
                                            >
                                                {run.status}
                                            </span>
                                            <span className="font-mono text-sm font-semibold text-foreground">
                                                {run.command}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-4 text-xs text-muted">
                                            <span>Duration: {run.durationSeconds}s</span>
                                            <span>{new Date(run.timestamp).toLocaleString()}</span>
                                            <span className="text-secondary">{run.triggeredBy}</span>
                                        </div>
                                    </div>

                                    {/* Console Logs Preview */}
                                    <div className="rounded-lg bg-[#141414] p-3 font-mono text-xs text-muted/90 border border-cardBorder/70 overflow-x-auto space-y-1">
                                        {run.logs.map((line, idx) => (
                                            <p
                                                key={idx}
                                                className={
                                                    line.includes("OK") || line.includes("PASS") || line.includes("successfully")
                                                        ? "text-emerald-400"
                                                        : line.includes("START")
                                                        ? "text-blue-400"
                                                        : "text-muted"
                                                }
                                            >
                                                {line}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </main>

            {/* Fullscreen Lineage Modal */}
            {isFullscreen && (
                <div className="fixed inset-0 z-50 bg-[#0b0e14] flex flex-col">
                    <LineageGraph
                        rawNodes={dagNodes}
                        rawEdges={dagEdges}
                        selectedNodeId={selectedNodeId}
                        onSelectNode={setSelectedNodeId}
                        isFullscreen={true}
                        onToggleFullscreen={() => setIsFullscreen(false)}
                    />
                </div>
            )}
        </div>
    );
}
