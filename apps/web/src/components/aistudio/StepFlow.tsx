import { Fragment } from "react";
import { IconChevronRight } from "./icons";

/** 3-step progress indicator for the generation flow. `current` is 0-indexed. */
export function StepFlow({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="studio-steps">
      {steps.map((label, i) => (
        <Fragment key={label}>
          <div className={`studio-step${i === current ? " active" : i < current ? " done" : ""}`}>
            <span className="n">{i + 1}</span>
            <span className="label">{label}</span>
          </div>
          {i < steps.length - 1 && (
            <span className="studio-step-arrow">
              <IconChevronRight />
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
}
