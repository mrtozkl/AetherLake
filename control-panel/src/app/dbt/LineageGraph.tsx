"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    MiniMap,
    Controls,
    ControlButton,
    useNodesState,
    useEdgesState,
    useReactFlow,
    ReactFlowProvider,
    MarkerType,
    Node,
    Edge,
    Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import {
    ZoomIn,
    ZoomOut,
    Maximize2,
    Minimize2,
    RotateCcw,
    Focus,
    Search,
    MapPin,
    Sparkles,
    Filter,
    Layers,
    Info,
    ArrowRight,
} from "lucide-react";
import LineageNodeComponent, { LineageNodeData } from "./LineageNode";
import { DbtDagNode, DbtDagEdge } from "../api/dbt/route";
import { useLocale } from "../locale-provider";

const nodeTypes = {
    lineageNode: LineageNodeComponent,
};

const NODE_WIDTH = 250;
const NODE_HEIGHT = 95;

interface LineageGraphProps {
    rawNodes: DbtDagNode[];
    rawEdges: DbtDagEdge[];
    selectedNodeId: string | null;
    onSelectNode: (nodeId: string) => void;
    isFullscreen?: boolean;
    onToggleFullscreen?: () => void;
}

// Dagre layout computation (Left-to-Right)
function getLayoutedGraph(
    nodes: Node<LineageNodeData>[],
    edges: Edge[],
    direction: "LR" = "LR"
) {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
        rankdir: direction,
        nodesep: 45, // Vertical separation between nodes in the same column
        ranksep: 110, // Horizontal separation between layer columns
        align: "UL",
    });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            targetPosition: Position.Left,
            sourcePosition: Position.Right,
            position: {
                x: nodeWithPosition.x - NODE_WIDTH / 2,
                y: nodeWithPosition.y - NODE_HEIGHT / 2,
            },
        };
    });

    return { layoutedNodes, layoutedEdges: edges };
}

