"use client";

import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useLocale } from "./locale-provider";
import Sidebar from "./components/Sidebar";
import {
    Database, Activity, Archive, Search, Network, Code2,
    ShieldCheck, LogIn, RefreshCw, Key, ExternalLink,
    ArrowUpRight, Globe, BarChart3, Radio, Waves, GitFork,
    Cloud, Server, Send, CheckCircle2, LayoutDashboard,
    Layers, X
} from "lucide-react";

const SERVICES = [
    {
        nameKey: "ext.minio" as const,
        descKey: "ext.minioDesc" as const,
        categoryKey: "home.catLakehouse" as const,
        category: "lakehouse",
        endpoint: "minio-hl:9000",
        icon: Archive,
        iconColor: "text-primary",
        url: "http://minio.aetherlake.local",
    },
    {
        nameKey: "ext.polaris" as const,
        descKey: "ext.polarisDesc" as const,
        categoryKey: "home.catLakehouse" as const,
        category: "lakehouse",
        endpoint: "polaris:8181",
        icon: Network,
        iconColor: "text-warning",
        url: "/polaris",
    },
    {
        nameKey: "ext.trino" as const,
        descKey: "ext.trinoDesc" as const,
        categoryKey: "home.catCompute" as const,
        category: "compute",
        endpoint: "trino:8443",
        icon: Database,
        iconColor: "text-accent",
        url: "/trino",
    },
    {
        nameKey: "ext.milvus" as const,
        descKey: "ext.milvusDesc" as const,
        categoryKey: "home.catCompute" as const,
        category: "compute",
        endpoint: "milvus:19530",
        icon: Search,
        iconColor: "text-success",
        url: "http://milvus.aetherlake.local",
    },
    {
        nameKey: "ext.kafka" as const,
        descKey: "ext.kafkaDesc" as const,
        categoryKey: "home.catStreaming" as const,
        category: "streaming",
        endpoint: "kafka-bootstrap:9092",
        icon: Radio,
        iconColor: "text-success",
        url: "/kafka",
    },
    {
        nameKey: "ext.flink" as const,
        descKey: "ext.flinkDesc" as const,
        categoryKey: "home.catStreaming" as const,
        category: "streaming",
        endpoint: "flink-k8s-operator",
        icon: Waves,
        iconColor: "text-primary",
        url: "/flink",
    },
    {
        nameKey: "ext.airflow" as const,
        descKey: "ext.airflowDesc" as const,
        categoryKey: "home.catOrchestration" as const,
        category: "orchestration",
        endpoint: "airflow-web:8080",
        icon: Activity,
        iconColor: "text-warning",
        url: "http://airflow.aetherlake.local",
    },
    {
        nameKey: "ext.superset" as const,
        descKey: "ext.supersetDesc" as const,
        categoryKey: "home.catOrchestration" as const,
        category: "orchestration",
        endpoint: "superset:8088",
        icon: BarChart3,
        iconColor: "text-accent",
        url: "http://superset.aetherlake.local",
    },
    {
        nameKey: "ext.grafana" as const,
        descKey: "ext.grafanaDesc" as const,
        categoryKey: "home.catObservability" as const,
        category: "observability",
        endpoint: "grafana:3000",
        icon: Activity,
        iconColor: "text-warning",
        url: process.env.NEXT_PUBLIC_GRAFANA_URL || "http://grafana.aetherlake.local",
    },
];

const CATEGORIES = [
    { id: "all", labelKey: "home.allCategories" as const },
    { id: "lakehouse", labelKey: "home.catLakehouse" as const },
    { id: "compute", labelKey: "home.catCompute" as const },
    { id: "streaming", labelKey: "home.catStreaming" as const },
    { id: "orchestration", labelKey: "home.catOrchestration" as const },
    { id: "observability", labelKey: "home.catObservability" as const },
];

const QUICK_LAUNCH = [
    {
        titleKey: "home.runSql" as const,
        descKey: "home.runSqlDesc" as const,
        href: "/query",
        icon: Code2,
        iconColor: "text-primary",
    },
    {
        titleKey: "home.exploreTables" as const,
        descKey: "home.exploreTablesDesc" as const,
        href: "/tables",
        icon: Database,
        iconColor: "text-warning",
    },
    {
        titleKey: "home.streamProcessing" as const,
        descKey: "home.streamProcessingDesc" as const,
        href: "/flink",
        icon: Waves,
        iconColor: "text-accent",
    },
    {
        titleKey: "home.viewLineage" as const,
        descKey: "home.viewLineageDesc" as const,
        href: "/dbt",
        icon: GitFork,
        iconColor: "text-success",
    },
    {
        titleKey: "home.viewLogs" as const,
        descKey: "home.viewLogsDesc" as const,
        href: "/observability",
        icon: Activity,
        iconColor: "text-primary",
    },
];

