import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import zlib from "node:zlib";

import { fromBlueprintExpo, type AppBlueprint } from "@kittie/clone-engine";

import { emitRunEvent } from "./run-events.js";
import { syncWorkspace, workspaceRoot } from "./workspace.js";

/* ============================================================
   Visual QA loop (PRD §9).

   After a run leaves a preview ready, screenshot the generated app, score it
   against a DETERMINISTIC rubric (no vision model), and — if it scores poorly
   for a reason a deterministic pass can fix (blank / low-density) — regenerate
   the screen files from the blueprint, re-bundle, re-screenshot, and keep the
   before/after artifacts under runs/<runId>/visual/.

   Honest about its own ceiling: with no model, the only "patch" available is
   regenerating files from the blueprint (same lever as repair). It never
   pretends to more intelligence than that, and it NEVER fails a run — QA is
   log-only and capped so a wedged Chrome can't stall the pipeline.
   ============================================================ */

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** Score below this triggers the (single) deterministic patch pass. */
export const QA_SCORE_THRESHOLD = 60;
/** Hard ceiling for the whole QA phase. */
const QA_PHASE_BUDGET_MS = 60 * 1000;
/** Per-screenshot virtual-time budget handed to headless Chrome. */
const SHOT_VTIME_MS = 9000;
/** Settle delay after the bundle warms before we shoot. */
const SETTLE_MS = 1500;
const BUNDLE_POLL_MS = 1500;

export interface QaIssue {
  code: "blank" | "error_overlay" | "low_density";
  detail: string;
}

export interface QaResult {
  score: number;
  issues: QaIssue[];
  width: number;
  height: number;
  /** fraction of pixels NOT matching the modal (background) colour, 0..1 */
  contentFraction: number;
  topFraction: number;
  bottomFraction: number;
}

/* ---- screenshot capture ------------------------------------------------ */

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** True if the url answers 200/30x, fetching the body to warm the Metro bundle. */
function urlReady(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      resolve(false);
      return;
    }
    const req = net.createConnection({ port: Number(u.port) || 80, host: u.hostname }, () => {
      req.write(`GET ${u.pathname || "/"} HTTP/1.0\r\nHost: ${u.hostname}\r\nConnection: close\r\n\r\n`);
    });
    let data = "";
    req.setTimeout(8000, () => {
      req.destroy();
      resolve(/^HTTP\/1\.[01] (200|30\d)/.test(data));
    });
    req.on("data", (b) => {
      data += b.toString("utf8");
    });
    req.on("end", () => resolve(/^HTTP\/1\.[01] (200|30\d)/.test(data)));
    req.on("error", () => resolve(false));
  });
}

/** Poll the url (warming the bundle) until ready or deadline. */
async function waitForBundle(url: string, deadline: number): Promise<boolean> {
  while (Date.now() < deadline) {
    if (await urlReady(url)) return true;
    await delay(BUNDLE_POLL_MS);
  }
  return false;
}

/**
 * Capture a screenshot of `url` to `outPath` using headless Chrome's one-shot
 * `--screenshot` CLI. This needs no CDP daemon — it boots a throwaway headless
 * instance, renders with a virtual-time budget (so async Metro chunks land),
 * writes the PNG and exits. Returns true on a non-trivial PNG.
 */
export async function captureScreenshot(url: string, outPath: string, budgetMs = QA_PHASE_BUDGET_MS): Promise<boolean> {
  if (!(await exists(CHROME_BIN))) return false;
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.rm(outPath, { force: true });

  return new Promise((resolve) => {
    const child = spawn(
      CHROME_BIN,
      [
        "--headless=new",
        `--screenshot=${outPath}`,
        "--window-size=390,844",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        `--virtual-time-budget=${SHOT_VTIME_MS}`,
        url,
      ],
      { stdio: "ignore" },
    );
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* gone */
      }
    }, Math.max(15000, budgetMs));
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("exit", async () => {
      clearTimeout(timer);
      try {
        const st = await fs.stat(outPath);
        resolve(st.size > 1024);
      } catch {
        resolve(false);
      }
    });
  });
}

/* ---- PNG decode (built-ins only) --------------------------------------- */

interface DecodedPng {
  width: number;
  height: number;
  channels: number;
  /** raw RGBA-ish samples row-major, length = width*height*channels */
  data: Uint8Array;
}

/**
 * Minimal PNG decoder for the subset Chrome emits: 8-bit, colour-type 2 (RGB)
 * or 6 (RGBA), no interlace, zlib-deflated IDAT. Enough to sample pixels for
 * the rubric. Throws on anything outside that subset.
 */