function LineageGraphInner({
    rawNodes,
    rawEdges,
    selectedNodeId,
    onSelectNode,
    isFullscreen = false,
    onToggleFullscreen,
}: LineageGraphProps) {
    const { t } = useLocale();
    const { fitView, zoomIn, zoomOut, setCenter } = useReactFlow();

    // Canvas feature states
    const [searchQuery, setSearchQuery] = useState("");
    const [layerFilter, setLayerFilter] = useState<"all" | "bronze" | "silver" | "gold">("all");
    const [focusMode, setFocusMode] = useState(false);
    const [showMinimap, setShowMinimap] = useState(true);

    // Compute Upstream and Downstream reachable nodes for the selected node
    const lineageSets = useMemo(() => {
        if (!selectedNodeId) {
            return {
                upstreamNodes: new Set<string>(),
                downstreamNodes: new Set<string>(),
                upstreamEdges: new Set<string>(),
                downstreamEdges: new Set<string>(),
            };
        }

        const upstreamNodes = new Set<string>();
        const downstreamNodes = new Set<string>();
        const upstreamEdges = new Set<string>();
        const downstreamEdges = new Set<string>();

        // Recursive upstream search
        const traverseUpstream = (targetId: string) => {
            rawEdges
                .filter((e) => e.target === targetId)
                .forEach((e) => {
                    upstreamEdges.add(e.id);
                    if (!upstreamNodes.has(e.source)) {
                        upstreamNodes.add(e.source);
                        traverseUpstream(e.source);
                    }
                });
        };

        // Recursive downstream search
        const traverseDownstream = (sourceId: string) => {
            rawEdges
                .filter((e) => e.source === sourceId)
                .forEach((e) => {
                    downstreamEdges.add(e.id);
                    if (!downstreamNodes.has(e.target)) {
                        downstreamNodes.add(e.target);
                        traverseDownstream(e.target);
                    }
                });
        };

        traverseUpstream(selectedNodeId);
        traverseDownstream(selectedNodeId);

        return { upstreamNodes, downstreamNodes, upstreamEdges, downstreamEdges };
    }, [selectedNodeId, rawEdges]);

    // Filter nodes based on Focus Mode, Layer Filter, and Search
    const activeNodesList = useMemo(() => {
        return rawNodes.filter((node) => {
            // Focus mode: show only selected node and its connected lineage
            if (focusMode && selectedNodeId) {
                const isRelevant =
                    node.id === selectedNodeId ||
                    lineageSets.upstreamNodes.has(node.id) ||
                    lineageSets.downstreamNodes.has(node.id);
                if (!isRelevant) return false;
            }

            // Layer filter
            if (layerFilter !== "all" && node.layer !== layerFilter) {
                return false;
            }

            return true;
        });
    }, [rawNodes, focusMode, selectedNodeId, lineageSets, layerFilter]);

    // Filter active edges (both source and target must be active)
    const activeEdgesList = useMemo(() => {
        const activeNodeIds = new Set(activeNodesList.map((n) => n.id));
        return rawEdges.filter(
            (e) => activeNodeIds.has(e.source) && activeNodeIds.has(e.target)
        );
    }, [rawEdges, activeNodesList]);

    // Build React Flow Node definitions
    const flowNodes: Node<LineageNodeData>[] = useMemo(() => {
        const hasSearch = searchQuery.trim().length > 0;
        const query = searchQuery.toLowerCase().trim();

        return activeNodesList.map((dagNode) => {
            const isSelected = dagNode.id === selectedNodeId;
            const isUpstream = lineageSets.upstreamNodes.has(dagNode.id);
            const isDownstream = lineageSets.downstreamNodes.has(dagNode.id);

            // Dimming logic
            let isDimmed = false;
            if (hasSearch) {
                const matches =
                    dagNode.label.toLowerCase().includes(query) ||
                    dagNode.schema.toLowerCase().includes(query) ||
                    (dagNode.description && dagNode.description.toLowerCase().includes(query));
                if (!matches) isDimmed = true;
            } else if (selectedNodeId) {
                const inLineage = isSelected || isUpstream || isDownstream;
                if (!inLineage) isDimmed = true;
            }

            return {
                id: dagNode.id,
                type: "lineageNode",
                data: {
                    ...dagNode,
                    isSelected,
                    isUpstream,
                    isDownstream,
                    isDimmed,
                },
                position: { x: 0, y: 0 },
            };
        });
    }, [activeNodesList, selectedNodeId, lineageSets, searchQuery]);

    // Build React Flow Edge definitions with directional styling and flow animations
    const flowEdges: Edge[] = useMemo(() => {
        return activeEdgesList.map((dagEdge) => {
            const isUpstream = lineageSets.upstreamEdges.has(dagEdge.id);
            const isDownstream = lineageSets.downstreamEdges.has(dagEdge.id);

            let strokeColor = "rgba(148, 163, 184, 0.4)";
            let strokeWidth = 1.5;
            let animated = false;
            let markerColor = "rgba(148, 163, 184, 0.5)";

            if (isUpstream) {
                strokeColor = "#3b82f6"; // Upstream blue
                strokeWidth = 2.5;
                animated = true;
                markerColor = "#3b82f6";
            } else if (isDownstream) {
                strokeColor = "#10b981"; // Downstream emerald
                strokeWidth = 2.5;
                animated = true;
                markerColor = "#10b981";
            } else if (selectedNodeId) {
                strokeColor = "rgba(148, 163, 184, 0.12)";
                strokeWidth = 1;
                markerColor = "rgba(148, 163, 184, 0.18)";
            }

            return {
                id: dagEdge.id,
                source: dagEdge.source,
                target: dagEdge.target,
                type: "smoothstep",
                animated,
                style: {
                    stroke: strokeColor,
                    strokeWidth,
                    transition: "stroke 0.2s ease, stroke-width 0.2s ease",
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 14,
                    height: 14,
                    color: markerColor,
                },
            };
        });
    }, [activeEdgesList, lineageSets, selectedNodeId]);

    // Apply Dagre auto-layout
    const { layoutedNodes, layoutedEdges } = useMemo(() => {
        return getLayoutedGraph(flowNodes, flowEdges, "LR");
    }, [flowNodes, flowEdges]);

    const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

    // Sync state whenever layout changes
    useEffect(() => {
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
    }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

    // Auto-fit on initial render or layout switch
    useEffect(() => {
        const timer = setTimeout(() => {
            fitView({ padding: 0.15, duration: 400 });
        }, 80);
        return () => clearTimeout(timer);
    }, [fitView, focusMode, layerFilter]);

    // Handle node click
    const handleNodeClick = useCallback(
        (_: React.MouseEvent, node: Node) => {
            onSelectNode(node.id);
        },
        [onSelectNode]
    );

    return (
        <div className="w-full h-full relative flex flex-col overflow-hidden select-none bg-[#0b0e14]">
            {/* Floating Top Toolbar */}
            <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
                {/* Left: Layer Filters & Focus Mode */}
                <div className="flex items-center gap-2 bg-[#131722]/90 backdrop-blur-md p-1.5 rounded-xl border border-cardBorder shadow-lg pointer-events-auto">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setLayerFilter("all")}
                            className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all ${
                                layerFilter === "all"
                                    ? "bg-primary text-white font-semibold shadow-sm"
                                    : "text-muted hover:text-foreground hover:bg-card/60"
                            }`}
                        >
                            {t("dbt.filterAll")}
                        </button>
                        <button
                            onClick={() => setLayerFilter("bronze")}
                            className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all ${
                                layerFilter === "bronze"
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold"
                                    : "text-muted hover:text-foreground hover:bg-card/60"
                            }`}
                        >
                            Bronze
                        </button>
                        <button
                            onClick={() => setLayerFilter("silver")}
                            className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all ${
                                layerFilter === "silver"
                                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 font-semibold"
                                    : "text-muted hover:text-foreground hover:bg-card/60"
                            }`}
                        >
                            Silver
                        </button>
                        <button
                            onClick={() => setLayerFilter("gold")}
                            className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all ${
                                layerFilter === "gold"
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                                    : "text-muted hover:text-foreground hover:bg-card/60"
                            }`}
                        >
                            Gold
                        </button>
                    </div>

                    <div className="w-[1px] h-4 bg-cardBorder mx-1" />

                    {/* Focus Mode Button */}
                    <button
                        onClick={() => setFocusMode((prev) => !prev)}
                        disabled={!selectedNodeId}
                        className={`px-2.5 py-1 text-xs font-mono rounded-lg flex items-center gap-1.5 transition-all ${
                            focusMode
                                ? "bg-purple-500/25 text-purple-300 border border-purple-500/50 shadow-sm"
                                : "text-muted hover:text-foreground hover:bg-card/60 disabled:opacity-40 disabled:cursor-not-allowed"
                        }`}
                        title={t("dbt.focusMode")}
                    >
                        <Focus className="w-3.5 h-3.5" />
                        <span>{focusMode ? t("dbt.focusModeActive") : t("dbt.focusMode")}</span>
                    </button>
                </div>

                {/* Right: Search, Stats & Canvas Navigation Controls */}
                <div className="flex items-center gap-2.5 pointer-events-auto">
                    {/* Search Field */}
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder={t("dbt.searchPlaceholder")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-[#131722]/90 backdrop-blur-md border border-cardBorder rounded-xl pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted/60 focus:outline-none focus:border-primary w-48 sm:w-60 shadow-lg font-mono"
                        />
                    </div>

                    {/* Quick Canvas Actions */}
                    <div className="flex items-center gap-1 bg-[#131722]/90 backdrop-blur-md p-1.5 rounded-xl border border-cardBorder shadow-lg">
                        <button
                            onClick={() => fitView({ padding: 0.18, duration: 400 })}
                            className="btn-ghost p-1.5 text-muted hover:text-foreground rounded-lg"
                            title={t("dbt.fitView")}
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => zoomIn({ duration: 300 })}
                            className="btn-ghost p-1.5 text-muted hover:text-foreground rounded-lg"
                            title={t("dbt.zoomIn")}
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => zoomOut({ duration: 300 })}
                            className="btn-ghost p-1.5 text-muted hover:text-foreground rounded-lg"
                            title={t("dbt.zoomOut")}
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setShowMinimap((prev) => !prev)}
                            className={`btn-ghost p-1.5 rounded-lg transition-colors ${
                                showMinimap ? "text-primary bg-primary/10" : "text-muted hover:text-foreground"
                            }`}
                            title={t("dbt.toggleMinimap")}
                        >
                            <MapPin className="w-3.5 h-3.5" />
                        </button>

                        {onToggleFullscreen && (
                            <button
                                onClick={onToggleFullscreen}
                                className="btn-ghost p-1.5 text-muted hover:text-foreground rounded-lg ml-1"
                                title={isFullscreen ? t("dbt.exitFullscreen") : t("dbt.fullscreen")}
                            >
                                {isFullscreen ? (
                                    <Minimize2 className="w-3.5 h-3.5" />
                                ) : (
                                    <Maximize2 className="w-3.5 h-3.5 text-primary" />
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* React Flow Core Graph */}
            <div className="flex-1 w-full h-full">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={handleNodeClick}
                    nodeTypes={nodeTypes}
                    colorMode="dark"
                    minZoom={0.2}
                    maxZoom={2.2}
                    fitView
                    fitViewOptions={{ padding: 0.15 }}
                    proOptions={{ hideAttribution: true }}
                >
                    <Background
                        variant={BackgroundVariant.Dots}
                        gap={20}
                        size={1.2}
                        color="rgba(255, 255, 255, 0.07)"
                    />

                    {/* Interactive Minimap */}
                    {showMinimap && (
                        <MiniMap
                            nodeStrokeWidth={3}
                            nodeColor={(n) => {
                                const data = n.data as LineageNodeData;
                                if (data?.layer === "bronze") return "#f59e0b";
                                if (data?.layer === "silver") return "#3b82f6";
                                if (data?.layer === "gold") return "#10b981";
                                return "#64748b";
                            }}
                            className="!bg-[#111622]/95 !border !border-cardBorder !rounded-xl !overflow-hidden !shadow-xl !bottom-4 !right-4"
                            maskColor="rgba(0, 0, 0, 0.65)"
                            zoomable
                            pannable
                        />
                    )}
                </ReactFlow>
            </div>

            {/* Bottom Guidance Legend Bar */}
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-4 bg-[#131722]/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-cardBorder text-xs text-muted pointer-events-none">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="font-mono text-[11px] text-blue-400 font-medium">
                        {t("dbt.upstream")}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-mono text-[11px] text-emerald-400 font-medium">
                        {t("dbt.downstream")}
                    </span>
                </div>
                <div className="w-[1px] h-3.5 bg-cardBorder" />
                <span className="font-mono text-[11px] text-muted">
                    {activeNodesList.length} {t("dbt.nodeCount")} · {activeEdgesList.length} {t("dbt.edgeCount")}
                </span>
            </div>
        </div>
    );
}

export default function LineageGraph(props: LineageGraphProps) {
    return (
        <ReactFlowProvider>
            <LineageGraphInner {...props} />
        </ReactFlowProvider>
    );
}
