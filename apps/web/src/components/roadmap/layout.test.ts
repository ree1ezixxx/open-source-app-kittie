import { describe, expect, it } from "vitest";
import type { RoadmapNode, RoadmapTemplate } from "@kittie/types";

import { roadmapLayout, directNeighbors, COL_W, COL_GAP } from "./layout";

const node = (over: Partial<RoadmapNode> & Pick<RoadmapNode, "key" | "stage">): RoadmapNode => ({
  kind: "you",
  title: over.key,
  dependsOn: [],
  state: "todo",
  ...over,
});

const template = (nodes: RoadmapNode[]): RoadmapTemplate => ({
  stages: [
    { id: "idea", label: "Idea" },
    { id: "initial", label: "Initial" },
    { id: "build", label: "Build" },
  ],
  nodes,
});

describe("roadmapLayout", () => {
  it("places each node in its stage's column", () => {
    const { nodes } = roadmapLayout(
      template([
        node({ key: "a", stage: "idea" }),
        node({ key: "b", stage: "initial" }),
        node({ key: "c", stage: "build" }),
      ]),
    );
    const x = (id: string) => nodes.find((n) => n.id === id)!.position.x;
    expect(x("a")).toBe(0);
    expect(x("b")).toBe(COL_W + COL_GAP);
    expect(x("c")).toBe(2 * (COL_W + COL_GAP));
  });

  it("stacks nodes in a column in template order with increasing y", () => {
    const { nodes } = roadmapLayout(
      template([
        node({ key: "a1", stage: "idea" }),
        node({ key: "a2", stage: "idea" }),
        node({ key: "a3", stage: "idea" }),
      ]),
    );
    const y = (id: string) => nodes.find((n) => n.id === id)!.position.y;
    expect(y("a1")).toBeLessThan(y("a2"));
    expect(y("a2")).toBeLessThan(y("a3"));
    // same column → same x
    expect(new Set(nodes.map((n) => n.position.x)).size).toBe(1);
  });

  it("dims a node only when its dependsOn aren't all done (advisory)", () => {
    const { nodes } = roadmapLayout(
      template([
        node({ key: "dep", stage: "idea", state: "todo" }),
        node({ key: "child", stage: "initial", dependsOn: ["dep"] }),
      ]),
    );
    const child = nodes.find((n) => n.id === "child")!;
    expect((child.data as { dimmed: boolean }).dimmed).toBe(true);
  });

  it("does not dim once the dependency is done", () => {
    const { nodes } = roadmapLayout(
      template([
        node({ key: "dep", stage: "idea", state: "done" }),
        node({ key: "child", stage: "initial", dependsOn: ["dep"] }),
      ]),
    );
    const child = nodes.find((n) => n.id === "child")!;
    expect((child.data as { dimmed: boolean }).dimmed).toBe(false);
  });

  it("never dims a node with no dependencies", () => {
    const { nodes } = roadmapLayout(template([node({ key: "root", stage: "idea" })]));
    expect((nodes[0].data as { dimmed: boolean }).dimmed).toBe(false);
  });

  it("emits one edge per dependency", () => {
    const { edges } = roadmapLayout(
      template([
        node({ key: "a", stage: "idea" }),
        node({ key: "b", stage: "initial", dependsOn: ["a"] }),
      ]),
    );
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: "a", target: "b" });
  });

  it("reports per-column totals and done counts", () => {
    const { columns } = roadmapLayout(
      template([
        node({ key: "a1", stage: "idea", state: "done" }),
        node({ key: "a2", stage: "idea" }),
        node({ key: "b1", stage: "build" }),
      ]),
    );
    const idea = columns.find((c) => c.id === "idea")!;
    expect(idea.total).toBe(2);
    expect(idea.done).toBe(1);
    expect(columns.find((c) => c.id === "initial")!.total).toBe(0);
    expect(columns.find((c) => c.id === "build")!.total).toBe(1);
  });
});

describe("directNeighbors", () => {
  // chain: a -> b -> c, with a side branch b -> d
  const chain = [
    node({ key: "a", stage: "idea" }),
    node({ key: "b", stage: "initial", dependsOn: ["a"] }),
    node({ key: "c", stage: "build", dependsOn: ["b"] }),
    node({ key: "d", stage: "build", dependsOn: ["b"] }),
  ];

  it("includes the node and its direct deps + direct dependents only", () => {
    expect(directNeighbors(chain, "b")).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("does NOT include transitive ancestors (only 1 hop up)", () => {
    // c's neighbours are b (dep) + itself; a is 2 hops up and excluded
    expect(directNeighbors(chain, "c")).toEqual(new Set(["b", "c"]));
  });

  it("does NOT include transitive descendants (only 1 hop down)", () => {
    // a's neighbours are b (dependent) + itself; c/d are 2 hops down and excluded
    expect(directNeighbors(chain, "a")).toEqual(new Set(["a", "b"]));
  });

  it("returns empty for an unknown key", () => {
    expect(directNeighbors(chain, "nope").size).toBe(0);
  });
});