function decodePng(buf: Buffer): DecodedPng {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error("not a PNG");

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const dataStart = off + 8;
    if (type === "IHDR") {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf[dataStart + 8]!;
      colorType = buf[dataStart + 9]!;
      interlace = buf[dataStart + 12]!;
    } else if (type === "IDAT") {
      idat.push(buf.subarray(dataStart, dataStart + len));
    } else if (type === "IEND") {
      break;
    }
    off = dataStart + len + 4; // skip data + CRC
  }

  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error("interlaced PNG unsupported");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * channels);

  // Reverse PNG row filters (None/Sub/Up/Average/Paeth).
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]!;
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[pos++]!;
      const a = x >= channels ? out[rowStart + x - channels]! : 0;
      const b = y > 0 ? out[rowStart - stride + x]! : 0;
      const c = x >= channels && y > 0 ? out[rowStart - stride + x - channels]! : 0;
      let val = rawByte;
      switch (filter) {
        case 0:
          break;
        case 1:
          val = rawByte + a;
          break;
        case 2:
          val = rawByte + b;
          break;
        case 3:
          val = rawByte + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          val = rawByte + pr;
          break;
        }
        default:
          throw new Error(`unknown PNG filter ${filter}`);
      }
      out[rowStart + x] = val & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

/* ---- rubric ------------------------------------------------------------ */

/** Quantise a pixel to a coarse RGB key (5-bit/channel) for modal-colour binning. */
function quantKey(r: number, g: number, b: number): number {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

/**
 * Deterministic rubric — no vision model. Samples the decoded PNG on a grid and
 * scores measurable signals:
 *   (a) not blank   — fraction of pixels differing from the modal (background)
 *                     colour must exceed a threshold;
 *   (b) not an error overlay — Metro's red-box is a saturated red field; a high
 *                     fraction of strong-red pixels flags a likely error screen;
 *   (c) content coverage — non-background fraction in the top and bottom thirds
 *                     (a real screen has a header up top and a tab bar/content
 *                     down low; both empty => low density).
 */
export function analyzeDecoded(png: DecodedPng): QaResult {
  const { width, height, channels, data } = png;
  const issues: QaIssue[] = [];

  // Sample a grid (~120x260 cap) to keep this O(samples), not O(pixels).
  const stepX = Math.max(1, Math.floor(width / 120));
  const stepY = Math.max(1, Math.floor(height / 260));
  const counts = new Map<number, number>();
  let samples = 0;
  let redish = 0;
  const thirds = [0, 0, 0]; // raw sample counts per third
  const thirdTotals = [0, 0, 0];
  const px: { r: number; g: number; b: number; band: number }[] = [];

  for (let y = 0; y < height; y += stepY) {
    const band = y < height / 3 ? 0 : y < (2 * height) / 3 ? 1 : 2;
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * channels;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const key = quantKey(r, g, b);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      // Strong, saturated red (Metro red-box ≈ #cc0000-ish on a dark page).
      if (r > 150 && g < 90 && b < 90) redish++;
      px.push({ r, g, b, band });
      thirdTotals[band]!++;
      samples++;
    }
  }

  // Modal (background) colour = the most common quantised bin.
  let modalKey = 0;
  let modalCount = 0;
  for (const [k, n] of counts) {
    if (n > modalCount) {
      modalCount = n;
      modalKey = k;
    }
  }
  const modalR = ((modalKey >> 10) & 0x1f) << 3;
  const modalG = ((modalKey >> 5) & 0x1f) << 3;
  const modalB = (modalKey & 0x1f) << 3;

  // Count pixels meaningfully different from the modal colour.
  let nonBg = 0;
  for (const p of px) {
    const dist = Math.abs(p.r - modalR) + Math.abs(p.g - modalG) + Math.abs(p.b - modalB);
    if (dist > 36) {
      nonBg++;
      thirds[p.band]!++;
    }
  }

  const contentFraction = samples ? nonBg / samples : 0;
  const topFraction = thirdTotals[0] ? thirds[0]! / thirdTotals[0]! : 0;
  const bottomFraction = thirdTotals[2] ? thirds[2]! / thirdTotals[2]! : 0;
  const redFraction = samples ? redish / samples : 0;

  // ---- score 0..100 from the signals ----
  let score = 100;

  if (contentFraction < 0.01) {
    issues.push({ code: "blank", detail: `screen appears blank (${(contentFraction * 100).toFixed(1)}% non-background)` });
    score -= 70;
  } else if (contentFraction < 0.04) {
    issues.push({ code: "low_density", detail: `low content density (${(contentFraction * 100).toFixed(1)}% non-background)` });
    score -= 30;
  }

  // A real screen carries content in BOTH the top (header) and bottom (tab bar)
  // thirds; a near-empty band in either direction is a coverage smell.
  if (topFraction < 0.01 && bottomFraction < 0.01) {
    issues.push({ code: "low_density", detail: "no content in top or bottom third" });
    score -= 20;
  } else if (topFraction < 0.005 || bottomFraction < 0.005) {
    issues.push({ code: "low_density", detail: "sparse content in a screen band" });
    score -= 10;
  }

  if (redFraction > 0.25) {
    issues.push({ code: "error_overlay", detail: `possible error overlay (${(redFraction * 100).toFixed(0)}% red field)` });
    score -= 50;
  }

  // De-dup issue codes (keep the first/most-severe detail per code).
  const seen = new Set<string>();
  const deduped = issues.filter((it) => (seen.has(it.code) ? false : (seen.add(it.code), true)));

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    issues: deduped,
    width,
    height,
    contentFraction,
    topFraction,
    bottomFraction,
  };
}

