"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import { AnimatePresence, motion } from "framer-motion";
import Editor from "@monaco-editor/react";
import {
    Waves, Trash2, RefreshCw, Loader2, AlertCircle, Check, X,
    Eye, Upload, Radio, Play
} from "lucide-react";

interface FlinkJobSummary {
    name: string;
    state: string;
    lifecycle: string;
    startTime: string | number | null;
    jobId: string | null;
    parallelism: number;
    error: string | null;
}

interface KafkaTopicSummary {
    name: string;
    partitions: number;
    replicas: number;
    ready: boolean;
}

// Starter script shown in the editor (mirrors pipelines/flink/examples/
// datagen-to-kafka.sql): streams synthetic events into the Kafka topic
// provisioned by the core-data-stack chart.
const EXAMPLE_SQL = `-- Generate synthetic events and stream them to Kafka.
-- The 'events' topic is created by the Strimzi KafkaTopic shipped with the
-- core-data-stack chart.

CREATE TEMPORARY TABLE events_source (
  event_id     STRING,
  user_id      STRING,
  event_type   STRING,
  event_ts     TIMESTAMP(3),
  WATERMARK FOR event_ts AS event_ts - INTERVAL '5' SECOND
) WITH (
  'connector' = 'datagen',
  'rows-per-second' = '5',
  'fields.event_id.length' = '12',
  'fields.user_id.length' = '8',
  'fields.event_type.length' = '6'
);

CREATE TEMPORARY TABLE events_sink (
  event_id     STRING,
  user_id      STRING,
  event_type   STRING,
  event_ts     TIMESTAMP(3)
) WITH (
  'connector' = 'kafka',
  'topic' = 'events',
  'properties.bootstrap.servers' = 'aetherlake-kafka-bootstrap:9092',
  'format' = 'json'
);

INSERT INTO events_sink SELECT * FROM events_source;
`;

function stateBadgeClass(state: string): string {
    switch (state) {
        case "RUNNING":
            return "badge-success";
        case "FINISHED":
            return "badge-info";
        case "FAILED":
        case "FAILING":
            return "badge-error";
        case "CANCELED":
        case "SUSPENDED":
            return "badge-neutral";
        default:
            return "badge-warning";
    }
}

function formatStartTime(startTime: string | number | null): string {
    if (startTime === null || startTime === undefined) return "—";
    const ms = typeof startTime === "number" ? startTime : Number(startTime);
    if (!Number.isFinite(ms)) return String(startTime);
    return new Date(ms).toLocaleString();
}

