"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import { AnimatePresence, motion } from "framer-motion";
import {
    Database, Plus, Trash2, RefreshCw, Settings2,
    Loader2, AlertCircle, Check, X,
    LayoutDashboard, Link2, Server, Cpu, HardDrive,
    ChevronDown, ExternalLink, Plug
} from "lucide-react";

type Tab = "catalogs" | "add-connection" | "config" | "dashboard";

interface CatalogEntry {
    name: string;
    connector: string;
    properties: Record<string, string>;
}

const CONNECTOR_TEMPLATES: Record<string, { label: string; fields: { key: string; label: string; placeholder: string; secret?: boolean; required?: boolean }[] }> = {
    iceberg: {
        label: "Apache Iceberg",
        fields: [
            { key: "connector.name", label: "Connector", placeholder: "iceberg", required: true },
            { key: "iceberg.catalog.type", label: "Catalog Type", placeholder: "rest" },
            { key: "iceberg.rest-catalog.uri", label: "REST Catalog URI", placeholder: "http://core-data-stack-polaris:8181/api/catalog" },
            { key: "iceberg.rest-catalog.security", label: "Security", placeholder: "OAUTH2" },
            { key: "iceberg.rest-catalog.oauth2.credential", label: "OAuth2 Credential", placeholder: "principal:secret", secret: true },
            { key: "fs.native-s3.enabled", label: "Native S3", placeholder: "true" },
            { key: "s3.endpoint", label: "S3 Endpoint", placeholder: "http://minio-hl:9000" },
            { key: "s3.region", label: "S3 Region", placeholder: "us-east-1" },
            { key: "s3.path-style-access", label: "Path Style Access", placeholder: "true" },
        ],
    },
    hive: {
        label: "Apache Hive",
        fields: [
            { key: "connector.name", label: "Connector", placeholder: "hive", required: true },
            { key: "hive.metastore.uri", label: "Metastore URI", placeholder: "thrift://hive-metastore:9083", required: true },
            { key: "hive.s3.endpoint", label: "S3 Endpoint", placeholder: "http://minio-hl:9000" },
            { key: "hive.s3.path-style-access", label: "Path Style Access", placeholder: "true" },
            { key: "hive.non-managed-table-writes-enabled", label: "Non-managed Writes", placeholder: "true" },
        ],
    },
    postgresql: {
        label: "PostgreSQL",
        fields: [
            { key: "connector.name", label: "Connector", placeholder: "postgresql", required: true },
            { key: "connection-url", label: "JDBC URL", placeholder: "jdbc:postgresql://host:5432/database", required: true },
            { key: "connection-user", label: "Username", placeholder: "postgres", required: true },
            { key: "connection-password", label: "Password", placeholder: "password", secret: true, required: true },
        ],
    },
    mysql: {
        label: "MySQL",
        fields: [
            { key: "connector.name", label: "Connector", placeholder: "mysql", required: true },
            { key: "connection-url", label: "JDBC URL", placeholder: "jdbc:mysql://host:3306/database", required: true },
            { key: "connection-user", label: "Username", placeholder: "root", required: true },
            { key: "connection-password", label: "Password", placeholder: "password", secret: true, required: true },
        ],
    },
    tpch: {
        label: "TPC-H (Benchmark)",
        fields: [
            { key: "connector.name", label: "Connector", placeholder: "tpch", required: true },
            { key: "tpch.splits-per-node", label: "Splits per Node", placeholder: "4" },
        ],
    },
    tpcds: {
        label: "TPC-DS (Benchmark)",
        fields: [
            { key: "connector.name", label: "Connector", placeholder: "tpcds", required: true },
            { key: "tpcds.splits-per-node", label: "Splits per Node", placeholder: "4" },
        ],
    },
};

const connectorIcon = (connector: string) => {
    if (connector === "iceberg") return <Database className="w-4 h-4 text-primary" />;
    if (connector === "hive") return <HardDrive className="w-4 h-4 text-warning" />;
    if (connector === "postgresql" || connector === "mysql") return <Server className="w-4 h-4 text-success" />;
    if (connector === "tpch" || connector === "tpcds") return <Cpu className="w-4 h-4 text-accent" />;
    return <Plug className="w-4 h-4 text-muted" />;
};

