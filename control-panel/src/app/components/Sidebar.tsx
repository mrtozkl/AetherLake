"use client";

import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useLocale } from "../locale-provider";
import {
    LayoutDashboard, Database, Network, Code2,
    LogOut, ChevronDown, Globe, BarChart3
} from "lucide-react";

const NAV_ITEMS = [
    { href: "/", labelKey: "nav.overview" as const, icon: LayoutDashboard },
    { href: "/trino", labelKey: "nav.trino" as const, icon: Database },
    { href: "/polaris", labelKey: "nav.polaris" as const, icon: Network },
    { href: "/query", labelKey: "nav.query" as const, icon: Code2 },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const { locale, setLocale, t } = useLocale();

    if (!session) return null;

    return (
        <aside className="fixed left-0 top-0 bottom-0 w-[var(--sidebar-width)] bg-surface border-r border-cardBorder flex flex-col z-30">
            {/* Brand */}
            <div className="px-5 py-5 border-b border-cardBorder">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                        <span className="text-white font-bold text-sm">AL</span>
                    </div>
                    <div>
                        <h1 className="text-sm font-semibold text-foreground leading-tight">
                            {t("nav.platform")}
                        </h1>
                        <p className="text-[11px] text-muted leading-tight">
                            {t("nav.subtitle")}
                        </p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <a
                            key={item.href}
                            href={item.href}
                            className={`sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
                        >
                            <Icon className="w-4 h-4" />
                            <span>{t(item.labelKey)}</span>
                        </a>
                    );
                })}

                {/* External Links Section */}
                <div className="pt-4 mt-4 border-t border-cardBorder">
                    <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted/60 mb-2">
                        External
                    </p>
                    <a
                        href="http://minio.aetherlake.local"
                        target="_blank"
                        rel="noreferrer"
                        className="sidebar-link"
                    >
                        <Database className="w-4 h-4" />
                        <span>MinIO Console</span>
                    </a>
                    <a
                        href="http://airflow.aetherlake.local"
                        target="_blank"
                        rel="noreferrer"
                        className="sidebar-link"
                    >
                        <LayoutDashboard className="w-4 h-4" />
                        <span>Apache Airflow</span>
                    </a>
                    <a
                        href="http://superset.aetherlake.local"
                        target="_blank"
                        rel="noreferrer"
                        className="sidebar-link"
                    >
                        <BarChart3 className="w-4 h-4" />
                        <span>Apache Superset</span>
                    </a>
                </div>
            </nav>

            {/* Footer: User + Language */}
            <div className="border-t border-cardBorder px-3 py-3 space-y-2">
                {/* Language Switcher */}
                <div className="flex items-center gap-1 px-2">
                    <Globe className="w-3.5 h-3.5 text-muted" />
                    <button
                        onClick={() => setLocale("en")}
                        className={`text-xs px-2 py-1 rounded ${locale === "en" ? "text-foreground bg-card" : "text-muted hover:text-foreground"} transition-colors`}
                    >
                        EN
                    </button>
                    <button
                        onClick={() => setLocale("tr")}
                        className={`text-xs px-2 py-1 rounded ${locale === "tr" ? "text-foreground bg-card" : "text-muted hover:text-foreground"} transition-colors`}
                    >
                        TR
                    </button>
                </div>

                {/* User */}
                <div className="flex items-center justify-between px-2 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-md bg-card border border-cardBorder flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold text-muted">
                                {(session?.user?.name || session?.user?.email || "U")[0].toUpperCase()}
                            </span>
                        </div>
                        <span className="text-xs text-secondary truncate">
                            {session?.user?.email || session?.user?.name || "admin"}
                        </span>
                    </div>
                    <button
                        onClick={() => signOut({ callbackUrl: "/" })}
                        className="btn-ghost p-1.5"
                        title={t("common.signOut")}
                    >
                        <LogOut className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </aside>
    );
}
