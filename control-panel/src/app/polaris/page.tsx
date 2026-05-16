"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import { AnimatePresence, motion } from "framer-motion";
import {
    Network, Plus, Trash2, FolderOpen, FolderPlus,
    RefreshCw, Settings2, Database, ChevronRight,
    Loader2, AlertCircle, Check, X
} from "lucide-react";

type Tab = "catalogs" | "namespaces" | "config";

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
    useEffect(() => { if (success) { const timer = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(timer); } }, [success]);

    if (status === "loading") {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    }

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: "catalogs", label: t("polaris.catalogs"), icon: <Database className="w-4 h-4" /> },
        { id: "namespaces", label: t("polaris.namespaces"), icon: <FolderOpen className="w-4 h-4" /> },
        { id: "config", label: t("polaris.configuration"), icon: <Settings2 className="w-4 h-4" /> },
    ];

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-8 max-w-[1100px]">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl font-semibold text-foreground">{t("polaris.title")}</h1>
                        <p className="text-sm text-muted mt-0.5">{t("polaris.subtitle")}</p>
                    </div>
                    <button onClick={fetchCatalogs} className="btn-ghost">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> {t("common.refresh")}
                    </button>
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

                <div className="flex gap-0 border-b border-cardBorder mb-6">
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
                        <div className="flex justify-between items-center">
                            <h2 className="text-sm font-semibold">{t("polaris.catalogs")}</h2>
                            <button onClick={() => setShowCreateCatalog(true)} className="btn-primary text-sm">
                                <Plus className="w-4 h-4" /> {t("polaris.createCatalog")}
                            </button>
                        </div>
                        {catalogs.length === 0 && !loading ? (
                            <div className="panel-card p-12 text-center">
                                <Database className="w-8 h-8 text-muted mx-auto mb-3" />
                                <p className="text-sm text-muted">{t("polaris.noCatalogs")}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {catalogs.map(cat => (
                                    <div key={cat.name} className="panel-card px-4 py-3 flex items-center justify-between group panel-card-hover">
                                        <div className="flex items-center gap-3">
                                            <Database className="w-4 h-4 text-warning" />
                                            <div>
                                                <h3 className="text-sm font-medium text-foreground">{cat.name}</h3>
                                                <p className="text-[11px] text-muted">{cat.type} · {cat.properties?.["default-base-location"] || "—"}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => { setSelectedCatalog(cat.name); setActiveTab("namespaces"); fetchNamespaces(cat.name); }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost text-xs text-primary">
                                                {t("polaris.namespaces")} <ChevronRight className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => deleteCatalog(cat.name)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity btn-danger">
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
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-semibold">{t("polaris.namespaces")}</h2>
                                {selectedCatalog && <span className="badge badge-warning">{selectedCatalog}</span>}
                            </div>
                            {selectedCatalog && (
                                <button onClick={() => setShowCreateNs(true)} className="btn-primary text-sm">
                                    <FolderPlus className="w-4 h-4" /> {t("polaris.createNamespace")}
                                </button>
                            )}
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
                        ) : (
                            <div className="space-y-1">
                                {namespaces.map((ns, i) => (
                                    <div key={i} className="panel-card px-4 py-2.5 flex items-center gap-3">
                                        <FolderOpen className="w-4 h-4 text-accent" />
                                        <span className="font-mono text-sm text-foreground">{ns.join(".")}</span>
                                    </div>
                                ))}
                            </div>
                        )}
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
                                            <code className="text-xs text-primary">{prop.key}</code>
                                            <p className="text-[11px] text-muted">{prop.desc}</p>
                                        </div>
                                        <code className="text-xs text-muted bg-card px-2 py-0.5 rounded">{prop.value}</code>
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