export default function TrinoPage() {
    const { data: session, status } = useSession({ required: true });
    const { t } = useLocale();

    const [activeTab, setActiveTab] = useState<Tab>("catalogs");
    const [catalogs, setCatalogs] = useState<CatalogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [selectedConnector, setSelectedConnector] = useState("iceberg");
    const [newCatalogName, setNewCatalogName] = useState("");
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [connectorDropdownOpen, setConnectorDropdownOpen] = useState(false);
    const [clusterInfo, setClusterInfo] = useState<{ columns: any[]; data: any[][] } | null>(null);
    const [sessionProps, setSessionProps] = useState<{ columns: any[]; data: any[][] } | null>(null);
    const [expandedCatalog, setExpandedCatalog] = useState<string | null>(null);

    const fetchCatalogs = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch("/api/trino/catalogs");
            if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to fetch catalogs"); }
            const data = await res.json();
            setCatalogs(data.catalogs || []);
        } catch (err: any) { setError(err.message); }
        setLoading(false);
    }, []);

    const fetchClusterInfo = useCallback(async () => {
        try {
            const [nodesRes, propsRes] = await Promise.all([
                fetch("/api/trino/catalogs?action=cluster-info"),
                fetch("/api/trino/catalogs?action=session-properties"),
            ]);
            if (nodesRes.ok) setClusterInfo(await nodesRes.json());
            if (propsRes.ok) setSessionProps(await propsRes.json());
        } catch { /* ignore */ }
    }, []);

    const deleteCatalog = async (name: string) => {
        if (!confirm(`${t("trino.deleteConfirm")} "${name}"?`)) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/trino/catalogs?name=${encodeURIComponent(name)}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSuccess(data.message); fetchCatalogs();
        } catch (err: any) { setError(err.message); }
        setLoading(false);
    };

    const addCatalog = async () => {
        if (!newCatalogName.trim()) return;
        setLoading(true); setError(null);
        try {
            const template = CONNECTOR_TEMPLATES[selectedConnector];
            const properties: Record<string, string> = {};
            template.fields.forEach((f) => { const val = formValues[f.key] || f.placeholder; if (val) properties[f.key] = val; });
            properties["connector.name"] = selectedConnector === "tpch" || selectedConnector === "tpcds"
                ? selectedConnector : template.fields[0]?.placeholder || selectedConnector;
            const res = await fetch("/api/trino/catalogs", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newCatalogName, properties }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSuccess(data.message); setNewCatalogName(""); setFormValues({}); setActiveTab("catalogs"); fetchCatalogs();
        } catch (err: any) { setError(err.message); }
        setLoading(false);
    };

    useEffect(() => {
        const template = CONNECTOR_TEMPLATES[selectedConnector];
        if (template) { const defaults: Record<string, string> = {}; template.fields.forEach((f) => { defaults[f.key] = ""; }); setFormValues(defaults); }
    }, [selectedConnector]);

    useEffect(() => { if (status === "authenticated") { fetchCatalogs(); fetchClusterInfo(); } }, [status, fetchCatalogs, fetchClusterInfo]);
    useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 5000); return () => clearTimeout(t); } }, [success]);

    if (status === "loading") {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    }

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: "catalogs", label: t("trino.catalogs"), icon: <Database className="w-4 h-4" /> },
        { id: "add-connection", label: t("trino.addConnection"), icon: <Plus className="w-4 h-4" /> },
        { id: "config", label: t("trino.configuration"), icon: <Settings2 className="w-4 h-4" /> },
        { id: "dashboard", label: t("trino.dashboard"), icon: <LayoutDashboard className="w-4 h-4" /> },
    ];

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-8 max-w-[1100px]">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl font-semibold text-foreground">{t("trino.title")}</h1>
                        <p className="text-sm text-muted mt-0.5">{t("trino.subtitle")}</p>
                    </div>
                    <button onClick={() => { fetchCatalogs(); fetchClusterInfo(); }} className="btn-ghost">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> {t("common.refresh")}
                    </button>
                </div>

                {/* Alerts */}
                <AnimatePresence>
                    {error && (
                        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="alert alert-error mb-4">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div className="flex-1 text-sm">{error}</div>
                            <button onClick={() => setError(null)} className="btn-ghost p-1"><X className="w-3.5 h-3.5" /></button>
                        </motion.div>
                    )}
                    {success && (
                        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="alert alert-success mb-4">
                            <Check className="w-4 h-4" /><span className="text-sm">{success}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Tabs */}
                <div className="flex gap-0 border-b border-cardBorder mb-6 overflow-x-auto">
                    {tabs.map((tab) => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`tab-btn ${activeTab === tab.id ? "tab-btn-active" : ""}`}>
                            {tab.icon}{tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab: Catalogs */}
                {activeTab === "catalogs" && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-sm font-semibold">{t("trino.catalogs")}</h2>
                            <span className="badge badge-neutral">{catalogs.length} {t("trino.catalogCount")}</span>
                        </div>
                        {loading && catalogs.length === 0 ? (
                            <div className="panel-card p-12 text-center">
                                <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-3" />
                                <p className="text-sm text-muted">{t("trino.loadingCatalogs")}</p>
                            </div>
                        ) : catalogs.length === 0 ? (
                            <div className="panel-card p-12 text-center">
                                <Database className="w-8 h-8 text-muted mx-auto mb-3" />
                                <p className="text-sm text-muted mb-3">{t("trino.noCatalogs")}</p>
                                <button onClick={() => setActiveTab("add-connection")} className="btn-primary text-sm">
                                    <Plus className="w-4 h-4" /> {t("trino.addConnection")}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {catalogs.map((cat) => (
                                    <div key={cat.name} className="panel-card overflow-hidden">
                                        <div className="px-4 py-3 flex items-center justify-between group">
                                            <div className="flex items-center gap-3 cursor-pointer flex-1"
                                                onClick={() => setExpandedCatalog(expandedCatalog === cat.name ? null : cat.name)}>
                                                {connectorIcon(cat.connector)}
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-sm font-medium text-foreground">{cat.name}</h3>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[11px] text-muted font-mono bg-surface px-1.5 py-0.5 rounded">{cat.connector}</span>
                                                        {cat.properties["s3.endpoint"] && <span className="text-[11px] text-muted truncate">{cat.properties["s3.endpoint"]}</span>}
                                                        {cat.properties["connection-url"] && <span className="text-[11px] text-muted truncate">{cat.properties["connection-url"]}</span>}
                                                    </div>
                                                </div>
                                                <ChevronDown className={`w-4 h-4 text-muted transition-transform ${expandedCatalog === cat.name ? "rotate-180" : ""}`} />
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); deleteCatalog(cat.name); }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity btn-danger ml-2">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <AnimatePresence>
                                            {expandedCatalog === cat.name && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                                                    <div className="px-4 pb-3">
                                                        <div className="bg-surface rounded-md border border-cardBorder p-3 space-y-1.5">
                                                            {Object.entries(cat.properties).map(([key, val]) => (
                                                                <div key={key} className="flex items-center justify-between text-xs">
                                                                    <code className="text-primary/80">{key}</code>
                                                                    <code className="text-muted bg-card px-2 py-0.5 rounded max-w-[50%] truncate">
                                                                        {key.toLowerCase().includes("password") || key.toLowerCase().includes("secret") ? "••••••••" : val}
                                                                    </code>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Tab: Add Connection */}
                {activeTab === "add-connection" && (
                    <div className="space-y-5">
                        <h2 className="text-sm font-semibold">{t("trino.newConnection")}</h2>
                        <div className="panel-card p-6 space-y-5">
                            <div>
                                <label className="text-xs text-muted uppercase block mb-1.5">{t("trino.catalogName")}</label>
                                <input value={newCatalogName} onChange={(e) => setNewCatalogName(e.target.value)}
                                    className="input-field font-mono" placeholder="my_catalog" />
                            </div>
                            <div className="relative">
                                <label className="text-xs text-muted uppercase block mb-1.5">{t("trino.connectionType")}</label>
                                <button onClick={() => setConnectorDropdownOpen(!connectorDropdownOpen)}
                                    className="input-field flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center gap-2">{connectorIcon(selectedConnector)}<span>{CONNECTOR_TEMPLATES[selectedConnector]?.label}</span></div>
                                    <ChevronDown className={`w-4 h-4 text-muted transition-transform ${connectorDropdownOpen ? "rotate-180" : ""}`} />
                                </button>
                                <AnimatePresence>
                                    {connectorDropdownOpen && (
                                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                                            className="absolute z-20 mt-1 w-full rounded-md bg-card border border-cardBorder shadow-xl overflow-hidden">
                                            {Object.entries(CONNECTOR_TEMPLATES).map(([key, tmpl]) => (
                                                <button key={key} onClick={() => { setSelectedConnector(key); setConnectorDropdownOpen(false); }}
                                                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-card-hover transition-colors text-left ${selectedConnector === key ? "bg-card-hover text-foreground" : "text-muted"}`}>
                                                    {connectorIcon(key)}{tmpl.label}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {CONNECTOR_TEMPLATES[selectedConnector]?.fields.map((field) => (
                                    <div key={field.key} className={field.key === "connection-url" || field.key === "iceberg.rest-catalog.uri" ? "md:col-span-2" : ""}>
                                        <label className="text-xs text-muted uppercase block mb-1.5">
                                            {field.label}{field.required && <span className="text-error ml-1">*</span>}
                                        </label>
                                        <input type={field.secret ? "password" : "text"} value={formValues[field.key] || ""}
                                            onChange={(e) => setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                            placeholder={field.placeholder} className="input-field font-mono text-sm" />
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-3 pt-3 border-t border-cardBorder">
                                <button onClick={() => { setNewCatalogName(""); setFormValues({}); }} className="btn-secondary">{t("common.clear")}</button>
                                <button onClick={addCatalog} disabled={!newCatalogName.trim() || loading} className="btn-primary flex-1">
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    {loading ? t("trino.adding") : t("trino.addCatalog")}
                                </button>
                            </div>
                            <p className="text-xs text-muted flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5" />{t("trino.restartNote")}
                            </p>
                        </div>
                    </div>
                )}

                {/* Tab: Config */}
                {activeTab === "config" && (
                    <div className="space-y-5">
                        <h2 className="text-sm font-semibold">{t("trino.clusterConfig")}</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                { icon: Server, color: "text-primary", label: t("trino.coordinator"), value: "core-data-stack-trino" },
                                { icon: Cpu, color: "text-accent", label: t("trino.workerCount"), value: clusterInfo?.data ? String(clusterInfo.data.filter((r) => !r.includes(true) && !r.some(v => v === true)).length) : "—" },
                                { icon: Link2, color: "text-warning", label: t("trino.internalUrl"), value: "http://core-data-stack-trino:8080" },
                                { icon: ExternalLink, color: "text-success", label: t("trino.externalUrl"), value: "http://trino.aetherlake.local" },
                            ].map((item, i) => (
                                <div key={i} className="panel-card p-4">
                                    <item.icon className={`w-4 h-4 ${item.color} mb-2`} />
                                    <p className="text-[11px] text-muted uppercase mb-0.5">{item.label}</p>
                                    <p className="font-mono text-xs text-foreground truncate">{item.value}</p>
                                </div>
                            ))}
                        </div>
                        {clusterInfo && clusterInfo.data.length > 0 && (
                            <div className="panel-card overflow-hidden">
                                <div className="px-4 py-3 border-b border-cardBorder">
                                    <h3 className="text-xs font-semibold uppercase text-muted">{t("trino.activeNodes")}</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="data-table">
                                        <thead><tr>{clusterInfo.columns.map((col, i) => <th key={i}>{col.name}</th>)}</tr></thead>
                                        <tbody>{clusterInfo.data.map((row, ri) => (
                                            <tr key={ri}>{row.map((val, ci) => <td key={ci}>{val === null ? <span className="italic text-muted/50">NULL</span> : String(val)}</td>)}</tr>
                                        ))}</tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        {sessionProps && sessionProps.data.length > 0 && (
                            <div className="panel-card overflow-hidden">
                                <div className="px-4 py-3 border-b border-cardBorder">
                                    <h3 className="text-xs font-semibold uppercase text-muted">{t("trino.sessionProps")}</h3>
                                </div>
                                <div className="max-h-[400px] overflow-y-auto">
                                    <div className="divide-y divide-cardBorder">
                                        {sessionProps.data.map((row, i) => (
                                            <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-card-hover transition-colors">
                                                <div className="flex-1 min-w-0">
                                                    <code className="text-xs text-primary">{row[0]}</code>
                                                    {row[2] && <p className="text-[11px] text-muted/60 truncate mt-0.5">{row[2]}</p>}
                                                </div>
                                                <code className="text-xs text-muted bg-surface px-2 py-0.5 rounded ml-4 shrink-0">{row[1] || "—"}</code>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab: Dashboard */}
                {activeTab === "dashboard" && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-sm font-semibold">{t("trino.webDashboard")}</h2>
                            <a href="http://trino.aetherlake.local" target="_blank" rel="noreferrer" className="btn-ghost text-xs">
                                <ExternalLink className="w-3.5 h-3.5" /> {t("trino.openNewTab")}
                            </a>
                        </div>
                        <div className="panel-card overflow-hidden" style={{ height: "calc(100vh - 300px)" }}>
                            <iframe src="http://trino.aetherlake.local" className="w-full h-full border-0" title="Trino Web UI"
                                onError={() => setError(t("trino.dashboardError"))} />
                        </div>
                        <p className="text-xs text-muted flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {t("trino.dnsNote")} <code className="text-primary/80">trino.aetherlake.local</code> {t("trino.dnsNoteSuffix")}
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
