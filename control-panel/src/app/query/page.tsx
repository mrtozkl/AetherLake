"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import {
    Database, Table as TableIcon, FolderOpen, Play, Loader2,
    AlertCircle, Search, X, Download, Copy, Check, Clock,
    History, Code2, Trash2
} from "lucide-react";
import Editor from "@monaco-editor/react";

export default function QueryIDE() {
    const { data: session, status } = useSession({ required: true });
    const { t } = useLocale();

    const [query, setQuery] = useState("SHOW CATALOGS");
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<{ columns: { name: string; type: string }[]; data: any[][] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [durationMs, setDurationMs] = useState<number | null>(null);

    // Schema Explorer state
    const [catalogs, setCatalogs] = useState<string[]>([]);
    const [schemas, setSchemas] = useState<{ [catalog: string]: string[] }>({});
    const [tables, setTables] = useState<{ [key: string]: string[] }>({});
    const [expandedCatalog, setExpandedCatalog] = useState<string | null>(null);
    const [expandedSchema, setExpandedSchema] = useState<string | null>(null);
    const [loadingCatalog, setLoadingCatalog] = useState<string | null>(null);
    const [loadingSchema, setLoadingSchema] = useState<string | null>(null);
    const [schemaSearch, setSchemaSearch] = useState("");

    // History & Export state
    const [history, setHistory] = useState<string[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [copiedJson, setCopiedJson] = useState(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (status === "authenticated") fetchCatalogs(); }, [status]);

    useEffect(() => {
        try {
            const saved = localStorage.getItem("aetherlake_query_history");
            if (saved) setHistory(JSON.parse(saved));
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        const sql = new URLSearchParams(window.location.search).get("sql");
        if (sql) setQuery(sql);
    }, []);

    const runQuery = async (sql: string, isBackground = false) => {
        if (!isBackground) {
            setRunning(true);
            setError(null);
            setResults(null);
            setDurationMs(null);
        }
        const startTime = performance.now();
        try {
            const res = await fetch("/api/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: sql }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Query failed");
            const elapsed = Math.round(performance.now() - startTime);

            if (!isBackground) {
                setResults({ columns: data.columns || [], data: data.data || [] });
                setDurationMs(elapsed);

                // Save to history
                setHistory(prev => {
                    const next = [sql.trim(), ...prev.filter(q => q.trim() !== sql.trim())].slice(0, 20);
                    try { localStorage.setItem("aetherlake_query_history", JSON.stringify(next)); } catch { /* ignore */ }
                    return next;
                });
            }
            return data.data;
        } catch (err: any) {
            if (!isBackground) setError(err.message);
            return null;
        } finally {
            if (!isBackground) setRunning(false);
        }
    };

    const fetchCatalogs = async () => {
        const rows = await runQuery("SHOW CATALOGS", true);
        if (rows) setCatalogs(rows.map((r: any[]) => r[0]));
    };

    const toggleCatalog = async (catalog: string) => {
        if (expandedCatalog === catalog) { setExpandedCatalog(null); setExpandedSchema(null); return; }
        setExpandedCatalog(catalog); setExpandedSchema(null); setLoadingCatalog(catalog);
        const rows = await runQuery(`SHOW SCHEMAS IN ${catalog}`, true);
        if (rows) setSchemas(prev => ({ ...prev, [catalog]: rows.map((r: any[]) => r[0]) }));
        setLoadingCatalog(null);
    };

    const toggleSchema = async (catalog: string, schema: string) => {
        const key = `${catalog}.${schema}`;
        if (expandedSchema === key) { setExpandedSchema(null); return; }
        setExpandedSchema(key); setLoadingSchema(key);
        const rows = await runQuery(`SHOW TABLES IN ${catalog}.${schema}`, true);
        if (rows) setTables(prev => ({ ...prev, [key]: rows.map((r: any[]) => r[0]) }));
        setLoadingSchema(null);
    };

    const selectTable = (catalog: string, schema: string, table: string) => {
        setQuery(`SELECT * FROM ${catalog}.${schema}.${table} LIMIT 100`);
    };

    const exportCsv = () => {
        if (!results || results.data.length === 0) return;
        const headers = results.columns.map(c => `"${c.name.replace(/"/g, '""')}"`).join(",");
        const rows = results.data.map(row =>
            row.map(val => {
                if (val === null) return '""';
                const str = typeof val === "object" ? JSON.stringify(val) : String(val);
                return `"${str.replace(/"/g, '""')}"`;
            }).join(",")
        ).join("\n");
        const csvContent = `${headers}\n${rows}`;
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `aetherlake_query_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const copyJson = () => {
        if (!results || results.data.length === 0) return;
        const objList = results.data.map(row => {
            const obj: Record<string, any> = {};
            results.columns.forEach((col, idx) => {
                obj[col.name] = row[idx];
            });
            return obj;
        });
        navigator.clipboard.writeText(JSON.stringify(objList, null, 2));
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 2000);
    };

    const clearHistory = () => {
        setHistory([]);
        try { localStorage.removeItem("aetherlake_query_history"); } catch { /* ignore */ }
    };

    if (status === "loading") {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    }

    const formatSql = () => {
        let formatted = query;
        const keywords = [
            "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "LIMIT",
            "SHOW", "SCHEMAS", "TABLES", "CATALOGS", "IN", "JOIN",
            "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "ON", "AS",
            "AND", "OR", "DESC", "ASC", "INSERT", "INTO", "VALUES", "CREATE", "DROP"
        ];
        keywords.forEach(kw => {
            const re = new RegExp(`\\b${kw}\\b`, "gi");
            formatted = formatted.replace(re, kw);
        });
        setQuery(formatted);
    };

    const QUICK_SNIPPETS = [
        { label: "SHOW CATALOGS", sql: "SHOW CATALOGS" },
        { label: "SHOW SCHEMAS", sql: "SHOW SCHEMAS IN iceberg" },
        { label: "SHOW TABLES", sql: "SHOW TABLES IN iceberg.default" },
        { label: "LIMIT 50", sql: "SELECT * FROM iceberg.default.my_table LIMIT 50" },
    ];

    const filteredCatalogs = catalogs.filter(cat => {
        if (!schemaSearch.trim()) return true;
        const q = schemaSearch.toLowerCase();
        if (cat.toLowerCase().includes(q)) return true;
        const schList = schemas[cat] || [];
        if (schList.some(s => s.toLowerCase().includes(q))) return true;
        return false;
    });

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-4 flex gap-3 h-screen overflow-hidden">
                {/* Schema Explorer */}
                <aside className="w-64 panel-card flex flex-col h-full overflow-hidden shrink-0">
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-cardBorder bg-surface/50">
                        <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-primary" />
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{t("query.dataCatalog")}</h2>
                        </div>
                        <span className="badge badge-neutral text-[10px]">{catalogs.length}</span>
                    </div>

                    {/* Catalog search bar */}
                    <div className="p-2 border-b border-cardBorder bg-surface/20">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                value={schemaSearch}
                                onChange={(e) => setSchemaSearch(e.target.value)}
                                placeholder={t("tbl.search")}
                                className="input-field text-xs py-1 pl-8 pr-6 w-full"
                            />
                            {schemaSearch && (
                                <button
                                    onClick={() => setSchemaSearch("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 px-3 py-2 space-y-0.5">
                        {catalogs.length === 0 ? (
                            <div className="text-xs text-muted py-4 px-1 text-center">{t("query.loadingCatalogs")}</div>
                        ) : filteredCatalogs.length === 0 ? (
                            <div className="text-xs text-muted py-4 px-1 text-center">{t("home.noServicesFound")}</div>
                        ) : filteredCatalogs.map(cat => (
                            <div key={cat} className="mb-1">
                                <div onClick={() => toggleCatalog(cat)}
                                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-card-hover rounded cursor-pointer text-xs font-medium text-secondary hover:text-foreground transition-colors">
                                    {loadingCatalog === cat
                                        ? <Loader2 className="w-3.5 h-3.5 text-warning animate-spin" />
                                        : <FolderOpen className={`w-3.5 h-3.5 text-warning ${expandedCatalog === cat ? "fill-warning/20" : ""}`} />}
                                    {cat}
                                </div>
                                {expandedCatalog === cat && (
                                    <div className="ml-5 mt-0.5 space-y-0.5 border-l border-cardBorder pl-2">
                                        {loadingCatalog === cat ? (
                                            <div className="flex items-center gap-1 p-1 text-[11px] text-muted"><Loader2 className="w-3 h-3 animate-spin" /> Loading...</div>
                                        ) : schemas[cat]?.length > 0 ? schemas[cat].map(sch => {
                                            const schKey = `${cat}.${sch}`;
                                            return (
                                                <div key={sch}>
                                                    <div onClick={() => toggleSchema(cat, sch)}
                                                        className="flex items-center gap-1.5 px-1.5 py-1 hover:bg-card-hover rounded cursor-pointer text-[11px] text-muted hover:text-foreground transition-colors">
                                                        {loadingSchema === schKey
                                                            ? <Loader2 className="w-3 h-3 text-accent animate-spin" />
                                                            : <TableIcon className={`w-3 h-3 text-accent ${expandedSchema === schKey ? "fill-accent/20" : ""}`} />}
                                                        {sch}
                                                    </div>
                                                    {expandedSchema === schKey && (
                                                        <div className="ml-4 mt-0.5 space-y-0 border-l border-cardBorder/50 pl-2">
                                                            {loadingSchema === schKey ? (
                                                                <div className="text-[10px] text-muted p-1"><Loader2 className="w-2.5 h-2.5 animate-spin inline mr-1" />Loading...</div>
                                                            ) : tables[schKey]?.length > 0 ? tables[schKey].map(tbl => (
                                                                <div key={tbl} onClick={() => selectTable(cat, sch, tbl)}
                                                                    className="flex items-center gap-1 px-1 py-0.5 hover:bg-primary/5 rounded text-[10px] text-muted hover:text-primary cursor-pointer transition-colors"
                                                                    title={`SELECT * FROM ${cat}.${sch}.${tbl}`}>
                                                                    <Database className="w-2.5 h-2.5 text-primary/50" />{tbl}
                                                                </div>
                                                            )) : <div className="text-[10px] text-muted/50 italic p-1">No tables</div>}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }) : <div className="text-[10px] text-muted/50 italic p-1">No schemas</div>}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Editor + Results */}
                <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                    {/* Editor Container */}
                    <div className="h-1/2 panel-card flex flex-col overflow-hidden">
                        {/* Editor Header Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-cardBorder bg-surface">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                    <Code2 className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-xs font-semibold uppercase text-foreground tracking-wider">{t("query.sqlEditor")}</span>

                                {/* Quick Snippet Buttons */}
                                <div className="hidden lg:flex items-center gap-1 ml-2">
                                    {QUICK_SNIPPETS.map((snip, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setQuery(snip.sql)}
                                            className="text-[10px] px-2 py-0.5 rounded bg-surface-hover hover:bg-primary/20 text-muted hover:text-foreground transition-colors border border-cardBorder font-mono"
                                        >
                                            {snip.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                                {/* Query History Toggle */}
                                <button
                                    onClick={() => setShowHistory(!showHistory)}
                                    className={`btn-ghost text-xs py-1 px-2 flex items-center gap-1 ${showHistory ? "text-primary bg-card-hover" : ""}`}
                                    title={t("query.history")}
                                >
                                    <History className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">{t("query.history")}</span>
                                    {history.length > 0 && (
                                        <span className="badge badge-neutral text-[9px] font-mono px-1 py-0">{history.length}</span>
                                    )}
                                </button>

                                {/* Format SQL */}
                                <button
                                    onClick={formatSql}
                                    className="btn-ghost text-xs py-1 px-2"
                                    title={t("query.formatSql")}
                                >
                                    {t("query.formatSql")}
                                </button>

                                {/* Principal Badge */}
                                <span className="text-[11px] text-muted bg-card-hover rounded px-2 py-1 font-mono hidden md:inline" title="Trino principal">
                                    {t("query.executedAs")}: <span className="font-semibold text-secondary">{(session?.user as any)?.username || session?.user?.name || "—"}</span>
                                </span>

                                {/* Run Query Button */}
                                <button
                                    onClick={() => runQuery(query)}
                                    disabled={running || !query.trim()}
                                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                                >
                                    {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                    <span>{running ? t("query.executing") : t("query.runQuery")}</span>
                                </button>
                            </div>
                        </div>

                        {/* Query History Drawer */}
                        {showHistory && (
                            <div className="p-2 border-b border-cardBorder bg-surface/90 flex flex-col gap-1 max-h-36 overflow-y-auto">
                                <div className="flex items-center justify-between text-[11px] text-muted px-1">
                                    <span className="font-medium">{t("query.history")} (Recent)</span>
                                    <button
                                        onClick={clearHistory}
                                        className="text-muted hover:text-error text-[10px] flex items-center gap-1"
                                    >
                                        <Trash2 className="w-3 h-3" /> {t("query.clearHistory")}
                                    </button>
                                </div>
                                {history.length === 0 ? (
                                    <div className="text-[11px] text-muted italic px-1 py-1">{t("query.noHistory")}</div>
                                ) : (
                                    history.map((h, i) => (
                                        <button
                                            key={i}
                                            onClick={() => { setQuery(h); setShowHistory(false); }}
                                            className="text-left font-mono text-[11px] px-2 py-1 rounded bg-card hover:bg-card-hover text-foreground truncate border border-cardBorder/50 transition-colors"
                                        >
                                            {h}
                                        </button>
                                    ))
                                )}
                            </div>
                        )}

                        <div className="flex-1 bg-[#1e1e1e]">
                            <Editor
                                height="100%"
                                language="sql"
                                theme="vs-dark"
                                value={query}
                                onChange={(val) => setQuery(val || "")}
                                options={{
                                    minimap: { enabled: false },
                                    padding: { top: 12, bottom: 12 },
                                    fontSize: 13,
                                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Inter', ui-monospace, monospace",
                                    scrollBeyondLastLine: false,
                                    smoothScrolling: true
                                }}
                            />
                        </div>
                    </div>

                    {/* Results Container */}
                    <div className="h-1/2 panel-card flex flex-col overflow-hidden">
                        <div className="px-3 py-2 border-b border-cardBorder bg-surface flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase text-muted tracking-wide">{t("query.results")}</span>
                                {results && (
                                    <span className="badge badge-neutral text-[10px] font-mono">
                                        {results.data.length} {t("query.rows")} · {results.columns.length} cols
                                    </span>
                                )}
                                {durationMs !== null && (
                                    <span className="badge badge-success text-[10px] font-mono flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {durationMs} ms
                                    </span>
                                )}
                            </div>

                            {/* Export / Copy toolbar */}
                            {results && results.data.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={copyJson}
                                        className="btn-ghost text-xs py-1 px-2 flex items-center gap-1"
                                        title={copiedJson ? t("common.copied") : t("query.copyJson")}
                                    >
                                        {copiedJson ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                                        <span>{copiedJson ? t("common.copied") : t("query.copyJson")}</span>
                                    </button>

                                    <button
                                        onClick={exportCsv}
                                        className="btn-ghost text-xs py-1 px-2 flex items-center gap-1"
                                        title={t("query.exportCsv")}
                                    >
                                        <Download className="w-3 h-3" />
                                        <span>{t("query.exportCsv")}</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto">
                            {error ? (
                                <div className="alert alert-error m-4">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <pre className="text-xs font-mono whitespace-pre-wrap">{error}</pre>
                                </div>
                            ) : !results ? (
                                <div className="h-full flex items-center justify-center text-muted text-sm">{t("query.runToSee")}</div>
                            ) : results.data.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-muted text-sm">{t("query.noRows")}</div>
                            ) : (
                                <table className="data-table">
                                    <thead className="sticky top-0 bg-surface">
                                        <tr>{results.columns.map((col, idx) => (
                                            <th key={idx}>{col.name} <span className="text-[10px] text-muted/70 lowercase font-mono ml-1">({col.type})</span></th>
                                        ))}</tr>
                                    </thead>
                                    <tbody>{results.data.map((row, rowIdx) => (
                                        <tr key={rowIdx}>{row.map((val, cellIdx) => (
                                            <td key={cellIdx} className="font-mono text-xs">{val === null ? <span className="text-muted/50 italic">NULL</span> : typeof val === 'object' ? JSON.stringify(val) : String(val)}</td>
                                        ))}</tr>
                                    ))}</tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
