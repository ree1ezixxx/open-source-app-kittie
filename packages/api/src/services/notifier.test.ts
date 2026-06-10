import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bannersEnabled,
  formatBanner,
  sendBanner,
  sendDailyDigestBanner,
  type AlertMessage,
  type ExecFileLike,
} from "./notifier.js";

const realPlatform = process.platform;

function setPlatform(value: string): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

afterEach(() => {
  setPlatform(realPlatform);
});

function makeExec(): { exec: ExecFileLike; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: ExecFileLike = async (cmd, args) => {
    calls.push({ cmd, args });
    return undefined;
  };
  return { exec, calls };
}

const enabledEnv = { ALERT_BANNERS: "1" } as NodeJS.ProcessEnv;

describe("formatBanner", () => {
  it("uses the summary verbatim when it already names the rule", () => {
    const msg: AlertMessage = {
      appTitle: "Bluesky",
      rule: "ranking jump",
      summary: "Ranking jump: #42 → #7 in Social (US)",
    };
    expect(formatBanner(msg)).toEqual({
      title: "Bluesky",
      body: "Ranking jump: #42 → #7 in Social (US)",
    });
  });

  it("weaves the rule in when the summary lacks it", () => {
    const msg: AlertMessage = {
      appTitle: "Signal",
      rule: "new release",
      summary: "v7.2 shipped with payments removed",
    };
    expect(formatBanner(msg).body).toBe("new release: v7.2 shipped with payments removed");
  });

  it("ellipsizes the body to 120 chars", () => {
    const msg: AlertMessage = {
      appTitle: "Obsidian",
      rule: "description change",
      summary: `description change: ${"x".repeat(200)}`,
    };
    const { body } = formatBanner(msg);
    expect(body).toHaveLength(120);
    expect(body.endsWith("…")).toBe(true);
    expect(body.startsWith("description change: ")).toBe(true);
  });

  it("clamps after weaving so the woven body also respects the budget", () => {
    const msg: AlertMessage = {
      appTitle: "Obsidian",
      rule: "keyword movement",
      summary: "y".repeat(115),
    };
    const { body } = formatBanner(msg);
    expect(body).toHaveLength(120);
    expect(body.startsWith("keyword movement: ")).toBe(true);
    expect(body.endsWith("…")).toBe(true);
  });
});

describe("bannersEnabled", () => {
  it("is true only with ALERT_BANNERS=1 on darwin", () => {
    setPlatform("darwin");
    expect(bannersEnabled(enabledEnv)).toBe(true);
  });

  it("is false when the setting is unset or not '1'", () => {
    setPlatform("darwin");
    expect(bannersEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(bannersEnabled({ ALERT_BANNERS: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(bannersEnabled({ ALERT_BANNERS: "true" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("is false off macOS even when the setting is on", () => {
    setPlatform("linux");
    expect(bannersEnabled(enabledEnv)).toBe(false);
  });
});

describe("sendBanner", () => {
  it("escapes double quotes and backslashes in the AppleScript", async () => {
    setPlatform("darwin");
    const { exec, calls } = makeExec();
    const msg: AlertMessage = {
      appTitle: 'App "X"',
      rule: "title change",
      summary: 'title change: now "Fast \\ Free"',
    };
    const ok = await sendBanner(msg, { exec, env: enabledEnv });
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe("osascript");
    expect(calls[0]?.args).toEqual([
      "-e",
      'display notification "title change: now \\"Fast \\\\ Free\\"" with title "App \\"X\\""',
    ]);
  });

  it("is a no-op false when banners are disabled", async () => {
    setPlatform("darwin");
    const exec = vi.fn<ExecFileLike>();
    const msg: AlertMessage = { appTitle: "A", rule: "r", summary: "s" };
    expect(await sendBanner(msg, { exec, env: {} as NodeJS.ProcessEnv })).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it("is a no-op false off macOS", async () => {
    setPlatform("linux");
    const exec = vi.fn<ExecFileLike>();
    const msg: AlertMessage = { appTitle: "A", rule: "r", summary: "s" };
    expect(await sendBanner(msg, { exec, env: enabledEnv })).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it("returns false instead of throwing when osascript fails", async () => {
    setPlatform("darwin");
    const exec: ExecFileLike = async () => {
      throw new Error("osascript exited 1");
    };
    const msg: AlertMessage = { appTitle: "A", rule: "r", summary: "s" };
    await expect(sendBanner(msg, { exec, env: enabledEnv })).resolves.toBe(false);
  });
});

describe("sendDailyDigestBanner", () => {
  it("formats the roll-up title and top line", async () => {
    setPlatform("darwin");
    const { exec, calls } = makeExec();
    const ok = await sendDailyDigestBanner(3, "Bluesky jumped to #7 in Social", {
      exec,
      env: enabledEnv,
    });
    expect(ok).toBe(true);
    expect(calls[0]?.args).toEqual([
      "-e",
      'display notification "Bluesky jumped to #7 in Social" with title "Kittie: 3 alerts today"',
    ]);
  });

  it("respects the same gating", async () => {
    setPlatform("darwin");
    const exec = vi.fn<ExecFileLike>();
    expect(await sendDailyDigestBanner(2, "top", { exec, env: {} as NodeJS.ProcessEnv })).toBe(
      false,
    );
    expect(exec).not.toHaveBeenCalled();
  });
});
