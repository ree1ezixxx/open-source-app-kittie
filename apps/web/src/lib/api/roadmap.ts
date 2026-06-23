import type { RoadmapTemplate } from "@kittie/types";

/** Roadmap web client. Slice 1: fetch the fixed curated template. */
export async function getRoadmapTemplate(signal?: AbortSignal): Promise<RoadmapTemplate> {
  const res = await fetch("/api/v1/roadmap/template", { signal });
  if (!res.ok) throw new Error(`Failed to load roadmap (${res.status})`);
  const json = (await res.json()) as { data: RoadmapTemplate };
  return json.data;
}