function statusBadgeClass(s: string) {
    if (s === "Healthy") return "badge-success";
    if (s === "Pending") return "badge-warning";
    return "badge-error";
}

function statusDotClass(s: string) {
    if (s === "Healthy") return "status-dot-healthy";
    if (s === "Pending") return "status-dot-pending";
    return "status-dot-error";
}

export default function Home() {
    const { data: session, status } = useSession();
    const { locale, setLocale, t } = useLocale();
    const [podStatuses, setPodStatuses] = useState<Record<string, string>>({});
    const [statusLoading, setStatusLoading] = useState(false);
    const [restartingService, setRestartingService] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");

    const [telemetry, setTelemetry] = useState<{
        enabled: boolean;
        clusterId: string;
        cloudProvider: string;
        lastPingTime: string | null;
    } | null>(null);
    const [pingLoading, setPingLoading] = useState(false);
    const [pingSuccess, setPingSuccess] = useState(false);

    const fetchStatuses = async () => {
        setStatusLoading(true);
        try {
            const res = await fetch("/api/status");
            if (res.ok) {
                const data = await res.json();
                setPodStatuses(data);
            }
        } catch { /* ignore */ }
        setStatusLoading(false);
    };

    const fetchTelemetry = async () => {
        try {
            const res = await fetch("/api/telemetry");
            if (res.ok) {
                const json = await res.json();
                if (json.status === "ok") {
                    setTelemetry(json.data);
                }
            }
        } catch { /* ignore */ }
    };

    const handleSendPing = async () => {
        setPingLoading(true);
        try {
            const res = await fetch("/api/telemetry", { method: "POST" });
            if (res.ok) {
                setPingSuccess(true);
                fetchTelemetry();
                setTimeout(() => setPingSuccess(false), 3000);
            }
        } catch { /* ignore */ }
        setPingLoading(false);
    };

    useEffect(() => {
        if (status === "authenticated") {
            fetchStatuses();
            fetchTelemetry();
            const interval = setInterval(() => {
                fetchStatuses();
                fetchTelemetry();
            }, 30000);
            return () => clearInterval(interval);
        }
    }, [status]);

    // Loading state
    if (status === "loading") {
        return (
            <main className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-cardBorder border-t-primary"></div>
            </main>
        );
    }

    // Login page
    if (!session) {
        return (
            <main className="min-h-screen flex items-center justify-center p-6">
                <div className="panel-card p-10 max-w-sm w-full">
                    <div className="text-center mb-8">
                        <div className="w-12 h-12 rounded-lg bg-primary mx-auto mb-4 flex items-center justify-center">
                            <span className="text-white font-bold text-lg">AL</span>
                        </div>
                        <h1 className="text-xl font-semibold text-foreground mb-1">
                            {t("home.signInTitle")}
                        </h1>
                        <p className="text-sm text-muted">
                            {t("home.signInSubtitle")}
                        </p>
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.target as HTMLFormElement;
                            const username = (form.elements.namedItem("username") as HTMLInputElement).value;
                            const password = (form.elements.namedItem("password") as HTMLInputElement).value;
                            signIn("credentials", { username, password, callbackUrl: "/" });
                        }}
                        className="flex flex-col gap-3 mb-5"
                    >
                        <div>
                            <label className="text-xs text-muted mb-1 block">{t("common.username")}</label>
                            <input name="username" type="text" className="input-field" placeholder="admin" required />
                        </div>
                        <div>
                            <label className="text-xs text-muted mb-1 block">{t("common.password")}</label>
                            <input name="password" type="password" className="input-field" placeholder="••••••••" required />
                        </div>
                        <button type="submit" className="btn-primary mt-1">
                            <LogIn className="w-4 h-4" />
                            {t("common.signIn")}
                        </button>
                    </form>

                    <div className="flex items-center gap-3 mb-5">
                        <div className="flex-1 h-px bg-cardBorder"></div>
                        <span className="text-muted text-[11px] uppercase">{t("common.or")}</span>
                        <div className="flex-1 h-px bg-cardBorder"></div>
                    </div>

                    <button
                        onClick={() => signIn("keycloak")}
                        className="btn-secondary w-full"
                    >
                        <ShieldCheck className="w-4 h-4 text-accent" />
                        {t("home.ssoSignIn")}
                    </button>

                    <p className="text-muted text-[11px] mt-5 text-center">
                        {t("common.defaultCredentials")}
                    </p>

                    {/* Language toggle on login */}
                    <div className="flex items-center justify-center gap-1 mt-4">
                        <Globe className="w-3.5 h-3.5 text-muted" />
                        <button
                            onClick={() => setLocale("en")}
                            className={`text-xs px-2 py-1 rounded ${locale === "en" ? "text-foreground bg-card" : "text-muted hover:text-foreground"} transition-colors`}
                        >EN</button>
                        <button
                            onClick={() => setLocale("tr")}
                            className={`text-xs px-2 py-1 rounded ${locale === "tr" ? "text-foreground bg-card" : "text-muted hover:text-foreground"} transition-colors`}
                        >TR</button>
                    </div>
                </div>
            </main>
        );
    }

    const isAdmin = Boolean(
        session?.user?.name === "admin" ||
        (session?.user as any)?.role === "data-admin" ||
        session?.user?.email?.includes("admin")
    );

    const handleRestart = async (e: React.MouseEvent, serviceName: string) => {
        e.preventDefault();
        e.stopPropagation();

        if (!confirm(`Are you sure you want to restart ${serviceName}?`)) return;

        setRestartingService(serviceName);
        try {
            const res = await fetch("/api/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ serviceName, action: "restart" })
            });
            const data = await res.json();
            if (res.ok) {
                setPodStatuses(prev => ({ ...prev, [serviceName]: "Pending" }));
            } else {
                alert(`Error: ${data.error || "Failed to restart"}`);
            }
        } catch (err) {
            alert("Network error restarting service.");
        }
        setRestartingService(null);
    };

    // Count healthy
    const healthyCount = Object.values(podStatuses).filter(s => s === "Healthy").length;
    const totalCount = Object.keys(podStatuses).length;
    const healthPercent = totalCount > 0 ? Math.round((healthyCount / totalCount) * 100) : 100;

    const getCloudProviderLabel = (provider?: string) => {
        switch (provider) {
            case "aws": return t("cloud.aws");
            case "azure": return t("cloud.azure");
            case "gcp": return t("cloud.gcp");
            case "docker-desktop": return t("cloud.dockerDesktop");
            case "minikube": return t("cloud.minikube");
            case "kind": return t("cloud.kind");
            default: return t("cloud.selfHosted");
        }
    };

    // Filter services based on category and search query
    const filteredServices = SERVICES.filter((service) => {
        const matchesCategory = selectedCategory === "all" || service.category === selectedCategory;
        const name = t(service.nameKey).toLowerCase();
        const desc = t(service.descKey).toLowerCase();
        const ep = service.endpoint.toLowerCase();
        const query = searchQuery.toLowerCase().trim();
        const matchesSearch = !query || name.includes(query) || desc.includes(query) || ep.includes(query);
        return matchesCategory && matchesSearch;
    });

    return (
        <div className="flex min-h-screen w-full overflow-x-hidden">
            <Sidebar />

            <main className="ml-[var(--sidebar-width)] w-[calc(100vw-var(--sidebar-width))] max-w-[calc(100vw-var(--sidebar-width))] min-w-0 flex-1 p-6 lg:p-8">
                {/* Standardized Enterprise Page Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-cardBorder">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                                <LayoutDashboard className="w-4 h-4" />
                            </div>
                            <h1 className="text-lg font-semibold text-foreground tracking-tight">
                                {t("home.title")}
                            </h1>
                            <span className="badge badge-neutral text-[10px]">Kubernetes</span>
                        </div>
                        <p className="text-xs text-muted mt-1">
                            {t("home.subtitle")}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => { fetchStatuses(); fetchTelemetry(); }} className="btn-ghost text-xs">
                            <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? "animate-spin" : ""}`} />
                            {t("common.refresh")}
                        </button>
                    </div>
                </div>

                {/* Standardized 4-Card Enterprise KPI Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    <div className="panel-card p-4 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-medium text-muted uppercase tracking-wider truncate">{t("home.activeServices")}</span>
                            <Layers className="w-4 h-4 text-primary flex-shrink-0" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <p className="text-xl font-semibold text-foreground font-mono">{SERVICES.length + (isAdmin ? 1 : 0)}</p>
                            <span className="text-xs text-muted font-normal">services</span>
                        </div>
                    </div>

                    <div className="panel-card p-4 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-medium text-muted uppercase tracking-wider truncate">{t("home.clusterHealth")}</span>
                            <span className={`status-dot ${healthyCount === totalCount && totalCount > 0 ? "status-dot-healthy" : "status-dot-pending"}`}></span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <p className="text-xl font-semibold text-success font-mono">{healthyCount}<span className="text-xs text-muted font-normal">/{totalCount}</span></p>
                            <span className="text-[11px] font-mono text-muted">({healthPercent}%)</span>
                        </div>
                    </div>

                    <div className="panel-card p-4 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-medium text-muted uppercase tracking-wider truncate">{t("cloud.provider")}</span>
                            <Cloud className="w-4 h-4 text-accent flex-shrink-0" />
                        </div>
                        <div className="flex items-baseline gap-2 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                                {telemetry?.cloudProvider?.toUpperCase() || "K8S"}
                            </p>
                            <span className="text-[10px] text-muted font-mono truncate">{telemetry?.clusterId ? telemetry.clusterId.slice(0, 10) : "local"}</span>
                        </div>
                    </div>

                    <div className="panel-card p-4 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-medium text-muted uppercase tracking-wider truncate">{t("cloud.telemetry")}</span>
                            <button
                                onClick={handleSendPing}
                                disabled={pingLoading || !telemetry?.enabled}
                                className="text-muted hover:text-primary transition-colors disabled:opacity-40 flex-shrink-0"
                                title={t("cloud.sendPing")}
                            >
                                {pingLoading ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                                ) : pingSuccess ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                                ) : (
                                    <Send className="w-3.5 h-3.5" />
                                )}
                            </button>
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                            <span className={`status-dot ${telemetry?.enabled ? "status-dot-healthy" : "status-dot-pending"}`}></span>
                            <span className="text-xs font-medium text-foreground truncate">
                                {telemetry?.enabled ? t("cloud.telemetryActive") : t("cloud.telemetryOptOut")}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Enterprise Quick Launchpad */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xs font-semibold uppercase text-muted tracking-wider">{t("home.quickLaunch")}</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                        {QUICK_LAUNCH.map((item, idx) => {
                            const Icon = item.icon;
                            return (
                                <a
                                    key={idx}
                                    href={item.href}
                                    className="panel-card p-3.5 panel-card-hover flex flex-col justify-between group transition-all min-w-0"
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="w-7 h-7 rounded-md bg-card flex items-center justify-center flex-shrink-0">
                                                <Icon className={`w-3.5 h-3.5 ${item.iconColor}`} />
                                            </div>
                                            <ArrowUpRight className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                        </div>
                                        <h3 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                                            {t(item.titleKey)}
                                        </h3>
                                        <p className="text-[11px] text-muted line-clamp-2 mt-1 leading-relaxed">
                                            {t(item.descKey)}
                                        </p>
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                </div>

                {/* Cloud & Telemetry Banner */}
                <div className="panel-card p-4 mb-6 bg-surface/80 border border-cardBorder flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                            <Server className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-foreground">
                                    {getCloudProviderLabel(telemetry?.cloudProvider)}
                                </span>
                                <span className="badge badge-neutral text-[10px] font-mono">
                                    {telemetry?.clusterId || "cl-local-instance"}
                                </span>
                            </div>
                            <p className="text-[11px] text-muted mt-0.5">
                                {t("cloud.lastPing")}: {telemetry?.lastPingTime ? new Date(telemetry.lastPingTime).toLocaleTimeString() : t("cloud.never")}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto flex-shrink-0">
                        <button
                            onClick={handleSendPing}
                            disabled={pingLoading || !telemetry?.enabled}
                            className="btn-secondary text-xs flex items-center gap-1.5"
                            title={t("cloud.sendPing")}
                        >
                            {pingLoading ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                            ) : pingSuccess ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                            ) : (
                                <Send className="w-3.5 h-3.5 text-muted" />
                            )}
                            <span>{pingSuccess ? t("cloud.pingSent") : t("cloud.sendPing")}</span>
                        </button>
                    </div>
                </div>

                {/* Service Health & Registry Table Panel */}
                <div className="panel-card overflow-hidden">
                    {/* Header + Search + Category Filter */}
                    <div className="p-3 sm:p-4 border-b border-cardBorder flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-surface/40">
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <h2 className="text-sm font-semibold text-foreground">{t("home.serviceStatus")}</h2>
                            <span className="badge badge-neutral">{filteredServices.length + (isAdmin ? 1 : 0)}</span>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap min-w-0">
                            {/* Search bar */}
                            <div className="relative w-full sm:w-40 xl:w-48 flex-shrink-0">
                                <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t("home.searchServices")}
                                    className="input-field text-xs py-1.5 pl-8 pr-7 w-full"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery("")}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Category Filter Pills */}
                            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 flex-nowrap">
                                {CATEGORIES.map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedCategory(cat.id)}
                                        className={`text-[11px] px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
                                            selectedCategory === cat.id
                                                ? "bg-primary text-white font-medium"
                                                : "text-muted hover:text-foreground bg-card border border-cardBorder"
                                        }`}
                                    >
                                        {t(cat.labelKey)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Service</th>
                                    <th>Category</th>
                                    <th>{t("home.endpoint")}</th>
                                    <th>{t("home.description")}</th>
                                    <th>{t("home.status")}</th>
                                    <th className="text-right pr-4">{t("home.actions")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredServices.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-8 text-xs text-muted">
                                            {t("home.noServicesFound")}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredServices.map((service) => {
                                        const name = t(service.nameKey);
                                        const liveStatus = podStatuses[name] || "Unknown";
                                        const isInternal = service.url.startsWith("/");
                                        const isRestarting = restartingService === name;
                                        const Icon = service.icon;

                                        return (
                                            <tr key={service.nameKey}>
                                                <td>
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-6 h-6 rounded-md bg-card flex items-center justify-center flex-shrink-0">
                                                            <Icon className={`w-3.5 h-3.5 ${service.iconColor}`} />
                                                        </div>
                                                        <a
                                                            href={service.url}
                                                            target={isInternal ? undefined : "_blank"}
                                                            rel={isInternal ? undefined : "noreferrer"}
                                                            className="text-foreground font-medium text-xs hover:text-primary transition-colors font-sans"
                                                        >
                                                            {name}
                                                        </a>
                                                        {!isInternal && <ExternalLink className="w-3 h-3 text-muted/60 flex-shrink-0" />}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="badge badge-neutral text-[10px]">
                                                        {t(service.categoryKey)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <code className="text-[11px] text-muted font-mono">{service.endpoint}</code>
                                                </td>
                                                <td>
                                                    <div className="text-muted text-xs max-w-[180px] xl:max-w-[220px] truncate" title={t(service.descKey)}>
                                                        {t(service.descKey)}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`badge ${statusBadgeClass(liveStatus)}`}>
                                                        <span className={`status-dot ${statusDotClass(liveStatus)}`}></span>
                                                        {liveStatus}
                                                    </span>
                                                </td>
                                                <td className="text-right pr-4">
                                                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                                        <button
                                                            onClick={(e) => handleRestart(e, name)}
                                                            disabled={isRestarting}
                                                            className="btn-ghost text-xs py-1 px-2"
                                                        >
                                                            <RefreshCw className={`w-3 h-3 ${isRestarting ? "animate-spin" : ""}`} />
                                                            {isRestarting ? t("common.restarting") : t("common.restart")}
                                                        </button>
                                                        <a
                                                            href={service.url}
                                                            target={isInternal ? undefined : "_blank"}
                                                            rel={isInternal ? undefined : "noreferrer"}
                                                            className="btn-ghost text-xs py-1 px-2"
                                                        >
                                                            <ArrowUpRight className="w-3 h-3" />
                                                            {t("common.open")}
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}

                                {/* Keycloak Admin Row if applicable */}
                                {isAdmin && (selectedCategory === "all" || selectedCategory === "security") && (
                                    <tr>
                                        <td>
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-6 h-6 rounded-md bg-card flex items-center justify-center flex-shrink-0">
                                                    <Key className="w-3.5 h-3.5 text-accent" />
                                                </div>
                                                <a
                                                    href="http://keycloak.aetherlake.local"
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-foreground font-medium text-xs hover:text-primary transition-colors font-sans"
                                                >
                                                    {t("ext.keycloak")}
                                                </a>
                                                <ExternalLink className="w-3 h-3 text-muted/60 flex-shrink-0" />
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge badge-neutral text-[10px]">
                                                {t("home.catSecurity")}
                                            </span>
                                        </td>
                                        <td>
                                            <code className="text-[11px] text-muted font-mono">keycloak:8080</code>
                                        </td>
                                        <td>
                                            <div className="text-muted text-xs max-w-[180px] xl:max-w-[220px] truncate" title={t("ext.keycloakDesc")}>
                                                {t("ext.keycloakDesc")}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge badge-info text-[10px]">
                                                {t("common.adminOnly")}
                                            </span>
                                        </td>
                                        <td className="text-right pr-4">
                                            <a
                                                href="http://keycloak.aetherlake.local"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="btn-ghost text-xs py-1 px-2"
                                            >
                                                <ArrowUpRight className="w-3 h-3" />
                                                {t("common.open")}
                                            </a>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
