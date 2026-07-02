/**
 * bazi_basic MCP tool 輸出 regression test —— 覆蓋新增嘅 detail 分級 / includeAnalysis /
 * includeDaYun / targetYear 流年功能（見 CLAUDE.md 任務 E）。
 *
 * 策略（純 E2E，唔用 renderBaziText 直call）：
 * renderBaziDaYunSection / renderBaziLiuNianSection / renderBaziTimeCorrection 呢幾個組字函式
 * 同 structuredContent 嘅組裝邏輯全部住喺 src/index.ts 入面且冇 export；而 src/index.ts 一
 * import 就會即刻 new Server() + main() 開 server（side effect），唔可以喺 test 直接 import。
 * renderBaziText 本身雖然有 export、可以直接call，但淨係覆蓋到 detail 分級 + 分析區塊，覆蓋唔到
 * 大運/流年/structuredContent（呢三樣要嘅資料只喺 index.ts handler 入面組裝）。
 * 為免喺 test 度重寫一份 handler 嘅 options-wiring 邏輯（同真實實現漂移嘅風險），本檔一律用
 * (b) 方案：build dist/ → 用 MCP SDK 嘅 stdio client spawn 一個真實 server 子進程 → 直接
 * call bazi_basic tool，等於用家（Claude/ChatGPT）實際會收到嘅輸出，一次過覆蓋晒 8 項要求。
 *
 * 注意 Logger（src/shared/logger.ts）：console.info/console.debug 預設寫落 stdout，會同
 * stdio transport 嘅 JSON-RPC newline-delimited framing 撞埋一齊（client 嘗試 JSON.parse
 * 果幾行 log text 會 parse fail）。已用 LOG_LEVEL=error 令 child process 淨係 console.error
 * （目標係 stderr，唔會影響 stdout framing）先會輸出，從根源避免呢個問題。
 *
 * 注意 ←現行 標記嘅不確定性：大運列表入面邊一行標 ←現行 係由 currentDaYun 決定，而
 * currentDaYun 係用 `new Date().getFullYear()` 計現齡揾返所屬嘅十年運 —— 即係話呢個標記
 * 會隨實際執行嗰年漂移（同一年內執行結果穩定，但相隔幾年、甚至跨過命主下一個大運分界年
 * 之後先跑，snapshot 就會變）。呢個係已知、可接受嘅不確定性（非 bug），命主資料/四柱/
 * 大運干支列表本身、以及流年計算全部只靠固定嘅出生資料，恆定唔變。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type BaziBasicArgs = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  gender: "male" | "female";
  longitude?: number;
  detail?: "simple" | "standard" | "detailed";
  includeAnalysis?: boolean;
  includeDaYun?: boolean;
  targetYear?: number;
};

// Chart 1: 1993-06-15 17:00 男（北京時間，無經度）—— 癸酉 戊午 丁卯 己酉，日主丁
const CHART1 = { year: 1993, month: 6, day: 15, hour: 17, minute: 0, gender: "male" as const };
// Chart 2: 1990-05-15 10:30 女，經度114.17 —— 與 characterization.test.ts「普通男命-深圳經度」
// 同一時空盤（性別唔影響四柱本身，只影響大運方向/神煞；simple tier 兩者都唔顯示）
const CHART2 = { year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: "female" as const, longitude: 114.17 };

const ANALYSIS_HEADERS = [
  "=== 五行力量 ===",
  "=== 日主強弱 ===",
  "=== 格局 ===",
  "=== 用神 ===",
  "=== 十神 ===",
  "=== 神煞 ===",
  "=== 原局刑沖合害 ===",
] as const;

let client: Client;
let transport: StdioClientTransport;

async function callBaziBasic(args: BaziBasicArgs): Promise<{ text: string; structuredContent: any }> {
  const result = (await client.callTool({ name: "bazi_basic", arguments: args })) as any;
  const textBlock = (result.content ?? []).find((c: any) => c.type === "text");
  if (!textBlock) throw new Error("bazi_basic did not return a text content block");
  return { text: textBlock.text as string, structuredContent: result.structuredContent };
}

beforeAll(async () => {
  // 確保 dist/ 反映最新 src/（唔會靜默測試緊舊行為）
  execSync("npm run build", { cwd: process.cwd(), stdio: "pipe" });

  transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: { LOG_LEVEL: "error" }, // 收埋 console.info/debug，避免污染 stdout 嘅 JSON-RPC framing
    stderr: "ignore",
  });
  client = new Client({ name: "bazi-basic-output-test", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
}, 30_000);

afterAll(async () => {
  await client?.close();
});

describe("bazi_basic: detail tiers", () => {
  it("standard tier: 7 analysis headers + 大運 header + ←現行 marker present; full text snapshot", async () => {
    const { text } = await callBaziBasic({ ...CHART1, detail: "standard" });

    for (const header of ANALYSIS_HEADERS) {
      expect(text).toContain(header);
    }
    expect(text).toContain("=== 大運 ===");
    expect(text).toContain("←現行");

    expect(text).toMatchSnapshot();
  });

  it("simple tier: no analysis headers, no 大運; has 藏干; snapshot", async () => {
    const { text } = await callBaziBasic({ ...CHART2, detail: "simple" });

    for (const header of ANALYSIS_HEADERS) {
      expect(text).not.toContain(header);
    }
    expect(text).not.toContain("=== 大運 ===");
    expect(text).toContain("藏干");

    expect(text).toMatchSnapshot();
  });

  it("detailed tier: has detail-only content beyond standard; more lines than standard", async () => {
    const { text: standardText } = await callBaziBasic({ ...CHART1, detail: "standard" });
    const { text: detailedText } = await callBaziBasic({ ...CHART1, detail: "detailed" });

    // 細項： 來自日主強弱嘅 sa.details（StrengthAnalyzer 嘅 factors.detailedBreakdown，
    // 任何命盤都會有 base/月令/干支支援等細項），係 standard tier 唔會出現嘅 detailed-only 內容。
    expect(detailedText).toContain("細項：");
    expect(standardText).not.toContain("細項：");
    expect(detailedText.split("\n").length).toBeGreaterThan(standardText.split("\n").length);
  });
});

describe("bazi_basic: includeAnalysis / includeDaYun flags", () => {
  it("includeAnalysis:false strips analysis sections but keeps 大運", async () => {
    const { text } = await callBaziBasic({ ...CHART1, includeAnalysis: false });

    for (const header of ANALYSIS_HEADERS) {
      expect(text).not.toContain(header);
    }
    expect(text).toContain("=== 大運 ===");
    expect(text).toContain("←現行");
  });

  it("includeDaYun:false hides 大運 but keeps analysis sections", async () => {
    const { text } = await callBaziBasic({ ...CHART1, includeDaYun: false });

    expect(text).not.toContain("=== 大運 ===");
    for (const header of ANALYSIS_HEADERS) {
      expect(text).toContain(header);
    }
  });
});

describe("bazi_basic: targetYear (流年)", () => {
  it("targetYear:2026 on chart 1 appends 流年 block with ganzhi/tenGods/interaction", async () => {
    const { text, structuredContent } = await callBaziBasic({ ...CHART1, targetYear: 2026 });

    expect(text).toContain("=== 流年 2026 ===");
    expect(text).toContain("干支：丙午");
    expect(text).toContain("十神：干·劫財　支·比肩");
    expect(text).toContain("午午自刑");

    expect(structuredContent.liuNian.tenGods).toEqual({ stem: "劫財", branch: "比肩" });
  });

  it("detail:simple + targetYear: 流年 block still present (not gated by detail)", async () => {
    const { text } = await callBaziBasic({ ...CHART1, detail: "simple", targetYear: 2026 });

    expect(text).toContain("=== 流年 2026 ===");
    // simple tier 本身嘅限制（無分析區塊/大運）依然生效
    for (const header of ANALYSIS_HEADERS) {
      expect(text).not.toContain(header);
    }
    expect(text).not.toContain("=== 大運 ===");
  });

  it("targetYear:2027 partial trines are labeled 半合/半會, never full-trio overclaim", async () => {
    // 2027=丁未；原局只有 午（月）/卯（日），流年未 只湊夠 2/3 —— 必須標半合/半會
    const { text, structuredContent } = await callBaziBasic({ ...CHART1, targetYear: 2027 });

    expect(text).toContain("=== 流年 2027 ===");
    expect(text).toContain("十神：干·比肩　支·食神");
    expect(text).toContain("巳午未半會火局（僅見午、未）");
    expect(text).toContain("亥卯未半合木局（僅見卯、未）");
    // 唔可以出現無標示嘅完整局宣稱
    expect(text).not.toContain("巳午未三會火局（月柱）");
    expect(text).not.toContain("亥卯未三合木局（日柱）");

    // SC 帶 branches，俾下游自行判斷完整度
    const trine = structuredContent.liuNian.interactions.find((x: any) => x.type === "三合");
    expect(trine.branches).toEqual(["卯", "未"]);
    expect(trine.description).toContain("半合");
  });
});

describe("bazi_basic: structuredContent shape", () => {
  it("top-level keys calculation/analysis/metadata/warnings; hiddenStems.year for chart 1", async () => {
    const { structuredContent: sc } = await callBaziBasic({ ...CHART1 });

    expect(Object.keys(sc).sort()).toEqual(["analysis", "calculation", "metadata", "warnings"].sort());
    expect(sc.calculation.hiddenStems.year).toEqual([{ stem: "辛", isMain: true }]);
  });

  it("liuNian key appended when targetYear is set", async () => {
    const { structuredContent: sc } = await callBaziBasic({ ...CHART1, targetYear: 2026 });

    expect(Object.keys(sc).sort()).toEqual(["analysis", "calculation", "liuNian", "metadata", "warnings"].sort());
  });
});
