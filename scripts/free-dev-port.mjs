/**
 * Frees the Vite dev port (default 3000) when it is already in use.
 * Windows: taskkill PIDs from netstat. Unix: lsof + kill.
 */
import { execFileSync } from "node:child_process";
import net from "node:net";

const PORT = Number(process.env.VITE_DEV_PORT ?? process.env.PORT ?? 3000);

function portIsFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => {
      s.close(() => resolve(true));
    });
    s.listen(port, "127.0.0.1");
  });
}

function killWindowsListeners(port) {
  try {
    const out = execFileSync(
      "cmd",
      ["/c", `netstat -ano | findstr :${port}`],
      { encoding: "utf8" },
    );
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (/^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execFileSync("taskkill", ["/PID", pid, "/F"], { stdio: "inherit" });
        console.warn(`[free-dev-port] freed port ${port} (stopped PID ${pid})`);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* no listeners or netstat failed */
  }
}

function killUnixListeners(port) {
  try {
    const raw = execFileSync("sh", [
      "-c",
      `lsof -ti:${port} 2>/dev/null || true`,
    ])
      .toString()
      .trim();
    const pids = raw.split(/\s+/).filter(Boolean);
    for (const pid of pids) {
      try {
        execFileSync("kill", ["-9", pid], { stdio: "ignore" });
        console.warn(`[free-dev-port] freed port ${port} (stopped PID ${pid})`);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

async function main() {
  if (await portIsFree(PORT)) {
    return;
  }
  console.warn(`[free-dev-port] Port ${PORT} is busy; stopping listeners…`);
  if (process.platform === "win32") {
    killWindowsListeners(PORT);
  } else {
    killUnixListeners(PORT);
  }
}

await main();
