import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

/**
 * Beam edge: a smoothstep wire with a short light-streak that glides along it
 * *toward the source* (data feeds upward into the parent / the app root).
 * The streak is a round-capped dash whose dashoffset animates one full period,
 * so it loops seamlessly. `data.child` = the lighter dashed signal wire.
 */
function BeamEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const child = Boolean((data as { child?: boolean } | undefined)?.child);
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: child ? 12 : 16,
  });

  const dash = child ? 16 : 22;
  const gap = child ? 150 : 190;
  const period = dash + gap;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: child ? "var(--td-edge-child)" : "var(--td-edge)",
          strokeWidth: child ? 1.2 : 1.5,
          strokeDasharray: child ? "4 5" : undefined,
        }}
      />
      <path
        className={child ? "td-beam td-beam-child" : "td-beam"}
        d={path}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${gap}`}
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to={period}
          dur={child ? "2.6s" : "2s"}
          repeatCount="indefinite"
        />
      </path>
    </>
  );
}

export const edgeTypes = { beam: BeamEdge };
