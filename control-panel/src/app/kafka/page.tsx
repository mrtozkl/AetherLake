"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import { AnimatePresence, motion } from "framer-motion";
import {
    Radio, RefreshCw, Loader2, AlertCircle, Check, X,
    Server, Activity, Link2, ChevronDown, Layers, Cpu,
    Search, Copy, Waves, Database, ExternalLink
} from "lucide-react";

interface KafkaCondition {
    type: string;
    status: string;
    lastTransitionTime?: string;
    message?: string;
}

interface KafkaTopicSummary {
    name: string;
    partitions: number;
    replicas: number;
    ready: boolean;
    message: string | null;
    config: Record<string, unknown>;
}

interface KafkaBrokerSummary {
    name: string;
    ready: boolean;
    restarts: number;
    nodeId: string | null;
}

interface KafkaClusterSummary {
    name: string;
    ready: boolean;
    kafkaVersion: string | null;
    conditions: KafkaCondition[];
    listeners: { name: string; type?: string; port?: number }[];
    bootstrapServers: string | null;
}

interface KafkaState {
    cluster: KafkaClusterSummary | null;
    brokers: KafkaBrokerSummary[];
    topics: KafkaTopicSummary[];
}

export default function KafkaPage() {
    const { data: session, status } = useSession({ required: true });
    const { t } = useLocale();

    const [state, setState] = useState<KafkaState | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
    const [topicSearch, setTopicSearch] = useState("");
    const [copiedBootstrap, setCopiedBootstrap] = useState(false);

    const fetchState = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch("/api/kafka");
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to fetch Kafka state");
            }
            setState(await res.json());
        } catch (err: any) { setError(err.message); }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (status !== "authenticated") return;
        fetchState();
        const interval = setInterval(() => fetchState(), 30000);
        return () => clearInterval(interval);
    }, [status, fetchState]);

    const filteredTopics = useMemo(() => {
        if (!state?.topics) return [];
        if (!topicSearch.trim()) return state.topics;
        const q = topicSearch.toLowerCase();
        return state.topics.filter(t => t.name.toLowerCase().includes(q));
    }, [state?.topics, topicSearch]);

    if (status === "loading") {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    }

    const cluster = state?.cluster;
    const totalPartitions = state?.topics.reduce((acc, t) => acc + (t.partitions || 0), 0) ?? 0;
    const readyBrokers = state?.brokers.filter((b) => b.ready).length ?? 0;
    const totalBrokers = state?.brokers.length ?? 0;

    const copyBootstrap = (val: string) => {
        navigator.clipboard.writeText(val);
        setCopiedBootstrap(true);
        setTimeout(() => setCopiedBootstrap(false), 2000);
    };

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-8 max-w-[1200px]">
                {/* Standardized Enterprise Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-cardBorder">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                <Radio className="w-4 h-4" />
                            </div>
                            <h1 className="text-lg font-semibold text-foreground tracking-tight">
                                {t("kafka.title")}
                            </h1>
                            <span className="badge badge-neutral text-[10px]">Strimzi Operator</span>
                        </div>
                        <p className="text-xs text-muted mt-1">{t("kafka.subtitle")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={fetchState} className="btn-ghost text-xs">
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> {t("common.refresh")}
                        </button>
                    </div>
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
                </AnimatePresence>

                {!state ? (
                    <div className="panel-card p-12 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-3" />
                        <p className="text-sm text-muted">{t("kafka.loading")}</p>
                    </div>
                ) : !cluster ? (
                    <div className="panel-card p-12 text-center">
                        <Radio className="w-8 h-8 text-muted mx-auto mb-3" />
                        <p className="text-sm text-muted">{t("kafka.noCluster")}</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Standardized 4-Card Enterprise KPI Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="panel-card p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-medium text-muted uppercase tracking-wider">{t("kafka.status")}</span>
                                    <span className={`status-dot ${cluster.ready ? "status-dot-healthy" : "status-dot-error"}`}></span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className={`badge ${cluster.ready ? "badge-success" : "badge-error"} text-xs`}>
                                        {cluster.ready ? t("kafka.ready") : t("kafka.notReady")}
                                    </span>
                                    {cluster.kafkaVersion && (
                                        <span className="text-[11px] font-mono text-muted">v{cluster.kafkaVersion}</span>
                                    )}
                                </div>
                            </div>

                            <div className="panel-card p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-medium text-muted uppercase tracking-wider">{t("kafka.topics")}</span>
                                    <Layers className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-xl font-semibold text-foreground font-mono">{state.topics.length}</p>
                                    <span className="text-xs text-muted font-normal">{t("kafka.topicCount")}</span>
                                </div>
                            </div>

                            <div className="panel-card p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-medium text-muted uppercase tracking-wider">{t("kafka.totalPartitions")}</span>
                                    <Cpu className="w-4 h-4 text-accent" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-xl font-semibold text-foreground font-mono">{totalPartitions}</p>
                                    <span className="text-xs text-muted font-normal">{t("kafka.partitions")}</span>
                                </div>
                            </div>

                            <div className="panel-card p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-medium text-muted uppercase tracking-wider">{t("kafka.brokers")}</span>
                                    <Server className="w-4 h-4 text-success" />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-xl font-semibold text-foreground font-mono">{readyBrokers}<span className="text-xs text-muted font-normal">/{totalBrokers}</span></p>
                                    <span className="text-xs text-success font-medium">Online</span>
                                </div>
                            </div>
                        </div>

                        {/* Listener Endpoints Banner */}
                        {cluster.bootstrapServers && (
                            <div className="panel-card p-4 bg-surface/50 border border-cardBorder flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-md bg-warning/10 border border-warning/20 flex items-center justify-center text-warning shrink-0">
                                        <Link2 className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-foreground">{t("kafka.bootstrap")}</span>
                                            <span className="badge badge-neutral text-[10px]">PLAINTEXT</span>
                                        </div>
                                        <code className="text-xs text-muted font-mono truncate mt-0.5 block">{cluster.bootstrapServers}</code>
                                    </div>
                                </div>
                                <button
                                    onClick={() => copyBootstrap(cluster.bootstrapServers || "")}
                                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 shrink-0 self-end sm:self-auto"
                                >
                                    {copiedBootstrap ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                                    <span>{copiedBootstrap ? t("common.copied") : t("common.copy")}</span>
                                </button>
                            </div>
                        )}

                        {/* Brokers Table */}
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{t("kafka.brokers")}</h2>
                                <span className="badge badge-neutral text-[10px]">{state.brokers.length} nodes</span>
                            </div>
                            <div className="panel-card overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>{t("kafka.broker")}</th>
                                                <th>Node ID</th>
                                                <th>{t("kafka.status")}</th>
                                                <th className="text-right">{t("kafka.restarts")}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {state.brokers.map((broker) => (
                                                <tr key={broker.name}>
                                                    <td className="font-mono text-xs font-medium text-foreground">{broker.name}</td>
                                                    <td><code className="text-[11px] text-muted font-mono">{broker.nodeId ?? "—"}</code></td>
                                                    <td>
                                                        <span className={`badge ${broker.ready ? "badge-success" : "badge-error"}`}>
                                                            <span className={`status-dot ${broker.ready ? "status-dot-healthy" : "status-dot-error"}`}></span>
                                                            {broker.ready ? t("kafka.ready") : t("kafka.notReady")}
                                                        </span>
                                                    </td>
                                                    <td className="text-right font-mono text-xs text-muted">{broker.restarts}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Topics List with Search & Actions */}
                        <div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{t("kafka.topics")}</h2>
                                    <span className="badge badge-neutral text-[10px]">{filteredTopics.length} / {state.topics.length}</span>
                                </div>

                                {/* Topic Search Input */}
                                <div className="relative min-w-[240px]">
                                    <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        value={topicSearch}
                                        onChange={(e) => setTopicSearch(e.target.value)}
                                        placeholder={t("kafka.searchTopics")}
                                        className="input-field text-xs py-1.5 pl-8 pr-7 w-full"
                                    />
                                    {topicSearch && (
                                        <button
                                            onClick={() => setTopicSearch("")}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {filteredTopics.length === 0 ? (
                                <div className="panel-card p-12 text-center">
                                    <Layers className="w-8 h-8 text-muted mx-auto mb-3" />
                                    <p className="text-sm text-muted">{t("kafka.noTopics")}</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredTopics.map((topic) => (
                                        <div key={topic.name} className="panel-card overflow-hidden">
                                            <div
                                                className="px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-surface/30 transition-colors"
                                                onClick={() => setExpandedTopic(expandedTopic === topic.name ? null : topic.name)}
                                            >
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <Radio className={`w-4 h-4 shrink-0 ${topic.ready ? "text-success" : "text-error"}`} />
                                                    <div className="min-w-0">
                                                        <h3 className="text-xs font-semibold text-foreground font-mono truncate">{topic.name}</h3>
                                                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted">
                                                            <span className="badge badge-neutral text-[10px] font-mono">{topic.partitions} {t("kafka.partitions")}</span>
                                                            <span className="text-muted">·</span>
                                                            <span>{topic.replicas} {t("kafka.replicas")}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0 self-end md:self-auto" onClick={(e) => e.stopPropagation()}>
                                                    {/* Deep-link to SQL IDE */}
                                                    <a
                                                        href={`/query?sql=${encodeURIComponent(`SELECT * FROM kafka."default"."${topic.name}" LIMIT 50`)}`}
                                                        className="btn-ghost text-xs py-1 px-2 flex items-center gap-1"
                                                        title={t("kafka.queryTopic")}
                                                    >
                                                        <Database className="w-3 h-3 text-primary" />
                                                        <span className="hidden sm:inline">{t("kafka.queryTopic")}</span>
                                                    </a>

                                                    {/* Deep-link to Flink */}
                                                    <a
                                                        href={`/flink?topic=${encodeURIComponent(topic.name)}`}
                                                        className="btn-ghost text-xs py-1 px-2 flex items-center gap-1"
                                                        title={t("kafka.streamInFlink")}
                                                    >
                                                        <Waves className="w-3 h-3 text-accent" />
                                                        <span className="hidden sm:inline">{t("kafka.streamInFlink")}</span>
                                                    </a>

                                                    <span className={`badge ${topic.ready ? "badge-success" : "badge-error"} text-[10px]`}>
                                                        {topic.ready ? t("kafka.ready") : t("kafka.notReady")}
                                                    </span>

                                                    <button
                                                        onClick={() => setExpandedTopic(expandedTopic === topic.name ? null : topic.name)}
                                                        className="p-1 text-muted hover:text-foreground transition-colors"
                                                    >
                                                        <ChevronDown className={`w-4 h-4 transition-transform ${expandedTopic === topic.name ? "rotate-180" : ""}`} />
                                                    </button>
                                                </div>
                                            </div>
                                            <AnimatePresence>
                                                {expandedTopic === topic.name && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                                                        <div className="px-4 pb-3 pt-1 border-t border-cardBorder/50 bg-surface/20">
                                                            {topic.message && (
                                                                <div className="alert alert-error mb-2 text-xs">
                                                                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                                    <span>{topic.message}</span>
                                                                </div>
                                                            )}
                                                            <div className="bg-surface rounded-md border border-cardBorder p-3 space-y-1.5">
                                                                {Object.keys(topic.config).length === 0 ? (
                                                                    <p className="text-xs text-muted italic">{t("kafka.defaultConfig")}</p>
                                                                ) : Object.entries(topic.config).map(([key, val]) => (
                                                                    <div key={key} className="flex items-center justify-between text-xs">
                                                                        <code className="text-primary/80 font-mono">{key}</code>
                                                                        <code className="text-muted bg-card px-2 py-0.5 rounded font-mono">{String(val)}</code>
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

                        {/* Cluster conditions */}
                        {cluster.conditions.length > 0 && (
                            <div>
                                <h2 className="text-sm font-semibold mb-2">{t("kafka.conditions")}</h2>
                                <div className="panel-card overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>{t("kafka.condition")}</th>
                                                    <th>{t("kafka.status")}</th>
                                                    <th>{t("kafka.lastTransition")}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {cluster.conditions.map((condition) => (
                                                    <tr key={condition.type}>
                                                        <td className="font-mono text-xs">{condition.type}</td>
                                                        <td>
                                                            <span className={`badge ${condition.status === "True" ? "badge-success" : "badge-warning"}`}>
                                                                {condition.status}
                                                            </span>
                                                        </td>
                                                        <td className="text-xs text-muted">
                                                            {condition.lastTransitionTime ? new Date(condition.lastTransitionTime).toLocaleString() : "—"}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
