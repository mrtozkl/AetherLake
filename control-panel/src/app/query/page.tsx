"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import { Database, Table as TableIcon, FolderOpen, Play, Loader2, AlertCircle } from "lucide-react";
import Editor from "@monaco-editor/react";

export default function QueryIDE() {
    const { data: session, status } = useSession({ required: true });
    const { t } = useLocale();

    const [query, setQuery] = useState("SELECT * FROM system.runtime.nodes LIMIT 10;");
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<{ columns: any[], data: any[][] } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [catalogs, setCatalogs] = useState<string[]>([]);
    const [schemas, setSchemas] = useState<{ [catalog: string]: string[] }>({});
    const [tables, setTables] = useState<{ [key: string]: string[] }>({});
    const [expandedCatalog, setExpandedCatalog] = useState<string | null>(null);
    const [expandedSchema, setExpandedSchema] = useState<string | null>(null);
    const [loadingCatalog, setLoadingCatalog] = useState<string | null>(null);
    const [loadingSchema, setLoadingSchema] = useState<string | null>(null);

    useEffect(() => { if (status === "authenticated") fetchCatalogs(); }, [status]);

    const runQuery = async (sql: string, isBackground = false) => {
        if (!isBackground) { setRunning(true); setError(null); setResults(null); }
        try {
            const res = await fetch("/api/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Query failed");
            if (!isBackground) setResults({ columns: data.columns || [], data: data.data || [] });
            return data.data;
        } catch (err: any) { if (!isBackground) setError(err.message); return null; }
        finally { if (!isBackground) setRunning(false); }
    };

    const fetchCatalogs = async () => { const rows = await runQuery("SHOW CATALOGS", true); if (rows) setCatalogs(rows.map((r: any[]) => r[0])); };

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
        setQuery(`SELECT * FROM ${catalog}.${schema}.${table} LIMIT 100;`);
    };

    if (status === "loading") {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    }

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-4 flex gap-3 h-screen overflow-hidden">
                {/* Schema Explorer */}
                <aside className="w-64 panel-card flex flex-col h-full overflow-hidden shrink-0">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-cardBorder">
                        <Database className="w-4 h-4 text-primary" />
                        <h2 className="text-sm font-semibold">{t("query.dataCatalog")}</h2>
                    </div>
                    <div className="overflow-y-auto flex-1 px-3 py-2 space-y-0.5">
                        {catalogs.length === 0 ? (
                            <div className="text-xs text-muted py-2 px-1">{t("query.loadingCatalogs")}</div>
                        ) : catalogs.map(cat => (
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
                    {/* Editor */}
                    <div className="h-1/2 panel-card flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-cardBorder bg-surface">
                            <span className="text-xs font-semibold uppercase text-muted tracking-wide">{t("query.sqlEditor")}</span>
                            <button onClick={() => runQuery(query)} disabled={running || !query.trim()} className="btn-primary text-xs py-1.5 px-3">
                                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                {running ? t("query.executing") : t("query.runQuery")}
                            </button>
                        </div>
                        <div className="flex-1 bg-[#1e1e1e]">
                            <Editor height="100%" language="sql" theme="vs-dark" value={query} onChange={(val) => setQuery(val || "")}
                                options={{ minimap: { enabled: false }, padding: { top: 12, bottom: 12 }, fontSize: 13, fontFamily: "'Inter', ui-monospace, monospace", scrollBeyondLastLine: false, smoothScrolling: true }} />
                        </div>
                    </div>

                    {/* Results */}
                    <div className="h-1/2 panel-card flex flex-col overflow-hidden">
                        <div className="px-4 py-2 border-b border-cardBorder bg-surface">
                            <span className="text-xs font-semibold uppercase text-muted tracking-wide">{t("query.results")}</span>
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
                                    <thead className="sticky top-0">
                                        <tr>{results.columns.map((col, idx) => (
                                            <th key={idx}>{col.name} <span className="text-[10px] text-muted/70 lowercase ml-1">({col.type})</span></th>
                                        ))}</tr>
                                    </thead>
                                    <tbody>{results.data.map((row, rowIdx) => (
                                        <tr key={rowIdx}>{row.map((val, cellIdx) => (
                                            <td key={cellIdx}>{val === null ? <span className="text-muted/50 italic">NULL</span> : typeof val === 'object' ? JSON.stringify(val) : String(val)}</td>
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
