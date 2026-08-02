/**
 * Streamable HTTP（stateless）transport 層 regression test。
 *
 * 策略同 bazi-basic-output.test.ts 一致：build dist/ → spawn 一個真實 server 子進程（--http）
 * → 用 fetch 直接打 HTTP，等於 browser / connector 實際會經歷嘅路徑。HTTP handler 住喺
 * src/index.ts 入面且冇 export，import 就會有 side effect，所以唔可以喺 test 直接 call。
 *
 * 覆蓋兩件事：
 * 1. CORS preflight —— 舊版 `/mcp` 除 POST 外一律 405，令 browser 端 client（connector 設定／
 *    驗證頁）嘅 OPTIONS preflight 失敗，結果連 POST 都發唔出，表現為「access 唔到」。
 * 2. DELETE 仍然要被擋 —— stateless 下 validateSession 一律 true，單個 DELETE 會觸發
 *    transport.close() 永久廢掉共享 transport（server 變死但 /healthz 仍回 200）。呢個係
 *    v0.1.5 修過嘅真 bug，補 CORS 時唔可以放鬆返。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

const INITIALIZE_BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "http-transport-test", version: "1.0.0" },
  },
});

let child: ChildProcess;
let baseUrl: string;

/** 問 OS 攞一個空閒 port（開完即閂，再交畀 server 用）。 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** 輪詢 /healthz 直至 server 起身（最多 ~10 秒）。 */
async function waitForReady(url: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return;
    } catch {
      // server 未 listen，繼續等
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("HTTP server 喺 10 秒內未起身");
}

beforeAll(async () => {
  execSync("npm run build", { stdio: "pipe" });
  const port = await findFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn("node", ["dist/index.js", "--http"], {
    env: { ...process.env, PORT: String(port), LOG_LEVEL: "error" },
    stdio: "pipe",
  });
  await waitForReady(baseUrl);
}, 60_000);

afterAll(() => {
  child?.kill();
});

describe("CORS", () => {
  it("OPTIONS preflight 回 204 並帶齊 CORS header", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://chatgpt.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, accept",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");

    const allowMethods = res.headers.get("access-control-allow-methods") ?? "";
    expect(allowMethods).toContain("POST");
    expect(allowMethods).toContain("OPTIONS");

    // preflight 帶嘅 request header 全部要獲准，否則 browser 照樣攔住個 POST
    const allowHeaders = (res.headers.get("access-control-allow-headers") ?? "").toLowerCase();
    for (const header of ["content-type", "accept", "mcp-protocol-version", "mcp-session-id"]) {
      expect(allowHeaders).toContain(header);
    }
  });

  it("POST 回應都要帶 Allow-Origin，否則 browser 讀唔到 body", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Origin: "https://chatgpt.com" },
      body: INITIALIZE_BODY,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect((await res.json() as any).result.serverInfo.name).toBe("mingpan");
  });
});

describe("非 POST method", () => {
  it("GET 回 405（stateless 下唔提供 standalone SSE stream）", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
    });

    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toContain("POST");
  });

  it("DELETE 回 405 且唔會殺死共享 transport", async () => {
    const deleteRes = await fetch(`${baseUrl}/mcp`, { method: "DELETE" });
    expect(deleteRes.status).toBe(405);

    // 關鍵回歸點：DELETE 之後 server 必須仍然食得 JSON-RPC
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });

    expect(res.status).toBe(200);
    expect((await res.json() as any).result.tools.length).toBeGreaterThan(0);
  });
});
