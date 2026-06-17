"use client";

import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useLocale } from "./locale-provider";
import Sidebar from "./components/Sidebar";
import {
    Database, Activity, Archive, Search, Network, Code2,
    ShieldCheck, LogIn, RefreshCw, Key, ExternalLink,
    ArrowUpRight, Globe, BarChart3
} from "lucide-react";

const SERVICES = [
    {
        nameKey: "ext.minio" as const,
        descKey: "ext.minioDesc" as const,
        icon: Archive,
        iconColor: "text-primary",
        url: "http://minio.aetherlake.local",
    },
    {
        nameKey: "ext.trino" as const,
        descKey: "ext.trinoDesc" as const,
        icon: Database,
        iconColor: "text-accent",
        url: "/trino",
    },
    {
        nameKey: "ext.airflow" as const,
        descKey: "ext.airflowDesc" as const,
        icon: Activity,
        iconColor: "text-warning",
        url: "http://airflow.aetherlake.local",
    },
    {
        nameKey: "ext.superset" as const,
        descKey: "ext.supersetDesc" as const,
        icon: BarChart3,
        iconColor: "text-accent",
        url: "http://superset.aetherlake.local",
    },
    {
        nameKey: "ext.milvus" as const,
        descKey: "ext.milvusDesc" as const,
        icon: Search,
        iconColor: "text-success",
        url: "http://milvus.aetherlake.local",
    },
    {
        nameKey: "ext.polaris" as const,
        descKey: "ext.polarisDesc" as const,
        icon: Network,
        iconColor: "text-warning",
        url: "/polaris",
    },
    {
        nameKey: "ext.queryIde" as const,
        descKey: "ext.queryIdeDesc" as const,
        icon: Code2,
        iconColor: "text-primary",
        url: "/query",
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

    useEffect(() => {
        if (status === "authenticated") {
            fetchStatuses();
            const interval = setInterval(fetchStatuses, 30000);
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

    return (
        <div className="flex min-h-screen">
            <Sidebar />

            <main className="ml-[var(--sidebar-width)] flex-1 p-8 max-w-[1200px]">
                {/* Page Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-xl font-semibold text-foreground">
                            {t("home.title")}
                        </h1>
                        <p className="text-sm text-muted mt-0.5">
                            {t("home.subtitle")}
                        </p>
                    </div>
                    <button onClick={fetchStatuses} className="btn-ghost">
                        <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? "animate-spin" : ""}`} />
                        {t("common.refresh")}
                    </button>
                </div>

                {/* Status Summary Cards */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="panel-card p-5">
                        <p className="text-[11px] text-muted uppercase tracking-wide mb-1">{t("home.activeServices")}</p>
                        <p className="text-2xl font-semibold text-foreground">{SERVICES.length + (isAdmin ? 1 : 0)}</p>
                    </div>
                    <div className="panel-card p-5">
                        <p className="text-[11px] text-muted uppercase tracking-wide mb-1">Healthy</p>
                        <p className="text-2xl font-semibold text-success">{healthyCount}<span className="text-sm text-muted font-normal">/{totalCount}</span></p>
                    </div>
                    <div className="panel-card p-5">
                        <p className="text-[11px] text-muted uppercase tracking-wide mb-1">Platform</p>
                        <p className="text-2xl font-semibold text-foreground">K8s</p>
                    </div>
                </div>

                {/* Services Table */}
                <div className="panel-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-cardBorder flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-foreground">{t("home.serviceStatus")}</h2>
                        <span className="badge badge-neutral">{SERVICES.length} services</span>
                    </div>

                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Service</th>
                                <th>{t("home.description")}</th>
                                <th>{t("home.status")}</th>
                                <th className="text-right">{t("home.actions")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {SERVICES.map((service) => {
                                const name = t(service.nameKey);
                                const liveStatus = podStatuses[name] || "Unknown";
                                const isInternal = service.url.startsWith("/");
                                const isRestarting = restartingService === name;
                                const Icon = service.icon;

                                return (
                                    <tr key={service.nameKey}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <Icon className={`w-4 h-4 ${service.iconColor}`} />
                                                <a
                                                    href={service.url}
                                                    target={isInternal ? undefined : "_blank"}
                                                    rel={isInternal ? undefined : "noreferrer"}
                                                    className="text-foreground font-medium text-sm hover:text-primary transition-colors"
                                                >
                                                    {name}
                                                </a>
                                                {!isInternal && <ExternalLink className="w-3 h-3 text-muted" />}
                                            </div>
                                        </td>
                                        <td className="text-muted">{t(service.descKey)}</td>
                                        <td>
                                            <span className={`badge ${statusBadgeClass(liveStatus)}`}>
                                                <span className={`status-dot ${statusDotClass(liveStatus)}`}></span>
                                                {liveStatus}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={(e) => handleRestart(e, name)}
                                                    disabled={isRestarting}
                                                    className="btn-ghost text-xs"
                                                >
                                                    <RefreshCw className={`w-3 h-3 ${isRestarting ? "animate-spin" : ""}`} />
                                                    {isRestarting ? t("common.restarting") : t("common.restart")}
                                                </button>
                                                <a
                                                    href={service.url}
                                                    target={isInternal ? undefined : "_blank"}
                                                    rel={isInternal ? undefined : "noreferrer"}
                                                    className="btn-ghost text-xs"
                                                >
                                                    <ArrowUpRight className="w-3 h-3" />
                                                    {isInternal ? t("common.open") : t("common.openConsole")}
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}

                            {/* Keycloak Admin Row */}
                            {isAdmin && (
                                <tr>
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <Key className="w-4 h-4 text-accent" />
                                            <a
                                                href="http://keycloak.aetherlake.local"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-foreground font-medium text-sm hover:text-primary transition-colors"
                                            >
                                                {t("ext.keycloak")}
                                            </a>
                                            <ExternalLink className="w-3 h-3 text-muted" />
                                        </div>
                                    </td>
                                    <td className="text-muted">{t("ext.keycloakDesc")}</td>
                                    <td>
                                        <span className="badge badge-info">
                                            {t("common.adminOnly")}
                                        </span>
                                    </td>
                                    <td className="text-right">
                                        <a
                                            href="http://keycloak.aetherlake.local"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="btn-ghost text-xs"
                                        >
                                            <ArrowUpRight className="w-3 h-3" />
                                            {t("common.openConsole")}
                                        </a>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
