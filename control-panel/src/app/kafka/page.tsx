"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import { AnimatePresence, motion } from "framer-motion";
import {
    Radio, RefreshCw, Loader2, AlertCircle, Check, X,
    Server, Activity, Link2, ChevronDown, Layers, Cpu
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

    if (status === "loading") {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    }

    const cluster = state?.cluster;

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-8 max-w-[1100px]">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl font-semibold text-foreground">{t("kafka.title")}</h1>
                        <p className="text-sm text-muted mt-0.5">{t("kafka.subtitle")}</p>
                    </div>
                    <button onClick={fetchState} className="btn-ghost">
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
                        {/* Cluster summary cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="panel-card p-4">
                                <Activity className={`w-4 h-4 mb-2 ${cluster.ready ? "text-success" : "text-error"}`} />
                                <p className="text-[11px] text-muted uppercase mb-0.5">{t("kafka.status")}</p>
                                <span className={`badge ${cluster.ready ? "badge-success" : "badge-error"}`}>
                                    {cluster.ready ? t("kafka.ready") : t("kafka.notReady")}
                                </span>
                            </div>
                            <div className="panel-card p-4">
                                <Cpu className="w-4 h-4 text-accent mb-2" />
                                <p className="text-[11px] text-muted uppercase mb-0.5">{t("kafka.version")}</p>
                                <p className="font-mono text-xs text-foreground">{cluster.kafkaVersion || "—"}</p>
                            </div>
                            <div className="panel-card p-4">
                                <Server className="w-4 h-4 text-primary mb-2" />
                                <p className="text-[11px] text-muted uppercase mb-0.5">{t("kafka.brokers")}</p>
                                <p className="font-mono text-xs text-foreground">
                                    {state.brokers.filter((b) => b.ready).length}/{state.brokers.length}
                                </p>
                            </div>
                            <div className="panel-card p-4">
                                <Link2 className="w-4 h-4 text-warning mb-2" />
                                <p className="text-[11px] text-muted uppercase mb-0.5">{t("kafka.bootstrap")}</p>
                                <p className="font-mono text-xs text-foreground truncate" title={cluster.bootstrapServers || ""}>
                                    {cluster.bootstrapServers || "—"}
                                </p>
                            </div>
                        </div>

                        {/* Brokers */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-sm font-semibold">{t("kafka.brokers")}</h2>
                                <span className="badge badge-neutral">{state.brokers.length}</span>
                            </div>
                            <div className="panel-card overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>{t("kafka.broker")}</th>
                                                <th>{t("kafka.status")}</th>
                                                <th>{t("kafka.restarts")}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {state.brokers.map((broker) => (
                                                <tr key={broker.name}>
                                                    <td className="font-mono text-xs">{broker.name}</td>
                                                    <td>
                                                        <span className={`badge ${broker.ready ? "badge-success" : "badge-error"}`}>
                                                            {broker.ready ? t("kafka.ready") : t("kafka.notReady")}
                                                        </span>
                                                    </td>
                                                    <td className="text-xs text-muted">{broker.restarts}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Topics */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-sm font-semibold">{t("kafka.topics")}</h2>
                                <span className="badge badge-neutral">{state.topics.length} {t("kafka.topicCount")}</span>
                            </div>
                            {state.topics.length === 0 ? (
                                <div className="panel-card p-12 text-center">
                                    <Layers className="w-8 h-8 text-muted mx-auto mb-3" />
                                    <p className="text-sm text-muted">{t("kafka.noTopics")}</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {state.topics.map((topic) => (
                                        <div key={topic.name} className="panel-card overflow-hidden">
                                            <div className="px-4 py-3 flex items-center justify-between cursor-pointer"
                                                onClick={() => setExpandedTopic(expandedTopic === topic.name ? null : topic.name)}>
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <Radio className={`w-4 h-4 ${topic.ready ? "text-success" : "text-error"}`} />
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-sm font-medium text-foreground font-mono">{topic.name}</h3>
                                                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted">
                                                            <span>{topic.partitions} {t("kafka.partitions")}</span>
                                                            <span>{topic.replicas} {t("kafka.replicas")}</span>
                                                        </div>
                                                    </div>
                                                    <span className={`badge ${topic.ready ? "badge-success" : "badge-error"}`}>
                                                        {topic.ready ? t("kafka.ready") : t("kafka.notReady")}
                                                    </span>
                                                </div>
                                                <ChevronDown className={`w-4 h-4 text-muted transition-transform ml-2 ${expandedTopic === topic.name ? "rotate-180" : ""}`} />
                                            </div>
                                            <AnimatePresence>
                                                {expandedTopic === topic.name && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                                                        <div className="px-4 pb-3">
                                                            {topic.message && (
                                                                <div className="alert alert-error mb-2">
                                                                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                                    <span className="text-xs">{topic.message}</span>
                                                                </div>
                                                            )}
                                                            <div className="bg-surface rounded-md border border-cardBorder p-3 space-y-1.5">
                                                                {Object.keys(topic.config).length === 0 ? (
                                                                    <p className="text-xs text-muted italic">{t("kafka.defaultConfig")}</p>
                                                                ) : Object.entries(topic.config).map(([key, val]) => (
                                                                    <div key={key} className="flex items-center justify-between text-xs">
                                                                        <code className="text-primary/80">{key}</code>
                                                                        <code className="text-muted bg-card px-2 py-0.5 rounded">{String(val)}</code>
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
