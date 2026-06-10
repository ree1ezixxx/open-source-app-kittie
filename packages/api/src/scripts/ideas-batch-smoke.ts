/* One-off: prove the batched hot-ideas sweep end-to-end against the live DB. */
import { sweepHotIdeas } from "../services/idea-sweep-service.js";

import { GEMINI_MODEL } from "../lib/gemini.js";
const r = await sweepHotIdeas(8, GEMINI_MODEL); // one batched call on the flash bucket
console.log(`[ideas-batch-smoke] existing=${r.existing}/${r.target} generated=${r.generated} failed=${r.failed}`);
process.exit(0);
