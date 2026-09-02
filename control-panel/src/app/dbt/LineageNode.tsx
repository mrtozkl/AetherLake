"use client";

import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Check, Waves } from "lucide-react";
import { DbtDagNode } from "../api/dbt/route";

export interface LineageNodeData extends Record<string, unknown> {
    id: string;
    label: string;
    type: "source" | "model" | "test";
    layer: "bronze" | "silver" | "gold";
    materialization?: string;
    status: string;
    schema: string;
    columnsCount?: number;
    testsCount?: number;
    description?: string;
    isSelected?: boolean;
    isUpstream?: boolean;
    isDownstream?: boolean;
    isDimmed?: boolean;
    upstreamCount?: number;
    downstreamCount?: number;
}

function LineageNodeComponent({ data }: NodeProps<any>) {
    const node = data as LineageNodeData;

    const isBronze = node.layer === "bronze";
    const isSilver = node.layer === "silver";

    // Layer-specific accent colors
    const layerBadge = isBronze
        ? { label: "Source", bg: "bg-amber-500/15 text-amber-400 border-amber-500/30" }
        : isSilver
        ? {
              label: node.materialization ? `Model (${node.materialization})` : "Model",
              bg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
          }
        : {
              label: node.materialization ? `Mart (${node.materialization})` : "Mart",
              bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
          };

    // Border & Glow state
    let borderClasses = "border-cardBorder/80 hover:border-muted/60";
    let bgClasses = "bg-[#111622]/95 hover:bg-[#161c2c]/95";

    if (node.isSelected) {
        borderClasses = "border-primary ring-2 ring-primary/80 shadow-lg shadow-primary/20";
        bgClasses = "bg-primary/10";
    } else if (node.isUpstream) {
        borderClasses = "border-blue-500/80 ring-1 ring-blue-500/50 shadow-md shadow-blue-500/10";
        bgClasses = "bg-blue-500/10";
    } else if (node.isDownstream) {
        borderClasses = "border-emerald-500/80 ring-1 ring-emerald-500/50 shadow-md shadow-emerald-500/10";
        bgClasses = "bg-emerald-500/10";
    }

    const opacityClass = node.isDimmed ? "opacity-25 filter grayscale(0.6)" : "opacity-100";

    return (
        <div
            className={`w-[250px] rounded-xl border p-3.5 transition-all duration-200 cursor-pointer backdrop-blur-md relative group select-none shadow-sm ${borderClasses} ${bgClasses} ${opacityClass}`}
        >
            {/* Input Handle (Left) - omitted for bronze roots */}
            {!isBronze && (
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-3 !h-3 !-left-1.5 !bg-[#1e293b] !border-2 !border-blue-400 group-hover:!scale-125 transition-transform"
                />
            )}

            {/* Output Handle (Right) */}
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !-right-1.5 !bg-[#1e293b] !border-2 !border-emerald-400 group-hover:!scale-125 transition-transform"
            />

            {/* Top Row: Layer & Status */}
            <div className="flex items-center justify-between gap-2 mb-2">
                <span
                    className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border font-semibold tracking-wider truncate max-w-[170px] ${layerBadge.bg}`}
                >
                    {layerBadge.label}
                </span>

                {node.status === "STREAMING" ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 bg-cyan-500/15 px-1.5 py-0.5 rounded border border-cyan-500/30">
                        <Waves className="w-2.5 h-2.5 animate-pulse" /> Live
                    </span>
                ) : (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        <Check className="w-2.5 h-2.5" /> OK
                    </span>
                )}
            </div>

            {/* Middle Row: Name & Schema */}
            <div className="space-y-0.5">
                <p className="text-xs font-bold text-foreground font-mono truncate" title={node.label}>
                    {node.label}
                </p>
                <p className="text-[10px] text-muted font-mono truncate">{node.schema}</p>
            </div>

            {/* Bottom Row: Metadata Badges */}
            <div className="mt-2.5 pt-2 border-t border-cardBorder/50 flex items-center justify-between text-[10px] text-muted font-mono">
                <div className="flex items-center gap-2">
                    {node.columnsCount !== undefined && (
                        <span>{node.columnsCount} cols</span>
                    )}
                    {node.testsCount !== undefined && node.testsCount > 0 && (
                        <span className="text-emerald-400/90 flex items-center gap-0.5">
                            ✓ {node.testsCount} tests
                        </span>
                    )}
                </div>

                {node.isUpstream && (
                    <span className="text-[9px] text-blue-400 font-semibold uppercase tracking-wider">
                        ▲ Upstream
                    </span>
                )}
                {node.isDownstream && (
                    <span className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider">
                        ▼ Downstream
                    </span>
                )}
                {node.isSelected && (
                    <span className="text-[9px] text-primary font-semibold uppercase tracking-wider">
                        Selected
                    </span>
                )}
            </div>
        </div>
    );
}

export default memo(LineageNodeComponent);