/** Decode + analyze a PNG file. Throws on a corrupt/undersized image. */
export async function analyzeScreenshot(pngPath: string): Promise<QaResult> {
  const buf = await fs.readFile(pngPath);
  const png = decodePng(buf);
  if (png.width < 50 || png.height < 50) {
    throw new Error(`PNG dimensions too small (${png.width}x${png.height})`);
  }
  return analyzeDecoded(png);
}

/* ---- patch pass -------------------------------------------------------- */

/**
 * The only deterministic UI patch available without a model: regenerate every
 * screen file from the blueprint (the same lever repair uses) and let Metro
 * re-bundle. Returns the list of files written.
 */
async function regenerateScreens(projectId: string, blueprint: AppBlueprint): Promise<string[]> {
  const files = fromBlueprintExpo(blueprint).files;
  const result = await syncWorkspace(projectId, files);
  return result.written;
}

/* ---- phase orchestration ----------------------------------------------- */

export interface VisualQaOutcome {
  ran: boolean;
  skippedReason?: string;
  before?: QaResult;
  after?: QaResult;
  patched: boolean;
  beforePath?: string;
  afterPath?: string;
}

/**
 * Run the Visual QA phase for a run. NEVER throws and NEVER fails the run —
 * every problem is logged and the phase returns gracefully. Capped at
 * QA_PHASE_BUDGET_MS so a wedged Chrome can't stall the pipeline.
 *
 * Flow: warm bundle -> before.png -> analyze -> if score < threshold for a
 * fixable reason: regenerate -> re-warm bundle -> after.png -> re-analyze.
 * Writes visual_score.json + visual_qa_notes.md into runs/<runId>/.
 */
