"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import { AnimatePresence, motion } from "framer-motion";
import {
    Network, Plus, Trash2, FolderOpen, FolderPlus,
    RefreshCw, Settings2, Database, ChevronRight,
    Loader2, AlertCircle, Check, X, Search, Copy,
    Terminal, ExternalLink, Code2, Layers, Key, Table2
} from "lucide-react";

type Tab = "catalogs" | "namespaces" | "snippets" | "config";

interface Catalog {
    name: string;
    type: string;
    properties: Record<string, string>;
}

export default function PolarisPage() {
    const { data: session, status } = useSession({ required: true });
    const { t } = useLocale();

    const [activeTab, setActiveTab] = useState<Tab>("catalogs");
    const [catalogs, setCatalogs] = useState<Catalog[]>([]);
    const [selectedCatalog, setSelectedCatalog] = useState<string | null>(null);
    const [namespaces, setNamespaces] = useState<string[][]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
    const [showCreateCatalog, setShowCreateCatalog] = useState(false);
    const [newCatalogName, setNewCatalogName] = useState("");
    const [newCatalogWarehouse, setNewCatalogWarehouse] = useState("s3://lakehouse/");
    const [showCreateNs, setShowCreateNs] = useState(false);
    const [newNsName, setNewNsName] = useState("");

    const polarisGet = useCallback(async (path: string) => {
        return await fetch(`/api/polaris?path=${encodeURIComponent(path)}`);
    }, []);

    const polarisMutate = useCallback(async (path: string, method: string, body?: any) => {
        return await fetch(`/api/polaris?path=${encodeURIComponent(path)}`, {
            method, headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
        });
    }, []);

    const fetchCatalogs = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await polarisGet("/api/catalog/v1/config");
            if (res.status === 401) { setError("Polaris authentication required."); setLoading(false); return; }
            const catRes = await polarisGet("/api/management/v1/catalogs");
            if (!catRes.ok) { setError(`Failed to list catalogs: ${catRes.status}`); }
            else { const data = await catRes.json(); setCatalogs(data.catalogs || []); }
        } catch (err: any) { setError(err.message); }
        setLoading(false);
    }, [polarisGet]);

    const fetchNamespaces = useCallback(async (catalogName: string) => {
        setLoading(true); setError(null);
        try {
            const res = await polarisGet(`/api/catalog/v1/${catalogName}/namespaces`);
            if (!res.ok) setError(`Failed to list namespaces: ${res.status}`);
            else { const data = await res.json(); setNamespaces(data.namespaces || []); }
        } catch (err: any) { setError(err.message); }
        setLoading(false);
    }, [polarisGet]);

    const createCatalog = async () => {
        if (!newCatalogName.trim()) return;
        setLoading(true); setError(null);
        try {
            const res = await polarisMutate("/api/management/v1/catalogs", "POST", {
                catalog: { name: newCatalogName, type: "INTERNAL",
                    properties: { "default-base-location": newCatalogWarehouse },
                    storageConfigInfo: { storageType: "S3", allowedLocations: [newCatalogWarehouse] },
                },
            });
            if (!res.ok) { const err = await res.text(); setError(`Failed: ${err}`); }
            else { setSuccess(`Catalog "${newCatalogName}" created!`); setShowCreateCatalog(false); setNewCatalogName(""); fetchCatalogs(); }
        } catch (err: any) { setError(err.message); }
        setLoading(false);
    };

    const createNamespace = async () => {
        if (!newNsName.trim() || !selectedCatalog) return;
        setLoading(true);
        try {
            const res = await polarisMutate(`/api/catalog/v1/${selectedCatalog}/namespaces`, "POST", { namespace: [newNsName], properties: {} });
            if (!res.ok) { const err = await res.text(); setError(`Failed: ${err}`); }
            else { setSuccess(`Namespace "${newNsName}" created!`); setShowCreateNs(false); setNewNsName(""); fetchNamespaces(selectedCatalog); }
        } catch (err: any) { setError(err.message); }
        setLoading(false);
    };

    const deleteCatalog = async (name: string) => {
        if (!confirm(`${t("polaris.deleteConfirm")} "${name}"${t("polaris.deleteWarn")}`)) return;
        setLoading(true);
        try {
            const res = await polarisMutate(`/api/management/v1/catalogs/${name}`, "DELETE");
            if (!res.ok) setError(`Failed to delete: ${res.status}`);
            else { setSuccess(`Catalog "${name}" deleted.`); fetchCatalogs(); }
        } catch (err: any) { setError(err.message); }
        setLoading(false);
    };

    useEffect(() => { if (status === "authenticated") fetchCatalogs(); }, [status, fetchCatalogs]);
    useEffect(() => {
        if (catalogs.length > 0 && !selectedCatalog) {
            setSelectedCatalog(catalogs[0].name);
            fetchNamespaces(catalogs[0].name);
        }
    }, [catalogs, selectedCatalog, fetchNamespaces]);
    useEffect(() => { if (success) { const timer = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(timer); } }, [success]);

    if (status === "loading") {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    }

    const handleCopy = (key: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedSnippet(key);
        setTimeout(() => setCopiedSnippet(null), 2000);
    };

    const CLIENT_SNIPPETS = [
        {
            id: "trino",
            title: t("polaris.snippetTrino"),
            lang: "properties",
            code: `# etc/catalog/iceberg.properties
connector.name=iceberg
iceberg.catalog.type=rest
iceberg.rest-catalog.uri=http://polaris:8181/api/catalog
iceberg.rest-catalog.warehouse=s3://lakehouse/
hive.s3.endpoint=http://minio:9000
hive.s3.path-style-access=true
hive.s3.ssl.enabled=false`,
        },
        {
            id: "spark",
            title: t("polaris.snippetSpark"),
            lang: "python",
            code: `# PySpark Session with Polaris REST Catalog
from pyspark.sql import SparkSession

spark = SparkSession.builder \\
    .appName("AetherLake-Polaris") \\
    .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions") \\
    .config("spark.sql.catalog.iceberg", "org.apache.iceberg.spark.SparkCatalog") \\
    .config("spark.sql.catalog.iceberg.type", "rest") \\
    .config("spark.sql.catalog.iceberg.uri", "http://polaris:8181/api/catalog") \\
    .config("spark.sql.catalog.iceberg.warehouse", "s3://lakehouse/") \\
    .config("spark.sql.catalog.iceberg.io-impl", "org.apache.iceberg.aws.s3.S3FileIO") \\
    .config("spark.sql.catalog.iceberg.s3.endpoint", "http://minio:9000") \\
    .getOrCreate()`,
        },
        {
            id: "pyiceberg",
            title: t("polaris.snippetPyIceberg"),
            lang: "python",
            code: `# PyIceberg REST Catalog
from pyiceberg.catalog import load_catalog

catalog = load_catalog(
    "iceberg",
    **{
        "type": "rest",
        "uri": "http://polaris:8181/api/catalog",
        "warehouse": "s3://lakehouse/",
        "s3.endpoint": "http://minio:9000",
        "s3.access-key-id": "admin",
        "s3.secret-access-key": "password",
    }
)

# List namespaces
print(catalog.list_namespaces())`,
        },
    ];

    const filteredCatalogs = catalogs.filter(c => !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredNamespaces = namespaces.filter(ns => !searchQuery.trim() || ns.join(".").toLowerCase().includes(searchQuery.toLowerCase()));

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: "catalogs", label: t("polaris.catalogs"), icon: <Database className="w-4 h-4" /> },
        { id: "namespaces", label: t("polaris.namespaces"), icon: <FolderOpen className="w-4 h-4" /> },
        { id: "snippets", label: t("polaris.tabSnippets"), icon: <Terminal className="w-4 h-4" /> },
        { id: "config", label: t("polaris.configuration"), icon: <Settings2 className="w-4 h-4" /> },
    ];

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-8 max-w-[1200px]">
                {/* Standardized Enterprise Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-cardBorder">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                <Network className="w-4 h-4" />
                            </div>
                            <h1 className="text-lg font-semibold text-foreground tracking-tight">
                                {t("polaris.title")}
                            </h1>
                            <span className="badge badge-neutral text-[10px]">Apache Polaris</span>
                        </div>
                        <p className="text-xs text-muted mt-1">{t("polaris.subtitle")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={fetchCatalogs} className="btn-ghost text-xs">
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> {t("common.refresh")}
                        </button>
                    </div>
                </div>

                {/* Standardized 4-Card Enterprise KPI Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    <div className="panel-card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-medium text-muted uppercase tracking-wider">{t("polaris.catalogs")}</span>
                            <Database className="w-4 h-4 text-warning" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <p className="text-xl font-semibold text-foreground font-mono">{catalogs.length}</p>
                            <span className="text-xs text-muted">catalogs</span>
                        </div>
                    </div>

                    <div className="panel-card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-medium text-muted uppercase tracking-wider">{t("polaris.namespaces")}</span>
                            <FolderOpen className="w-4 h-4 text-accent" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <p className="text-xl font-semibold text-foreground font-mono">{namespaces.length}</p>
                            <span className="text-xs text-muted font-mono">{selectedCatalog ? `(${selectedCatalog})` : ""}</span>
                        </div>
                    </div>

                    <div className="panel-card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Catalog URI</span>
                            <Network className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <p className="text-xs font-mono text-foreground truncate" title="http://polaris:8181/api/catalog">
                                polaris:8181/api/catalog
                            </p>
                        </div>
                    </div>

                    <div className="panel-card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Credential Vending</span>
                            <span className="status-dot status-dot-healthy"></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="badge badge-success text-xs">RBAC Vended</span>
                        </div>
                    </div>
                </div>

                <AnimatePresence>
                    {error && (
                        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="alert alert-error mb-4">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><div className="flex-1 text-sm">{error}</div>
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
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`tab-btn ${activeTab === tab.id ? "tab-btn-active" : ""}`}>
                            {tab.icon}{tab.label}
                        </button>
                    ))}
                </div>

                {/* Catalogs Tab */}
                {activeTab === "catalogs" && (
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{t("polaris.catalogs")}</h2>
                                <span className="badge badge-neutral text-[10px]">{catalogs.length}</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="relative min-w-[200px]">
                                    <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder={t("polaris.searchCatalogs")}
                                        className="input-field text-xs py-1 pl-8 pr-6 w-full"
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>

                                <button onClick={() => setShowCreateCatalog(true)} className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1.5">
                                    <Plus className="w-3.5 h-3.5" /> {t("polaris.createCatalog")}
                                </button>
                            </div>
                        </div>

                        {catalogs.length === 0 && !loading ? (
                            <div className="panel-card p-12 text-center">
                                <Database className="w-8 h-8 text-muted mx-auto mb-3" />
                                <p className="text-sm text-muted">{t("polaris.noCatalogs")}</p>
                            </div>
                        ) : filteredCatalogs.length === 0 ? (
                            <div className="panel-card p-8 text-center text-xs text-muted">
                                {t("home.noServicesFound")}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filteredCatalogs.map(cat => (
                                    <div key={cat.name} className="panel-card px-4 py-3 flex items-center justify-between group panel-card-hover">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-md bg-warning/10 border border-warning/20 flex items-center justify-center text-warning">
                                                <Database className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-semibold text-foreground font-mono">{cat.name}</h3>
                                                    <span className="badge badge-neutral text-[10px]">{cat.type}</span>
                                                </div>
                                                <p className="text-[11px] text-muted font-mono mt-0.5">{cat.properties?.["default-base-location"] || "—"}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => { setSelectedCatalog(cat.name); setActiveTab("namespaces"); fetchNamespaces(cat.name); }}
                                                className="btn-ghost text-xs text-primary flex items-center gap-1">
                                                {t("polaris.namespaces")} <ChevronRight className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => deleteCatalog(cat.name)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity btn-danger text-xs p-1.5">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Namespaces Tab */}
                {activeTab === "namespaces" && (
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{t("polaris.namespaces")}</h2>
                                {selectedCatalog && <span className="badge badge-warning text-xs font-mono">{selectedCatalog}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                {selectedCatalog && (
                                    <div className="relative min-w-[180px]">
                                        <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                                        <input
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder={t("polaris.searchCatalogs")}
                                            className="input-field text-xs py-1 pl-8 pr-6 w-full"
                                        />
                                    </div>
                                )}
                                {selectedCatalog && (
                                    <button onClick={() => setShowCreateNs(true)} className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1.5">
                                        <FolderPlus className="w-3.5 h-3.5" /> {t("polaris.createNamespace")}
                                    </button>
                                )}
                            </div>
                        </div>

                        {!selectedCatalog ? (
                            <div className="panel-card p-12 text-center">
                                <FolderOpen className="w-8 h-8 text-muted mx-auto mb-3" />
                                <p className="text-sm text-muted">{t("polaris.selectCatalog")}</p>
                            </div>
                        ) : namespaces.length === 0 ? (
                            <div className="panel-card p-12 text-center">
                                <FolderOpen className="w-8 h-8 text-muted mx-auto mb-3" />
                                <p className="text-sm text-muted">{t("polaris.noNamespaces")} &quot;{selectedCatalog}&quot;.</p>
                            </div>
                        ) : filteredNamespaces.length === 0 ? (
                            <div className="panel-card p-8 text-center text-xs text-muted">
                                {t("home.noServicesFound")}
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {filteredNamespaces.map((ns, i) => {
                                    const nsFullName = ns.join(".");
                                    return (
                                        <div key={i} className="panel-card px-4 py-2.5 flex items-center justify-between panel-card-hover group">
                                            <div className="flex items-center gap-3">
                                                <FolderOpen className="w-4 h-4 text-accent" />
                                                <span className="font-mono text-xs font-medium text-foreground">{nsFullName}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={`/tables`}
                                                    className="btn-ghost text-xs py-1 px-2 flex items-center gap-1 text-primary"
                                                >
                                                    <Table2 className="w-3 h-3" />
                                                    <span>{t("polaris.exploreInTables")}</span>
                                                </a>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Connection Snippets Tab */}
                {activeTab === "snippets" && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-semibold text-foreground">{t("polaris.clientSnippets")}</h2>
                                <p className="text-xs text-muted mt-0.5">{t("polaris.snippetDesc")}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {CLIENT_SNIPPETS.map((snip) => (
                                <div key={snip.id} className="panel-card overflow-hidden">
                                    <div className="px-4 py-2.5 border-b border-cardBorder bg-surface/50 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Terminal className="w-4 h-4 text-primary" />
                                            <span className="text-xs font-semibold text-foreground">{snip.title}</span>
                                            <span className="badge badge-neutral text-[10px] font-mono">{snip.lang}</span>
                                        </div>
                                        <button
                                            onClick={() => handleCopy(snip.id, snip.code)}
                                            className="btn-ghost text-xs py-1 px-2 flex items-center gap-1.5"
                                        >
                                            {copiedSnippet === snip.id ? (
                                                <>
                                                    <Check className="w-3 h-3 text-success" />
                                                    <span className="text-success">{t("common.copied")}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="w-3 h-3" />
                                                    <span>{t("polaris.copySnippet")}</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <div className="p-3 bg-[#1e1e1e]">
                                        <pre className="text-xs font-mono text-muted/90 overflow-x-auto leading-relaxed">
                                            {snip.code}
                                        </pre>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Config Tab */}
                {activeTab === "config" && (
                    <div className="space-y-5">
                        <h2 className="text-sm font-semibold">{t("polaris.configuration")}</h2>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { label: t("polaris.apiEndpoint"), value: "http://core-data-stack-polaris:8181" },
                                { label: t("polaris.externalUrl"), value: "http://polaris.aetherlake.local" },
                                { label: t("polaris.storageType"), value: "S3 (MinIO)" },
                                { label: t("polaris.s3Endpoint"), value: "http://core-data-stack-minio:9000" },
                            ].map((item, i) => (
                                <div key={i} className="panel-card p-4">
                                    <p className="text-[11px] text-muted uppercase mb-1">{item.label}</p>
                                    <p className="font-mono text-xs text-foreground">{item.value}</p>
                                </div>
                            ))}
                        </div>
                        <div className="panel-card p-5">
                            <h3 className="text-xs font-semibold uppercase text-muted mb-3">{t("polaris.serverProps")}</h3>
                            <div className="space-y-2">
                                {[
                                    { key: "polaris.persistence.type", value: "in-memory", desc: "Storage backend" },
                                    { key: "polaris.realm.default", value: "default-realm", desc: "Default realm" },
                                    { key: "quarkus.http.port", value: "8181", desc: "HTTP port" },
                                ].map(prop => (
                                    <div key={prop.key} className="flex items-center justify-between p-3 bg-surface rounded-md border border-cardBorder">
                                        <div>
                                            <code className="text-xs text-primary font-mono">{prop.key}</code>
                                            <p className="text-[11px] text-muted">{prop.desc}</p>
                                        </div>
                                        <code className="text-xs text-muted bg-card px-2 py-0.5 rounded font-mono">{prop.value}</code>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Create Catalog Modal */}
                <AnimatePresence>
                    {showCreateCatalog && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setShowCreateCatalog(false)}>
                            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="modal-content" onClick={e => e.stopPropagation()}>
                                <div className="modal-header"><h3 className="text-base font-semibold">{t("polaris.createIceberg")}</h3></div>
                                <div className="modal-body space-y-4">
                                    <div>
                                        <label className="text-xs text-muted uppercase block mb-1">{t("polaris.catalogName")}</label>
                                        <input value={newCatalogName} onChange={e => setNewCatalogName(e.target.value)} className="input-field" placeholder="my_catalog" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted uppercase block mb-1">{t("polaris.warehouseLocation")}</label>
                                        <input value={newCatalogWarehouse} onChange={e => setNewCatalogWarehouse(e.target.value)} className="input-field font-mono text-sm" placeholder="s3://lakehouse/" />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button onClick={() => setShowCreateCatalog(false)} className="btn-secondary">{t("common.cancel")}</button>
                                    <button onClick={createCatalog} disabled={!newCatalogName.trim() || loading} className="btn-primary">
                                        {loading ? t("polaris.creating") : t("common.create")}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Create Namespace Modal */}
                <AnimatePresence>
                    {showCreateNs && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setShowCreateNs(false)}>
                            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="modal-content" onClick={e => e.stopPropagation()}>
                                <div className="modal-header"><h3 className="text-base font-semibold">{t("polaris.createNsIn")} <span className="text-warning">{selectedCatalog}</span></h3></div>
                                <div className="modal-body">
                                    <label className="text-xs text-muted uppercase block mb-1">{t("polaris.namespaceName")}</label>
                                    <input value={newNsName} onChange={e => setNewNsName(e.target.value)} className="input-field" placeholder="my_namespace" />
                                </div>
                                <div className="modal-footer">
                                    <button onClick={() => setShowCreateNs(false)} className="btn-secondary">{t("common.cancel")}</button>
                                    <button onClick={createNamespace} disabled={!newNsName.trim() || loading} className="btn-primary">
                                        {loading ? t("polaris.creating") : t("common.create")}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
