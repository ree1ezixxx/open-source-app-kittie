import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

/**
 * Beam edge: a smoothstep wire with a glowing dot that travels along it
 * *toward the source* (data feeds upward into the parent / the app root).
 * `data.child` renders the lighter dashed signal wire + a dimmer beam.
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
      <circle className={child ? "td-beam td-beam-child" : "td-beam"} r={child ? 2 : 2.6}>
        <animateMotion
          dur={child ? "2.8s" : "2s"}
          repeatCount="indefinite"
          path={path}
          keyPoints="1;0"
          keyTimes="0;1"
          calcMode="linear"
        />
      </circle>
    </>
  );
}

export const edgeTypes = { beam: BeamEdge };