export default function FlinkPage() {
    const { data: session, status } = useSession({ required: true });
    const { t } = useLocale();

    const [jobs, setJobs] = useState<FlinkJobSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Submit form state
    const [jobName, setJobName] = useState("");
    const [sql, setSql] = useState("");
    const [parallelism, setParallelism] = useState(1);
    const [submitting, setSubmitting] = useState(false);

    // Kafka topic explorer (left panel)
    const [topics, setTopics] = useState<KafkaTopicSummary[]>([]);
    const [topicsLoading, setTopicsLoading] = useState(false);

    // SQL detail modal
    const [viewJob, setViewJob] = useState<string | null>(null);
    const [viewSql, setViewSql] = useState<string | null>(null);
    const [viewLoading, setViewLoading] = useState(false);

    const fetchJobs = useCallback(async (showSpinner = true) => {
        if (showSpinner) setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/flink/jobs");
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to fetch Flink jobs");
            }
            const data = await res.json();
            setJobs(data.jobs || []);
        } catch (err: any) { setError(err.message); }
        if (showSpinner) setLoading(false);
    }, []);

    const fetchTopics = useCallback(async () => {
        setTopicsLoading(true);
        try {
            const res = await fetch("/api/kafka");
            if (res.ok) {
                const data = await res.json();
                setTopics(data.topics || []);
            }
        } catch { /* the explorer is a helper — never block the page on it */ }
        setTopicsLoading(false);
    }, []);

    useEffect(() => {
        if (status !== "authenticated") return;
        fetchJobs();
        fetchTopics();
        const interval = setInterval(() => fetchJobs(false), 15000);
        return () => clearInterval(interval);
    }, [status, fetchJobs, fetchTopics]);

    useEffect(() => {
        if (success) { const timer = setTimeout(() => setSuccess(null), 5000); return () => clearTimeout(timer); }
    }, [success]);

    const submitJob = async () => {
        if (!jobName.trim() || !sql.trim()) return;
        setSubmitting(true); setError(null);
        try {
            const res = await fetch("/api/flink/jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: jobName.trim(), sql, parallelism }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.details ? `${data.error}: ${data.details}` : data.error);
            setSuccess(data.message);
            setJobName(""); setSql(""); setParallelism(1);
            fetchJobs();
        } catch (err: any) { setError(err.message); }
        setSubmitting(false);
    };

    const cancelJob = async (name: string) => {
        if (!confirm(`${t("flink.cancelConfirm")} "${name}"?`)) return;
        setLoading(true); setError(null);
        try {
            const res = await fetch(`/api/flink/jobs/${encodeURIComponent(name)}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSuccess(data.message);
            fetchJobs();
        } catch (err: any) { setError(err.message); setLoading(false); }
    };

    const openSql = async (name: string) => {
        setViewJob(name); setViewSql(null); setViewLoading(true);
        try {
            const res = await fetch(`/api/flink/jobs/${encodeURIComponent(name)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setViewSql(data.sql ?? "");
        } catch (err: any) {
            setViewSql(null);
            setError(err.message);
            setViewJob(null);
        }
        setViewLoading(false);
    };

    const insertTopicTemplate = (topic: KafkaTopicSummary) => {
        const template = `
CREATE TEMPORARY TABLE ${topic.name}_source (
  -- declare columns matching the topic's JSON schema
  payload STRING
) WITH (
  'connector' = 'kafka',
  'topic' = '${topic.name}',
  'properties.bootstrap.servers' = 'aetherlake-kafka-bootstrap:9092',
  'format' = 'json',
  'scan.startup.mode' = 'earliest-offset'
);
`;
        setSql((prev) => (prev ? `${prev}\n${template}` : template.trimStart()));
    };

    if (status === "loading") {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    }

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-4 flex gap-3 h-screen overflow-hidden">
                {/* Kafka topic explorer (mirrors the query IDE data catalog) */}
                <aside className="w-64 panel-card flex flex-col h-full overflow-hidden shrink-0">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-cardBorder">
                        <div className="flex items-center gap-2">
                            <Radio className="w-4 h-4 text-success" />
                            <h2 className="text-sm font-semibold">{t("flink.kafkaTopics")}</h2>
                        </div>
                        <button onClick={fetchTopics} className="btn-ghost p-1" title={t("common.refresh")}>
                            <RefreshCw className={`w-3 h-3 ${topicsLoading ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                    <div className="overflow-y-auto flex-1 px-3 py-2 space-y-0.5">
                        {topicsLoading && topics.length === 0 ? (
                            <div className="text-xs text-muted py-2 px-1">{t("flink.topicsLoading")}</div>
                        ) : topics.length === 0 ? (
                            <div className="text-xs text-muted py-2 px-1">{t("flink.noTopicsHint")}</div>
                        ) : topics.map((topic) => (
                            <div key={topic.name} onClick={() => insertTopicTemplate(topic)}
                                className="flex items-center gap-2 px-2 py-1.5 hover:bg-card-hover rounded cursor-pointer transition-colors group"
                                title={t("flink.topicHint")}>
                                <Radio className={`w-3.5 h-3.5 shrink-0 ${topic.ready ? "text-success" : "text-error"}`} />
                                <span className="text-xs font-mono text-secondary group-hover:text-foreground truncate flex-1">{topic.name}</span>
                                <span className="text-[10px] text-muted shrink-0">{topic.partitions}p</span>
                            </div>
                        ))}
                    </div>
                    <div className="px-4 py-2.5 border-t border-cardBorder">
                        <p className="text-[10px] text-muted leading-relaxed">{t("flink.topicHint")}</p>
                    </div>
                </aside>

                {/* Editor + Jobs */}
                <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                    {/* Alerts */}
                    <AnimatePresence>
                        {error && (
                            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="alert alert-error">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <div className="flex-1 text-sm">{error}</div>
                                <button onClick={() => setError(null)} className="btn-ghost p-1"><X className="w-3.5 h-3.5" /></button>
                            </motion.div>
                        )}
                        {success && (
                            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="alert alert-success">
                                <Check className="w-4 h-4" /><span className="text-sm">{success}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* SQL Editor */}
                    <div className="h-1/2 panel-card flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-cardBorder bg-surface flex-wrap">
                            <span className="text-xs font-semibold uppercase text-muted tracking-wide">{t("flink.sqlEditor")}</span>
                            <div className="flex items-center gap-2 flex-wrap">
                                <input value={jobName} onChange={(e) => setJobName(e.target.value)}
                                    className="input-field font-mono text-xs py-1.5 w-44" placeholder="my-kafka-etl" />
                                <input type="number" min={1} max={32} value={parallelism}
                                    onChange={(e) => setParallelism(Math.max(1, Math.min(32, Number(e.target.value) || 1)))}
                                    className="input-field font-mono text-xs py-1.5 w-16" title={t("flink.parallelism")} />
                                <button onClick={() => setSql(EXAMPLE_SQL)} className="btn-ghost text-xs py-1.5 px-2.5">
                                    <Upload className="w-3 h-3" /> {t("flink.loadExample")}
                                </button>
                                <button onClick={submitJob} disabled={!jobName.trim() || !sql.trim() || submitting}
                                    className="btn-primary text-xs py-1.5 px-3">
                                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                    {submitting ? t("flink.submitting") : t("flink.submit")}
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 bg-[#1e1e1e]">
                            <Editor height="100%" language="sql" theme="vs-dark" value={sql}
                                onChange={(val) => setSql(val || "")}
                                options={{
                                    minimap: { enabled: false },
                                    padding: { top: 12, bottom: 12 },
                                    fontSize: 13,
                                    fontFamily: "'Inter', ui-monospace, monospace",
                                    scrollBeyondLastLine: false,
                                    smoothScrolling: true,
                                    placeholder: "-- Flink SQL statements (CREATE TABLE ... WITH ('connector' = 'kafka', ...); INSERT INTO ...;)",
                                }} />
                        </div>
                    </div>

                    {/* Jobs */}
                    <div className="h-1/2 panel-card flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-cardBorder bg-surface">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase text-muted tracking-wide">{t("flink.jobs")}</span>
                                <span className="badge badge-neutral">{jobs.length}</span>
                            </div>
                            <button onClick={() => fetchJobs()} className="btn-ghost p-1" title={t("common.refresh")}>
                                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto">
                            {loading && jobs.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-muted text-sm gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                    {t("flink.loadingJobs")}
                                </div>
                            ) : jobs.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-muted text-sm gap-2">
                                    <Waves className="w-6 h-6" />
                                    {t("flink.noJobs")}
                                </div>
                            ) : (
                                <table className="data-table">
                                    <thead className="sticky top-0">
                                        <tr>
                                            <th>{t("flink.jobName")}</th>
                                            <th>{t("flink.state")}</th>
                                            <th>{t("flink.parallelism")}</th>
                                            <th>{t("flink.startTime")}</th>
                                            <th>{t("flink.actions")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {jobs.map((job) => (
                                            <tr key={job.name}>
                                                <td className="font-mono text-xs">{job.name}</td>
                                                <td>
                                                    <span className={`badge ${stateBadgeClass(job.state)}`}>{job.state}</span>
                                                    {job.error && (
                                                        <p className="text-[11px] text-error mt-1 max-w-[280px] truncate" title={job.error}>{job.error}</p>
                                                    )}
                                                </td>
                                                <td>{job.parallelism}</td>
                                                <td className="text-xs text-muted">{formatStartTime(job.startTime)}</td>
                                                <td>
                                                    <div className="flex items-center gap-1.5">
                                                        <button onClick={() => openSql(job.name)} className="btn-ghost p-1.5" title={t("flink.viewSql")}>
                                                            <Eye className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={() => cancelJob(job.name)} className="btn-danger p-1.5" title={t("flink.cancelJob")}>
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>

                {/* SQL detail modal */}
                <AnimatePresence>
                    {viewJob && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="modal-overlay" onClick={() => setViewJob(null)}>
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                                className="modal-content max-w-3xl" onClick={(e) => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3 className="text-sm font-semibold font-mono">{viewJob}</h3>
                                    <button onClick={() => setViewJob(null)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
                                </div>
                                <div className="modal-body">
                                    {viewLoading ? (
                                        <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /></div>
                                    ) : viewSql === null ? (
                                        <p className="text-sm text-muted py-4">{t("flink.sqlUnavailable")}</p>
                                    ) : (
                                        <pre className="text-xs font-mono whitespace-pre-wrap bg-surface border border-cardBorder rounded-md p-4 max-h-[60vh] overflow-auto">{viewSql}</pre>
                                    )}
                                </div>
                                <div className="modal-footer">
                                    <button onClick={() => setViewJob(null)} className="btn-secondary">{t("flink.close")}</button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
