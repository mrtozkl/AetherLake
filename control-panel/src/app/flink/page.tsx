"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../locale-provider";
import Sidebar from "../components/Sidebar";
import { AnimatePresence, motion } from "framer-motion";
import Editor from "@monaco-editor/react";
import {
    Waves, Plus, Trash2, RefreshCw, Loader2, AlertCircle, Check, X,
    FileCode2, Eye, Upload, ListOrdered
} from "lucide-react";

type Tab = "jobs" | "submit";

interface FlinkJobSummary {
    name: string;
    state: string;
    lifecycle: string;
    startTime: string | number | null;
    jobId: string | null;
    parallelism: number;
    error: string | null;
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

    const [activeTab, setActiveTab] = useState<Tab>("jobs");
    const [jobs, setJobs] = useState<FlinkJobSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Submit form state
    const [jobName, setJobName] = useState("");
    const [sql, setSql] = useState("");
    const [parallelism, setParallelism] = useState(1);
    const [submitting, setSubmitting] = useState(false);

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

    useEffect(() => {
        if (status !== "authenticated") return;
        fetchJobs();
        const interval = setInterval(() => fetchJobs(false), 15000);
        return () => clearInterval(interval);
    }, [status, fetchJobs]);

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
            setActiveTab("jobs");
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

    if (status === "loading") {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
    }

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: "jobs", label: t("flink.jobs"), icon: <ListOrdered className="w-4 h-4" /> },
        { id: "submit", label: t("flink.submitJob"), icon: <Plus className="w-4 h-4" /> },
    ];

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-[var(--sidebar-width)] flex-1 p-8 max-w-[1100px]">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl font-semibold text-foreground">{t("flink.title")}</h1>
                        <p className="text-sm text-muted mt-0.5">{t("flink.subtitle")}</p>
                    </div>
                    <button onClick={() => fetchJobs()} className="btn-ghost">
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

                {/* Tab: Jobs */}
                {activeTab === "jobs" && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-sm font-semibold">{t("flink.jobs")}</h2>
                            <span className="badge badge-neutral">{jobs.length} {t("flink.jobCount")}</span>
                        </div>
                        {loading && jobs.length === 0 ? (
                            <div className="panel-card p-12 text-center">
                                <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-3" />
                                <p className="text-sm text-muted">{t("flink.loadingJobs")}</p>
                            </div>
                        ) : jobs.length === 0 ? (
                            <div className="panel-card p-12 text-center">
                                <Waves className="w-8 h-8 text-muted mx-auto mb-3" />
                                <p className="text-sm text-muted mb-3">{t("flink.noJobs")}</p>
                                <button onClick={() => setActiveTab("submit")} className="btn-primary text-sm">
                                    <Plus className="w-4 h-4" /> {t("flink.submitJob")}
                                </button>
                            </div>
                        ) : (
                            <div className="panel-card overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="data-table">
                                        <thead>
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
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab: Submit Job */}
                {activeTab === "submit" && (
                    <div className="space-y-5">
                        <h2 className="text-sm font-semibold">{t("flink.submitJob")}</h2>
                        <div className="panel-card p-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2">
                                    <label className="text-xs text-muted uppercase block mb-1.5">
                                        {t("flink.jobName")}<span className="text-error ml-1">*</span>
                                    </label>
                                    <input value={jobName} onChange={(e) => setJobName(e.target.value)}
                                        className="input-field font-mono" placeholder="my-kafka-etl" />
                                </div>
                                <div>
                                    <label className="text-xs text-muted uppercase block mb-1.5">{t("flink.parallelism")}</label>
                                    <input type="number" min={1} max={32} value={parallelism}
                                        onChange={(e) => setParallelism(Math.max(1, Math.min(32, Number(e.target.value) || 1)))}
                                        className="input-field font-mono" />
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs text-muted uppercase">{t("flink.sqlScript")}</label>
                                    <button onClick={() => setSql(EXAMPLE_SQL)} className="btn-ghost text-xs py-1 px-2">
                                        <Upload className="w-3 h-3" /> {t("flink.loadExample")}
                                    </button>
                                </div>
                                <div className="rounded-md border border-cardBorder overflow-hidden bg-[#1e1e1e]" style={{ height: "380px" }}>
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
                            <div className="flex gap-3 pt-3 border-t border-cardBorder">
                                <button onClick={() => { setJobName(""); setSql(""); setParallelism(1); }} className="btn-secondary">{t("common.clear")}</button>
                                <button onClick={submitJob} disabled={!jobName.trim() || !sql.trim() || submitting} className="btn-primary flex-1">
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode2 className="w-4 h-4" />}
                                    {submitting ? t("flink.submitting") : t("flink.submit")}
                                </button>
                            </div>
                            <p className="text-xs text-muted flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5" />{t("flink.note")}
                            </p>
                        </div>
                    </div>
                )}

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