export async function runVisualQa(
  runId: string,
  projectId: string,
  blueprint: AppBlueprint,
  previewUrl: string | null,
  /** Sub-dir under runs/ for artifacts. Defaults to runId; the builder passes
   *  the persisted assistant message id so artifacts sit beside the before/
   *  after workspace snapshots while events still stream on the live runId. */
  artifactKey: string = runId,
): Promise<VisualQaOutcome> {
  const deadline = Date.now() + QA_PHASE_BUDGET_MS;
  const log = (line: string, level: "info" | "warn" = "info") =>
    emitRunEvent(runId, { type: "log", level, line });

  try {
    if (!previewUrl) {
      log("Visual QA skipped: no ready preview", "warn");
      return { ran: false, skippedReason: "no preview", patched: false };
    }
    if (!(await exists(CHROME_BIN))) {
      log("Visual QA skipped: headless Chrome not found", "warn");
      return { ran: false, skippedReason: "chrome missing", patched: false };
    }

    const root = await workspaceRoot();
    const visualDir = path.join(root, projectId, "runs", artifactKey, "visual");
    const beforePath = path.join(visualDir, "before.png");
    const afterPath = path.join(visualDir, "after.png");

    // Warm the Metro bundle (first fetch can take seconds), then settle.
    if (!(await waitForBundle(previewUrl, deadline))) {
      log("Visual QA skipped: preview did not respond in time", "warn");
      return { ran: false, skippedReason: "bundle timeout", patched: false };
    }
    await delay(SETTLE_MS);

    if (Date.now() > deadline) {
      log("Visual QA skipped: phase budget exhausted", "warn");
      return { ran: false, skippedReason: "timeout", patched: false };
    }

    const shot1 = await captureScreenshot(previewUrl, beforePath, deadline - Date.now());
    if (!shot1) {
      log("Visual QA skipped: screenshot capture failed", "warn");
      return { ran: false, skippedReason: "capture failed", patched: false };
    }

    let before: QaResult;
    try {
      before = await analyzeScreenshot(beforePath);
    } catch (err) {
      log(`Visual QA skipped: could not analyze screenshot (${err instanceof Error ? err.message : String(err)})`, "warn");
      return { ran: false, skippedReason: "analyze failed", patched: false };
    }

    log(`Visual QA: ${before.score}/100${before.issues.length ? ` — ${before.issues.map((i) => i.detail).join("; ")}` : ""}`);

    const outcome: VisualQaOutcome = { ran: true, before, patched: false, beforePath };

    // Patch pass: only when poor AND the issue is something a deterministic
    // regenerate can plausibly address (blank/low density). An error overlay or
    // an already-good score gets no patch — honest about the ceiling.
    const fixable = before.issues.some((i) => i.code === "blank" || i.code === "low_density");
    if (before.score < QA_SCORE_THRESHOLD && fixable && Date.now() < deadline) {
      log(`Visual QA: score below ${QA_SCORE_THRESHOLD}; regenerating screens from blueprint`);
      try {
        const written = await regenerateScreens(projectId, blueprint);
        emitRunEvent(runId, { type: "log", level: "info", line: `Visual QA: regenerated ${written.length} file(s)` });
        // Re-warm the bundle so Metro serves the rewritten files, then re-shoot.
        await waitForBundle(previewUrl, deadline);
        await delay(SETTLE_MS);
        const shot2 = await captureScreenshot(previewUrl, afterPath, deadline - Date.now());
        if (shot2) {
          const after = await analyzeScreenshot(afterPath);
          outcome.after = after;
          outcome.afterPath = afterPath;
          outcome.patched = true;
          log(`Visual QA: after patch ${after.score}/100 (was ${before.score}/100)`);
        }
      } catch (err) {
        log(`Visual QA: patch pass failed (${err instanceof Error ? err.message : String(err)})`, "warn");
      }
    }

    await writeArtifacts(visualDir, runId, outcome);
    return outcome;
  } catch (err) {
    // Belt-and-braces: QA must never fail a run.
    log(`Visual QA skipped: ${err instanceof Error ? err.message : String(err)}`, "warn");
    return { ran: false, skippedReason: "error", patched: false };
  }
}

async function writeArtifacts(visualDir: string, runId: string, outcome: VisualQaOutcome): Promise<void> {
  try {
    await fs.mkdir(visualDir, { recursive: true });
    const scoreJson = {
      runId,
      ts: Date.now(),
      threshold: QA_SCORE_THRESHOLD,
      patched: outcome.patched,
      before: outcome.before ?? null,
      after: outcome.after ?? null,
    };
    await fs.writeFile(path.join(visualDir, "visual_score.json"), JSON.stringify(scoreJson, null, 2), "utf8");

    const lines: string[] = [`# Visual QA — run ${runId}`, ""];
    if (outcome.before) {
      lines.push(`**Before:** ${outcome.before.score}/100`);
      lines.push(
        `- non-background: ${(outcome.before.contentFraction * 100).toFixed(1)}% · top third: ${(outcome.before.topFraction * 100).toFixed(1)}% · bottom third: ${(outcome.before.bottomFraction * 100).toFixed(1)}%`,
      );
      if (outcome.before.issues.length) {
        lines.push(`- issues: ${outcome.before.issues.map((i) => i.detail).join("; ")}`);
      } else {
        lines.push(`- no issues detected`);
      }
    } else {
      lines.push(`Visual QA did not produce a before screenshot.`);
    }
    if (outcome.patched && outcome.after) {
      lines.push("", `**After patch (regenerated screens):** ${outcome.after.score}/100`);
      lines.push(
        `- non-background: ${(outcome.after.contentFraction * 100).toFixed(1)}% · top third: ${(outcome.after.topFraction * 100).toFixed(1)}% · bottom third: ${(outcome.after.bottomFraction * 100).toFixed(1)}%`,
      );
      const delta = outcome.after.score - (outcome.before?.score ?? 0);
      lines.push(`- delta: ${delta >= 0 ? "+" : ""}${delta}`);
    }
    lines.push("");
    await fs.writeFile(path.join(visualDir, "visual_qa_notes.md"), lines.join("\n"), "utf8");
  } catch {
    /* artifact write is best-effort */
  }
}
