"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";

export type SkillState = "mastered" | "available" | "current" | "locked";

export interface SkillGraphNode {
  id: string;
  name: string;
  state: SkillState;
  depth: number;
  hours: number;
  domain: string;
}

const STATE_STYLES: Record<SkillState, { border: string; bg: string; text: string; label: string }> = {
  mastered: { border: "border-emerald-500/60", bg: "bg-emerald-500/12", text: "text-emerald-300", label: "Proven" },
  current: { border: "border-primary", bg: "bg-primary/15", text: "text-primary", label: "Now" },
  available: { border: "border-amber-500/60", bg: "bg-amber-500/10", text: "text-amber-300", label: "Next" },
  locked: { border: "border-border", bg: "bg-secondary/60", text: "text-muted-foreground", label: "Locked" },
};

function SkillNode({ data }: NodeProps) {
  const skill = data as unknown as SkillGraphNode;
  const style = STATE_STYLES[skill.state] ?? STATE_STYLES.locked;
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 min-w-[130px] max-w-[190px] transition-shadow",
        style.border,
        style.bg,
        skill.state === "current" && "shadow-[0_0_24px_-6px_var(--ring)]",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-border !border-0 !w-1.5 !h-1.5" />
      <p className={cn("text-xs font-semibold leading-tight", style.text)}>{skill.name}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{style.label}</span>
        <span className="text-[9px] text-muted-foreground">{skill.hours}h</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-border !border-0 !w-1.5 !h-1.5" />
    </div>
  );
}

const nodeTypes = { skill: SkillNode };

/**
 * Interactive prerequisite DAG. Layout: vertical lanes by depth (simple,
 * deterministic, readable — a Sugiyama layout is overkill for ≤ 25 visible
 * nodes and unstable across replans).
 */
export function SkillGraph({
  skills,
  edges,
  masteredSkills = [],
  height = 420,
  onNodeClick,
}: {
  skills: Array<{ id: string; name: string; domain: string; depth: number; hours: number }>;
  edges: Array<[string, string]>;
  masteredSkills?: string[];
  height?: number;
  onNodeClick?: (skillId: string) => void;
}) {
  const masteredSet = useMemo(() => new Set(masteredSkills), [masteredSkills]);
  const pathSet = useMemo(() => new Set(skills.map((s) => s.id)), [skills]);
  const visibleSkills = useMemo(() => {
    const shown = new Map<string, SkillGraphNode>();
    for (const s of skills) {
      shown.set(s.id, { ...s, state: masteredSet.has(s.id) ? "mastered" : "locked" });
    }
    // First non-mastered path skill = current; following two = available.
    const order = skills.filter((s) => !masteredSet.has(s.id));
    if (order[0]) shown.get(order[0].id)!.state = "current";
    order.slice(1, 3).forEach((s) => {
      const node = shown.get(s.id);
      if (node && node.state === "locked") node.state = "available";
    });
    return shown;
  }, [skills, masteredSet]);

  const { nodes, edges: flowEdges } = useMemo(() => {
    const byDepth = new Map<number, string[]>();
    for (const s of skills) {
      const list = byDepth.get(s.depth) ?? [];
      list.push(s.id);
      byDepth.set(s.depth, list);
    }
    const flowNodes: Node[] = [];
    for (const [depth, ids] of byDepth) {
      ids.forEach((id, i) => {
        const skill = visibleSkills.get(id);
        if (!skill) return;
        const spread = (i - (ids.length - 1) / 2) * 200;
        flowNodes.push({
          id,
          type: "skill",
          position: { x: spread, y: depth * 130 },
          data: skill as unknown as Record<string, unknown>,
        });
      });
    }
    const flowEdgesList: Edge[] = edges
      .filter(([from, to]) => pathSet.has(from) || pathSet.has(to))
      .map(([from, to]) => {
        const fromMastered = masteredSet.has(from);
        const isCurrent = visibleSkills.get(to)?.state === "current";
        return {
          id: `${from}->${to}`,
          source: from,
          target: to,
          animated: isCurrent,
          style: {
            stroke: fromMastered ? "oklch(0.72 0.14 162 / 0.5)" : isCurrent ? "oklch(0.72 0.14 162)" : "var(--border)",
            strokeWidth: isCurrent ? 2 : 1.2,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--border)", width: 14, height: 14 },
        };
      });
    return { nodes: flowNodes, edges: flowEdgesList };
  }, [skills, edges, visibleSkills, masteredSet, pathSet]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => onNodeClick?.(node.id),
    [onNodeClick],
  );

  return (
    <div style={{ height }} className="rounded-xl border border-border/60 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
        <Controls
          className="!bg-card !border-border !rounded-lg overflow-hidden"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
}
