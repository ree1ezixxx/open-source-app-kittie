import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { strict as assert } from "node:assert";

const configHome = mkdtempSync(join(tmpdir(), "kittie-cli-"));
const env = { ...process.env, KITTIE_CONFIG_HOME: configHome };
const tsxBin = join(process.cwd(), "node_modules", ".bin", "tsx");

function run(args: string[], extraEnv: NodeJS.ProcessEnv = env) {
  return spawnSync(tsxBin, ["src/index.ts", ...args], {
    cwd: process.cwd(),
    env: extraEnv,
    encoding: "utf8",
  });
}

function expectOk(args: string[]) {
  const result = run(args);
  assert.equal(result.status, 0, `${args.join(" ")} failed\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

function runAsync(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(tsxBin, ["src/index.ts", ...args], { cwd: process.cwd(), env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function expectOkAsync(args: string[]) {
  const result = await runAsync(args);
  assert.equal(result.status, 0, `${args.join(" ")} failed\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

async function main() {
  try {
    const help = expectOk(["--help"]);
    assert.match(help, /kittie doctor/);
    assert.match(help, /kittie config show/);

    expectOk(["config", "set", "apiOrigin", "http://127.0.0.1:45454/"]);
    const config = JSON.parse(expectOk(["config", "show", "--json"])) as { apiOrigin: string; source: string };
    assert.equal(config.apiOrigin, "http://127.0.0.1:45454");
    assert.equal(config.source, "file");

    const server = createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const doctor = JSON.parse(await expectOkAsync(["doctor", "--api-origin", origin, "--json"])) as {
      ok: boolean;
      status: number;
    };
    assert.equal(doctor.ok, true);
    assert.equal(doctor.status, 200);
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  } finally {
    rmSync(configHome, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
