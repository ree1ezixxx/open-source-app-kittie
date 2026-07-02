/**
 * Template registry.
 *
 * Templates are keyed by the contract's `template` field. This foundation ships
 * a single `generic` template; specific templates (app-teardown, category-pulse,
 * build-brief) register themselves onto a registry in their own packages.
 */
import type { IntelligenceReportContract } from "@kittie/types";
import type { ReportBlock, ReportDocument, ReportSection } from "./document.js";

export type ReportTemplate<TOutput = unknown> = (
  contract: IntelligenceReportContract<TOutput>,
) => ReportDocument;

export const GENERIC_TEMPLATE = "generic";

export class ReportTemplateRegistry {
  private readonly templates = new Map<string, ReportTemplate>();

  register(name: string, template: ReportTemplate): this {
    this.templates.set(name, template);
    return this;
  }

  has(name: string): boolean {
    return this.templates.has(name);
  }

  /** Returns the named template, or the `generic` fallback if unregistered. */
  resolve(name: string): ReportTemplate {
    const template = this.templates.get(name) ?? this.templates.get(GENERIC_TEMPLATE);
    if (!template) {
      throw new Error(
        `No template registered for "${name}" and no "${GENERIC_TEMPLATE}" fallback is present.`,
      );
    }
    return template;
  }

  names(): string[] {
    return [...this.templates.keys()];
  }
}

/** A registry pre-seeded with the built-in `generic` template. */
export function createDefaultRegistry(): ReportTemplateRegistry {
  return new ReportTemplateRegistry().register(GENERIC_TEMPLATE, genericTemplate);
}

/**
 * Renders any contract from its metadata, source query, and output payload
 * without knowing the concrete report shape. Acts as the fallback so an
 * unrecognised template still produces an evidence-backed artifact.
 */
export const genericTemplate: ReportTemplate = (contract) => {
  const sections: ReportSection[] = [
    {
      heading: "Overview",
      blocks: [
        {
          kind: "keyValue",
          entries: [
            { label: "Report ID", value: contract.reportId },
            { label: "Template", value: contract.template },
            { label: "Status", value: contract.status },
          ],
        },
      ],
    },
  ];

  const queryEntries = Object.entries(contract.sourceQuery).map(([label, value]) => ({
    label,
    value: value === null ? "—" : String(value),
  }));
  if (queryEntries.length > 0) {
    sections.push({
      heading: "Source query",
      blocks: [{ kind: "keyValue", entries: queryEntries }],
    });
  }

  if (contract.output !== null && contract.output !== undefined) {
    const outputBlock: ReportBlock = { kind: "text", text: stringifyOutput(contract.output) };
    sections.push({ heading: "Output", blocks: [outputBlock] });
  }

  return {
    title: contract.outputMetadata.title,
    summary: `Generated ${contract.outputMetadata.generatedAt ?? "at an unrecorded time"} · status ${contract.status}.`,
    sections,
  };
};

function stringifyOutput(output: unknown): string {
  if (typeof output === "string") return output;
  return JSON.stringify(output, null, 2);
}
