#!/usr/bin/env node
/**
 * Mingpan MCP Server
 *
 * MCP service for accurate BaZi (八字) and ZiWei (紫微) chart calculations.
 * Takes birth date/time and outputs structured fortune-telling information.
 *
 * Version 1.1.0: Added fortune list tools for DaYun, LiuNian, LiuYue, LiuRi
 * - 八字流月 uses 干支月 (solar term months)
 * - 紫微流月 uses 农历月 (lunar months)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "node:http";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Lunar, Solar } from "lunar-javascript";

import { BEIJING_TZ, assertValidSolarDate, normalizeBirthDateTime } from "./utils/timeNormalization";
import { coercedBoolean, numifyNumericStrings, sanitizeToolArgs } from "./utils/coerce";
import { TrueSolarTime } from "./core/bazi/TrueSolarTime";
import { BaziService } from "./services/bazi/BaziService";
import { ZiweiService } from "./services/ziwei/ZiweiService";
import { LiuyaoService } from "./services/liuyao/LiuyaoService";
import { renderLiuyaoText } from "./output/liuyaoTextRenderer";
import { MeihuaService } from "./services/meihua/MeihuaService";
import { renderMeihuaText } from "./output/meihuaTextRenderer";
import { DaliurenService } from "./services/daliuren/DaliurenService";
import { renderDaliurenText } from "./output/daliurenTextRenderer";
import { QimenService } from "./services/qimen/QimenService";
import { renderQimenText } from "./output/qimenTextRenderer";
import { LiuNianCalculator } from "./services/bazi/calculators/LiuNianCalculator";
import { DaYunCalculator } from "./services/bazi/calculators/DaYunCalculator";
import { LuckCycleCalculator } from "./services/bazi/calculators/LuckCycleCalculator";
import { LiuYueCalculator } from "./services/bazi/calculators/LiuYueCalculator";
import { LiuRiCalculator } from "./services/bazi/calculators/LiuRiCalculator";
import { YearlyCalculator } from "./services/ziwei/calculators/YearlyCalculator";
import { renderBaziText, renderZiweiText, FortuneTextOptions } from "./output/fortuneTextRenderer";
import { mapBaziToManifestation } from "./services/bazi/ManifestationMapper";
import { renderManifestationText } from "./output/manifestationTextRenderer";
import {
  renderBaziDaYunList,
  renderBaziLiuNianList,
  renderBaziLiuYueList,
  renderBaziLiuRiList,
  renderZiweiDaXianList,
  renderZiweiXiaoXianList,
  renderZiweiLiuNianList,
  renderZiweiLiuYueList,
  renderZiweiLiuRiList,
  BaziListOptions,
  ZiweiListOptions,
  ZiweiDailyInfo
} from "./output/listTextRenderer";
import { Logger } from "./shared/logger";
import { PALACE_NAMES } from "./services/ziwei/types";
import { MutagenCore } from "./core/ziwei/MutagenCore";

const logger = new Logger("mingpan");

// ============================================
// Timezone Configuration
// ============================================
// Force deterministic timezone behavior (Beijing Time) across environments.
// This ensures lunar-javascript and Date operations behave consistently
// regardless of the host machine's timezone setting.
// TODO: Remove when multi-timezone support is implemented (M4 milestone)
process.env.TZ = BEIJING_TZ;

// Helper to avoid TypeScript's excessively deep type instantiation error
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function schemaToJson(schema: any): Record<string, unknown> {
  return zodToJsonSchema(schema) as Record<string, unknown>;
}

// ============================================
// Zod Schemas for Tool Inputs
// ============================================

// isLunar field schema (reusable)
const isLunarField = coercedBoolean().optional().default(false).describe(
  "Whether the input date is in lunar calendar (農曆). If true, will be converted to solar calendar internally."
);

// 真太陽時 / 時區進階參數（八字系列共用；全部可選，缺省 = 北京時間 UTC+8）
const tstFields = {
  timezone: z.coerce.number().min(-14).max(14).optional().describe(
    "出生鐘錶所屬標準時區的 UTC 偏移（小時），如中國為 8、美東標準時為 -5。預設 8（北京時間）"
  ),
  dstOffset: z.coerce.number().min(-2).max(2).optional().describe(
    "夏令時偏移（小時），夏令時撥快一小時填 1。中國 1986–1991 夏令時會自動偵測，無需手填"
  ),
  timezoneId: z.string().optional().describe(
    "IANA 時區標識（如 'Asia/Shanghai'、'America/New_York'），提供時自動處理該區夏令時"
  ),
  dayBoundaryMode: z.enum(["MIDNIGHT_00", "ZI_HOUR_23"]).optional().describe(
    "子時換日流派：MIDNIGHT_00（預設，子時不換日，晚子時屬當日）、ZI_HOUR_23（23:00 即換日，晚子時屬次日）"
  ),
};

// Base birth info schema
const BaseBirthInfoSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100).describe("Birth year (e.g., 1990)"),
  month: z.coerce.number().int().min(1).max(12).describe("Birth month (1-12)"),
  day: z.coerce.number().int().min(1).max(31).describe("Birth day (1-31)"),
  hour: z.coerce.number().int().min(0).max(23).describe("Birth hour in 24-hour format (0-23)"),
  minute: z.coerce.number().int().min(0).max(59).optional().default(0).describe("Birth minute (0-59)"),
  gender: z.enum(["male", "female"]).describe("Gender for fortune direction calculation"),
  longitude: z.coerce.number().min(-180).max(180).optional().describe("Birth location longitude for true solar time adjustment"),
  ...tstFields,
  isLunar: isLunarField,
  name: z.string().optional().describe("Subject name (optional)"),
});

/**
 * Normalize birth info: handle lunar-to-solar conversion
 * Call this at the start of each handler to get consistent, normalized values
 */
function normalizeBirthInfo<T extends {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  isLunar?: boolean;
}>(input: T): T & { _isLunarInput: boolean } {
  const normalized = normalizeBirthDateTime({
    year: input.year,
    month: input.month,
    day: input.day,
    hour: input.hour,
    minute: input.minute,
    isLunar: input.isLunar,
  });
  
  return {
    ...input,
    year: normalized.year,
    month: normalized.month,
    day: normalized.day,
    hour: normalized.hour,
    minute: normalized.minute,
    isLunar: false,  // After normalization, always use solar calendar
    _isLunarInput: normalized.isLunarInput,
  };
}

/**
 * 渲染真太陽時 / 時間校正明細區塊（供八字 tool 輸出，提升透明度與可審計性）。
 * 僅在有實際校正或有提示時顯示，避免對單純北京時間命盤造成輸出噪音。
 */
function renderBaziTimeCorrection(result: {
  birthInfo?: { solarTimeInfo?: import("./services/bazi/types").SolarTimeInfo; warnings?: string[] };
}): string {
  const s = result.birthInfo?.solarTimeInfo;
  const warnings = result.birthInfo?.warnings;
  if (!s || (!s.applied && !(warnings && warnings.length))) return "";

  const sign = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));
  const modeText = s.dayBoundaryMode === "ZI_HOUR_23"
    ? "ZI_HOUR_23（23:00 換日，晚子時屬次日）"
    : "MIDNIGHT_00（子時不換日，晚子時屬當日）";
  const lines: string[] = ["", "=== 真太陽時校正 ==="];
  lines.push(`時區依據：${s.timezoneBasis}（標準經線 ${s.standardMeridian}°）`);
  if (s.longitudeCorrectionMinutes !== 0) lines.push(`經度修正：${sign(s.longitudeCorrectionMinutes)} 分`);
  if (s.equationOfTimeMinutes !== 0) lines.push(`均時差：${sign(s.equationOfTimeMinutes)} 分`);
  if (s.dstOffsetMinutes !== 0) lines.push(`夏令時扣減：${s.dstOffsetMinutes} 分`);
  lines.push(`總修正：${sign(s.totalCorrectionMinutes)} 分`);
  lines.push(`子時流派：${modeText}`);
  if (warnings && warnings.length) {
    for (const w of warnings) lines.push(`⚠️ ${w}`);
  }
  return lines.join("\n");
}

const BaziCalculateSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100).describe("Birth year (e.g., 1990)"),
  month: z.coerce.number().int().min(1).max(12).describe("Birth month (1-12)"),
  day: z.coerce.number().int().min(1).max(31).describe("Birth day (1-31)"),
  hour: z.coerce.number().int().min(0).max(23).describe("Birth hour in 24-hour format (0-23)"),
  minute: z.coerce.number().int().min(0).max(59).optional().default(0).describe("Birth minute (0-59)"),
  gender: z.enum(["male", "female"]).optional().default("male").describe("Gender for DaYun calculation direction"),
  longitude: z.coerce.number().min(-180).max(180).optional().describe("Birth location longitude for true solar time adjustment"),
  ...tstFields,
  isLunar: isLunarField,
  detail: z.enum(["simple", "standard", "detailed"]).optional().default("standard").describe("Output detail level"),
  includeAnalysis: coercedBoolean().optional().default(true).describe("Include strength and pattern analysis"),
  includeDaYun: coercedBoolean().optional().default(true).describe("Include decade fortune (大運)"),
  targetYear: z.coerce.number().int().optional().describe("Calculate LiuNian (流年) for this specific year"),
});

// 八字顯化指引 Schema
const BaziManifestationSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100).describe("出生年份（公曆，1900-2100）"),
  month: z.coerce.number().int().min(1).max(12).describe("出生月份（1-12）"),
  day: z.coerce.number().int().min(1).max(31).describe("出生日期（1-31）"),
  hour: z.coerce.number().int().min(0).max(23).describe("出生時辰（0-23，24小時制）"),
  minute: z.coerce.number().int().min(0).max(59).optional().default(0).describe("出生分鐘（0-59）"),
  gender: z.enum(["male", "female"]).optional().default("male").describe("性別（影響大運方向）"),
  longitude: z.coerce.number().min(-180).max(180).optional().describe("出生地經度（用於真太陽時校正，可選）"),
  ...tstFields,
  isLunar: isLunarField,
  targetYear: z.coerce.number().int().min(1900).max(2100).optional().describe("指定分析的流年年份（可選，預設為當前年份）"),
});

const ZiweiCalculateSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100).describe("Birth year (e.g., 1990)"),
  month: z.coerce.number().int().min(1).max(12).describe("Birth month (1-12)"),
  day: z.coerce.number().int().min(1).max(31).describe("Birth day (1-31)"),
  hour: z.coerce.number().int().min(0).max(23).describe("Birth hour in 24-hour format (0-23)"),
  minute: z.coerce.number().int().min(0).max(59).optional().default(0).describe("Birth minute (0-59)"),
  gender: z.enum(["male", "female"]).describe("Gender (required for ZiWei calculation)"),
  isLunar: isLunarField,
  detail: z.enum(["simple", "standard", "detailed"]).optional().default("standard").describe("Output detail level"),
  targetYear: z.coerce.number().int().optional().describe("Calculate yearly fortune for this specific year"),
  includeDecades: coercedBoolean().optional().default(true).describe("Include decade fortune (大限)"),
  includeMutagen: coercedBoolean().optional().default(true).describe("Include four mutagens (四化)"),
});

const CombinedCalculateSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100).describe("Birth year (e.g., 1990)"),
  month: z.coerce.number().int().min(1).max(12).describe("Birth month (1-12)"),
  day: z.coerce.number().int().min(1).max(31).describe("Birth day (1-31)"),
  hour: z.coerce.number().int().min(0).max(23).describe("Birth hour in 24-hour format (0-23)"),
  minute: z.coerce.number().int().min(0).max(59).optional().default(0).describe("Birth minute (0-59)"),
  gender: z.enum(["male", "female"]).describe("Gender (required for both calculations)"),
  longitude: z.coerce.number().min(-180).max(180).optional().describe("Birth location longitude for true solar time adjustment"),
  ...tstFields,
  isLunar: isLunarField,
  detail: z.enum(["simple", "standard", "detailed"]).optional().default("standard").describe("Output detail level"),
  targetYear: z.coerce.number().int().optional().describe("Calculate yearly fortune for this specific year"),
  systems: z.array(z.enum(["bazi", "ziwei"])).optional().default(["bazi", "ziwei"]).describe("Which systems to calculate"),
});

// ============================================
// 真太陽時 Schema
// ============================================

const TrueSolarTimeSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100).describe("年份（公曆，1900-2100）"),
  month: z.coerce.number().int().min(1).max(12).describe("月份（1-12）"),
  day: z.coerce.number().int().min(1).max(31).describe("日期（1-31）"),
  hour: z.coerce.number().int().min(0).max(23).describe("時（0-23，24小時制）"),
  minute: z.coerce.number().int().min(0).max(59).optional().default(0).describe("分（0-59）"),
  longitude: z.coerce.number().min(-180).max(180).describe("出生地經度（必填，東經為正、西經為負）"),
  timezone: z.coerce.number().min(-14).max(14).optional().describe("標準時區 UTC 偏移（小時），預設 8（北京）"),
  dstOffset: z.coerce.number().min(-2).max(2).optional().describe("夏令時偏移（小時）。中國 1986–1991 會自動偵測"),
  timezoneId: z.string().optional().describe("IANA 時區標識（如 'Asia/Shanghai'、'America/New_York'）"),
});

// ============================================
// 八字反查 Schema
// ============================================

const ReverseBaziSchema = z.object({
  bazi: z.string().describe("四柱干支，以空格分隔，例如：戊寅 己未 己卯 辛未"),
  startYear: z.coerce.number().int().min(1900).max(2100).optional().default(1940).describe("反查起始年（公曆），預設 1940"),
  endYear: z.coerce.number().int().min(1900).max(2100).optional().describe("反查結束年（公曆），預設當前年"),
  dayBoundaryMode: z.enum(["MIDNIGHT_00", "ZI_HOUR_23"]).optional().default("MIDNIGHT_00").describe("子時換日流派，需與目標八字一致"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20).describe("最多返回幾個候選時間，預設 20"),
});

// ============================================
// 六爻 Schema
// ============================================

const LiuyaoBasicSchema = z.object({
  // 注意：用 z.array(...).length(6) 而非 z.tuple，令 zodToJsonSchema 產出單一 items schema，
  // ChatGPT/OpenAI 的工具 schema 不接受 tuple-form items（prefixItems）。runtime 等效。
  yaoValues: z.array(
    // numify：literal union 冇 coerce，Claude web 等 client 會傳 "6" 字串
    z.preprocess(numifyNumericStrings, z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9)]))
  ).length(6).describe("六個爻值（自下而上，初爻到上爻）。6=老陰(動), 7=少陽(靜), 8=少陰(靜), 9=老陽(動)"),
  year: z.coerce.number().int().min(1900).max(2100).describe("起卦年份（公曆）"),
  month: z.coerce.number().int().min(1).max(12).describe("起卦月份（1-12）"),
  day: z.coerce.number().int().min(1).max(31).describe("起卦日期（1-31）"),
  hour: z.coerce.number().int().min(0).max(23).describe("起卦時辰（0-23）"),
  isLunar: isLunarField,
});

// ============================================
// 梅花易數 Schema
// ============================================

const MeihuaBasicSchema = z.object({
  method: z.enum(['time', 'number']).describe("起卦方式：time=時間起卦，number=數字起卦"),
  // time 模式參數
  year: z.coerce.number().int().min(1900).max(2100).optional().describe("起卦年份（公曆，time 模式必填）"),
  month: z.coerce.number().int().min(1).max(12).optional().describe("起卦月份（1-12，time 模式必填）"),
  day: z.coerce.number().int().min(1).max(31).optional().describe("起卦日期（1-31，time 模式必填）"),
  hour: z.coerce.number().int().min(0).max(23).optional().describe("起卦時辰（0-23，time 模式必填）"),
  isLunar: isLunarField,
  // number 模式參數
  upperNumber: z.coerce.number().int().min(1).optional().describe("上卦數（number 模式必填）"),
  lowerNumber: z.coerce.number().int().min(1).optional().describe("下卦數（number 模式必填）"),
  yaoNumber: z.coerce.number().int().min(1).optional().describe("動爻數（可選，默認用上下卦數之和）"),
});

// ============================================
// 大六壬 Schema
// ============================================

const DaliurenBasicSchema = z.object({
  jieqi: z.string().describe("節氣（如：立春、雨水、驚蟄等）"),
  lunarMonth: z.coerce.number().int().min(1).max(12).describe("農曆月份（1-12）"),
  dayGanZhi: z.string().describe("日干支（如：甲子、乙丑等）"),
  hourGanZhi: z.string().describe("時干支（如：甲子、乙丑等）"),
  guirenMethod: z.preprocess(numifyNumericStrings, z.union([z.literal(0), z.literal(1)])).optional().default(0).describe("貴人起法：0=標準, 1=另一種"),
});

// ============================================
// 奇門遁甲 Schema
// ============================================

const QimenBasicSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100).describe("年份（公曆，1900-2100）"),
  month: z.coerce.number().int().min(1).max(12).describe("月份（1-12）"),
  day: z.coerce.number().int().min(1).max(31).describe("日期（1-31）"),
  hour: z.coerce.number().int().min(0).max(23).describe("時辰（0-23，24小時制）"),
  minute: z.coerce.number().int().min(0).max(59).optional().default(0).describe("分鐘（0-59）"),
  isLunar: isLunarField,
  panType: z.enum(['时盘', '日盘', '月盘', '年盘']).optional().default('时盘').describe("盤類型：时盘（默認）、日盘、月盘、年盘"),
  panStyle: z.enum(['转盘', '飞盘']).optional().default('转盘').describe("盤式：转盘（默認，遵循《神奇之門》）或飞盘"),
  zhiRunMethod: z.enum(['chaibu', 'maoshan']).optional().default('chaibu').describe("置閏方法：chaibu=拆補法（默認），maoshan=茅山法"),
});

// 奇门用神分析
const QimenYongShenSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100).describe("年份（公曆，1900-2100）"),
  month: z.coerce.number().int().min(1).max(12).describe("月份（1-12）"),
  day: z.coerce.number().int().min(1).max(31).describe("日期（1-31）"),
  hour: z.coerce.number().int().min(0).max(23).describe("時辰（0-23，24小時制）"),
  minute: z.coerce.number().int().min(0).max(59).optional().default(0).describe("分鐘（0-59）"),
  isLunar: isLunarField,
  panType: z.enum(['时盘', '日盘', '月盘', '年盘']).optional().default('时盘').describe("盤類型：时盘（默認）、日盘、月盘、年盘"),
  panStyle: z.enum(['转盘', '飞盘']).optional().default('转盘').describe("盤式：转盘（默認）或飞盘"),
  zhiRunMethod: z.enum(['chaibu', 'maoshan']).optional().default('chaibu').describe("置閏方法"),
  shiLei: z.enum([
    '求财', '婚姻', '疾病', '出行', '诉讼', '考试', '工作',
    '失物', '置业', '求官', '孕产', '寻人', '合作', '其他'
  ]).describe("事類（用於確定用神）"),
  nianGan: z.enum(['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']).optional().describe("年干（用於年命分析，可選）"),
  includeShenSha: coercedBoolean().optional().default(true).describe("是否包含神煞分析"),
});

// 奇门择日
const QimenZeRiSchema = z.object({
  startYear: z.coerce.number().int().min(1900).max(2100).describe("起始年份"),
  startMonth: z.coerce.number().int().min(1).max(12).describe("起始月份"),
  startDay: z.coerce.number().int().min(1).max(31).describe("起始日期"),
  endYear: z.coerce.number().int().min(1900).max(2100).describe("結束年份"),
  endMonth: z.coerce.number().int().min(1).max(12).describe("結束月份"),
  endDay: z.coerce.number().int().min(1).max(31).describe("結束日期"),
  shiLei: z.enum([
    '求财', '婚姻', '疾病', '出行', '诉讼', '考试', '工作',
    '失物', '置业', '求官', '孕产', '寻人', '合作', '其他'
  ]).describe("事類"),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10).describe("返回數量限制（默認10）"),
  minScore: z.coerce.number().int().min(0).max(100).optional().default(60).describe("最小評分閾值（0-100，默認60）"),
  includeDirection: coercedBoolean().optional().default(false).describe("是否輸出方位信息"),
  excludeJieQiDay: coercedBoolean().optional().default(false).describe("是否排除節氣交接日"),
  excludeSuiPo: coercedBoolean().optional().default(false).describe("是否排除歲破日"),
  excludeYuePo: coercedBoolean().optional().default(false).describe("是否排除月破日"),
  panType: z.enum(['时盘', '日盘', '月盘', '年盘']).optional().default('时盘').describe("盤類型"),
  panStyle: z.enum(['转盘', '飞盘']).optional().default('转盘').describe("盤式"),
  zhiRunMethod: z.enum(['chaibu', 'maoshan']).optional().default('chaibu').describe("置閏方法"),
});

// ============================================
// List Tool Schemas
// ============================================

// 八字大运列表
const BaziDaYunListSchema = BaseBirthInfoSchema.extend({
  count: z.coerce.number().int().min(1).max(12).optional().default(10).describe("Number of DaYun periods to display (default 10)"),
});

// 八字流年列表
const BaziLiuNianListSchema = BaseBirthInfoSchema.extend({
  startYear: z.coerce.number().int().min(1900).max(2100).describe("Start year for the range"),
  endYear: z.coerce.number().int().min(1900).max(2100).describe("End year for the range"),
});

// 八字流月列表（干支月/节气月）
const BaziLiuYueListSchema = BaseBirthInfoSchema.extend({
  ganzhiYear: z.union([
    z.string().describe("GanZhi year like '乙巳'"),
    z.coerce.number().int().min(1900).max(2100).describe("Gregorian year like 2025")
  ]).describe("The year to query (either GanZhi string or Gregorian year)"),
});

// 八字流日列表
const BaziLiuRiListSchema = BaseBirthInfoSchema.extend({
  ganzhiYear: z.union([
    z.string().describe("GanZhi year like '乙巳'"),
    z.coerce.number().int().min(1900).max(2100).describe("Gregorian year like 2025")
  ]).describe("The year of the month"),
  ganzhiMonth: z.union([
    z.string().describe("GanZhi month like '丙寅' (month 1 = 寅月)"),
    z.coerce.number().int().min(1).max(12).describe("Month number (1=寅月, 2=卯月, ..., 12=丑月)")
  ]).describe("The month to query (either GanZhi string or month number 1-12)"),
});

// 紫微大限列表
const ZiweiDaXianListSchema = BaseBirthInfoSchema.extend({
  count: z.coerce.number().int().min(1).max(12).optional().default(10).describe("Number of decade periods to display (default 10)"),
});

// 紫微小限列表
const ZiweiXiaoXianListSchema = BaseBirthInfoSchema.extend({
  startAge: z.coerce.number().int().min(1).max(120).describe("Start age (nominal age) for the range"),
  endAge: z.coerce.number().int().min(1).max(120).describe("End age (nominal age) for the range"),
});

// 紫微流年列表
const ZiweiLiuNianListSchema = BaseBirthInfoSchema.extend({
  startYear: z.coerce.number().int().min(1900).max(2100).describe("Start year for the range"),
  endYear: z.coerce.number().int().min(1900).max(2100).describe("End year for the range"),
});

// 紫微流月列表（农历月）
const ZiweiLiuYueListSchema = BaseBirthInfoSchema.extend({
  lunarYear: z.coerce.number().int().min(1900).max(2100).describe("The lunar year (Gregorian year) to query"),
});

// 紫微流日列表（农历日）
const ZiweiLiuRiListSchema = BaseBirthInfoSchema.extend({
  lunarYear: z.coerce.number().int().min(1900).max(2100).describe("The lunar year (Gregorian year)"),
  lunarMonth: z.coerce.number().int().min(-12).max(12).describe("Lunar month (1-12, use negative for leap month, e.g. -6 for leap 6th month)"),
});

// ============================================
// Create Server
// ============================================

const SERVER_VERSION = "0.1.8";

/** 四捨五入至 2 位小數，消除浮點雜訊（供 structuredContent 數值欄位） */
const round2 = (n: number): number => Math.round(n * 100) / 100;

// 所有命理/占卜 tool 皆為確定性、唯讀計算（不改外部狀態、可重複、不訪問開放世界）。
const READONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const server = new Server(
  {
    name: "mingpan",
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
    instructions: [
      "命盤（Mingpan）提供確定性的中華術數排盤與占卜計算（八字、紫微、奇門、六爻、梅花、大六壬）。",
      "請一律使用本服務的工具計算，切勿用語言模型自行推算干支、四柱、節氣、農曆轉換或排盤。",
      "八字精算需要出生地經度與時區：若涉及海外或夏令時，請向使用者索取 longitude 與 timezone/timezoneId。",
      "工具回傳的 structuredContent 與校正 metadata（真太陽時、子時流派、時區依據）為權威來源，請勿覆寫或重算。",
    ].join("\n"),
  }
);

// ============================================
// Tool Definitions
// ============================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = [
      {
        name: "bazi_basic",
        description: `计算八字命盘（基础排盘）。

输入出生时间，返回完整的八字命盘信息：
- 四柱（年柱、月柱、日柱、时柱）干支
- 各柱藏干
- 十神配置
- 五行力量分析（360分制）
- 日主强弱判定
- 格局识别
- 神煞标注

输出为结构化文本，便于 AI 分析解读。`,
        inputSchema: schemaToJson(BaziCalculateSchema),
      },
      {
        name: "ziwei_basic",
        description: `计算紫微斗数命盘（基础排盘）。

输入出生时间，返回完整的紫微命盘信息：
- 十二宫位排布及干支
- 各宫主星及亮度（庙/旺/得/利/平/不/陷）
- 各宫辅星配置
- 命宫与身宫位置
- 本命四化（化禄/权/科/忌）

输出为结构化文本，便于 AI 分析解读。`,
        inputSchema: schemaToJson(ZiweiCalculateSchema),
      },
      {
        name: "bazi_dayun",
        description: `八字大运列表。

返回命主一生的大运周期（十年一运）：
- 大运干支
- 起止虚岁
- 对应公历年份
- 起运方向（顺行/逆行）
- 起运年龄

用于了解人生各阶段的运势大框架。`,
        inputSchema: schemaToJson(BaziDaYunListSchema),
      },
      {
        name: "bazi_liunian",
        description: `八字流年列表。

返回指定年份范围内的流年信息：
- 公历年份
- 干支年
- 虚岁
- 所属大运

用于分析多年运势趋势。`,
        inputSchema: schemaToJson(BaziLiuNianListSchema),
      },
      {
        name: "bazi_liuyue",
        description: `八字流月列表。

重要：八字流月使用【节气月】，非农历月！
- 以节气为边界（立春起算）
- 寅月（正月）从立春开始，约2月4日
- 丑月（腊月）跨越公历年界

返回指定年份的12个月运势：
- 干支月
- 节气起止
- 公历日期范围

用于规划年度活动时机。`,
        inputSchema: schemaToJson(BaziLiuYueListSchema),
      },
      {
        name: "bazi_liuri",
        description: `八字流日列表。

返回指定月份内的每日运势（含上下文）：
- 当前大运、流年、流月资讯
- 公历日期
- 干支日

用于精细的日期选择。`,
        inputSchema: schemaToJson(BaziLiuRiListSchema),
      },
      {
        name: "bazi_manifestation",
        description: `八字顯化指引（manifestation）。

基於八字命盤的喜用神、十神、強弱、大運與流年，產出實用、非命定的個人成長指引：
- 核心顯化方向（順應用神的能量）
- 事業 / 財富 / 關係 / 健康 四大顯化主題（各含宜／忌）
- 當前大運與流年主題、時機
- 今日行動、日誌提問、肯定語

定位為自我覺察與行動規劃的反思工具，並非吉凶預測。輸出為書面繁體結構化文本。`,
        inputSchema: schemaToJson(BaziManifestationSchema),
      },
      {
        name: "bazi_true_solar_time",
        description: `真太陽時換算（八字精準排盤的時間基礎）。

由出生鐘錶時間 + 經度 + 時區，計算真太陽時：
- 經度修正（每度 4 分鐘，相對標準經線）
- 均時差（Jean Meeus 高精度公式）
- 夏令時扣減（中國 1986–1991 自動偵測；其他地區可傳 timezoneId 或 dstOffset）

用於解釋「為何時柱與鐘錶時間不同」，或在排盤前先確認時辰是否臨界換柱。`,
        inputSchema: schemaToJson(TrueSolarTimeSchema),
      },
      {
        name: "bazi_reverse",
        description: `八字反查（由四柱反推可能的公曆出生時間）。

當只有一張命盤（或截圖）而不知出生日期時，暴力搜尋所有產生該四柱的公曆時間：
- 輸入四柱干支字串（空格分隔），如「戊寅 己未 己卯 辛未」
- 可指定搜尋年份範圍與子時流派
- 返回候選的公曆年月日時

注意：反查使用鐘錶時間排盤（不含真太陽時校正）。確定候選後，建議再用 bazi_basic 補經度/時區精算。`,
        inputSchema: schemaToJson(ReverseBaziSchema),
      },

      {
        name: "ziwei_daxian",
        description: `紫微大限列表。

返回命主一生的大限周期（十年一限）：
- 起止虚岁
- 对应公历年份
- 大限宫位名称
- 宫内主星配置
- 大限四化

用于了解人生各阶段的运势大框架。`,
        inputSchema: schemaToJson(ZiweiDaXianListSchema),
      },
      {
        name: "ziwei_xiaoxian",
        description: `紫微小限列表。

小限是紫微斗数中的年度运限单位，每年一宫：
- 虚岁（1岁起）
- 对应公历年份
- 小限宫位（根据出生年支起宫，男顺女逆）
- 宫内主星
- 所属大限
- 小限四化

小限与流年并列但计算方式不同：
- 小限：以出生年支定起宫，逐年移宫
- 流年：以该年地支定宫位

层级顺序：大限 > 小限 > 流年 > 流月 > 流日`,
        inputSchema: schemaToJson(ZiweiXiaoXianListSchema),
      },
      {
        name: "ziwei_liunian",
        description: `紫微流年列表。

返回指定年份范围内的流年信息：
- 公历年份
- 干支年
- 虚岁
- 流年宫位
- 宫内主星
- 所属大限
- 流年四化

用于分析多年运势趋势。`,
        inputSchema: schemaToJson(ZiweiLiuNianListSchema),
      },
      {
        name: "ziwei_liuyue",
        description: `紫微流月列表。

重要：紫微流月使用【农历月】，非节气月！
- 以农历初一为边界
- 正月从春节开始
- 闰月单独显示（如"闰六月"）

返回指定年份的流月运势（含上下文）：
- 当前大限、小限、流年资讯
- 农历月份及公历日期范围
- 流月宫位及宫内主星
- 完整四化系统（本命/大限/小限/流年/流月）

用于规划年度活动时机。`,
        inputSchema: schemaToJson(ZiweiLiuYueListSchema),
      },
      {
        name: "ziwei_liuri",
        description: `紫微流日列表。

返回指定农历月内的每日运势（含上下文）：
- 当前大限、小限、流年、流月资讯
- 农历日期与公历日期对照
- 干支日及流日宫位
- 完整四化系统（本命/大限/小限/流年/流月/流日）

闰月使用负数表示（如 -6 表示闰六月）。

用于精细的日期选择。`,
        inputSchema: schemaToJson(ZiweiLiuRiListSchema),
      },
      {
        name: "liuyao_basic",
        description: `六爻排盤（基礎排盤）。

輸入六個爻值和起卦時間，返回完整的六爻盤面：
- 本卦/變卦（含卦名、卦宮、五行）
- 六爻納甲（每爻地支及五行）
- 六親（父母/兄弟/子孫/妻財/官鬼）
- 六神（青龍/朱雀/勾陳/螣蛇/白虎/玄武）
- 世應位置
- 動爻標註
- 日干支、月建、旬空

爻值說明：
- 6 = 老陰（動爻，陰變陽）
- 7 = 少陽（靜爻，陽）
- 8 = 少陰（靜爻，陰）
- 9 = 老陽（動爻，陽變陰）

輸入順序：自下而上（初爻到上爻）

輸出為 Markdown 格式，便於 AI 分析解讀。`,
        inputSchema: schemaToJson(LiuyaoBasicSchema),
      },
      {
        name: "meihua_basic",
        description: `梅花易數排盤（基礎排盤）。

支持兩種起卦方式：
1. 時間起卦（method='time'）：根據農曆年月日時起卦
2. 數字起卦（method='number'）：根據兩個數字起卦

返回完整的梅花盤面：
- 本卦/變卦/互卦
- 上卦/下卦（含卦象、五行）
- 動爻位置
- 體用分析（體卦、用卦、五行生剋關係）
- 起卦數據詳情

時間起卦算法（農曆）：
- 上卦 = (年干支序數 + 月 + 日) % 8
- 下卦 = (年干支序數 + 月 + 日 + 時辰序數) % 8
- 動爻 = (年干支序數 + 月 + 日 + 時辰序數) % 6

輸出為 Markdown 格式，便於 AI 分析解讀。`,
        inputSchema: schemaToJson(MeihuaBasicSchema),
      },
      {
        name: "daliuren_basic",
        description: `大六壬排盤（基礎排盤）。

大六壬是中國古老三大占卜術之一，與奇門遁甲、太乙神數並稱三式。

輸入節氣、農曆月、日干支、時干支，返回完整的六壬盤面：
- 天地盤（月將加時辰起盤）
- 四課（日干支推演）
- 三傳（九宗門推演：賊尅、比用、涉害、遙尅、昴星、別責、八專、伏吟、返吟）
- 十二天將（貴人、螣蛇、朱雀、六合、勾陳、青龍、天空、白虎、太常、玄武、太陰、天后）
- 格局判斷
- 神煞（日馬、月馬、丁馬、華蓋、閃電）

注意：
- 需要提供節氣（如：立春、雨水、驚蟄等）
- 日干支和時干支需要是完整的干支（如：甲子、乙丑）
- 本工具只負責排盤，斷課解讀交給 Agent

輸出為 Markdown 格式，便於 AI 分析解讀。`,
        inputSchema: schemaToJson(DaliurenBasicSchema),
      },
      {
        name: "qimen_basic",
        description: `奇門遁甲排盤（基礎排盤）。

奇門遁甲是中國古代三式之一，與大六壬、太乙神數並稱，用於預測和決策。

輸入時間信息，返回完整的奇門盤面：
- 陰陽遁和局數（根據節氣判定）
- 九宮布局（地盤干、天盤干）
- 八門飛布（休、生、傷、杜、景、死、驚、開）
- 九星飛布（天蓬、天芮、天沖、天輔、天禽、天心、天柱、天任、天英）
- 八神排布（值符、螣蛇、太陰、六合、白虎、玄武、九地、九天）
- 旬首信息（符頭、值符星、值使門、空亡）
- 日干/時干落宮
- 格局判斷（吉格/凶格約20-30種）

支持選項：
- 盤類型：時盤（默認）、日盤、月盤、年盤
- 盤式：轉盤（默認，遵循《神奇之門》）或飛盤
- 置閏法：拆補法（默認）或茅山法

盤類型說明：
- 時盤：以時辰為主導，適用於即時預測
- 日盤：以日干支為主導，適用於當日吉凶
- 月盤：以月干支為主導，適用於月度運勢
- 年盤：以年干支為主導，適用於年度規劃

盤式說明：
- 轉盤：天盤、八門、九星按物理方向旋轉（《神奇之門》派）
- 飛盤：天盤、八門、九星按洛書軌跡飛布（傳統飛宮法）

輸出為 Markdown 格式，含 ASCII 九宮格，便於 AI 分析解讀。`,
        inputSchema: schemaToJson(QimenBasicSchema),
      },
      {
        name: "qimen_yongshen",
        description: `奇門遁甲用神分析。

在基礎排盤基礎上，根據事類選取用神並分析：

**支持 14 種事類**：
求財、婚姻、疾病、出行、訴訟、考試、工作、失物、置業、求官、孕產、尋人、合作、其他

**分析內容**：
- 主用神/輔用神識別及落宮
- 用神旺相休囚死狀態
- 用神空亡、入墓、擊刑檢測
- 與日干生克關係
- 受格局影響評估
- 主客分析（涉及雙方的事類）
- 年命分析（可選）
- 神煞信息（可選）

**評分系統**：
每個用神 0-100 分，綜合考量各因素

輸出為結構化 Markdown，便於 AI 斷卦分析。`,
        inputSchema: schemaToJson(QimenYongShenSchema),
      },
      {
        name: "qimen_zeri",
        description: `奇門遁甲擇日功能。

在指定日期範圍內篩選吉時：

**輸入**：
- 起止日期範圍
- 事類（14 種）
- 可選過濾條件

**評分維度**：
- 格局評分（吉格加分、凶格減分）
- 用神評分（得位、空墓等）
- 神煞評分（吉神凶煞）

**過濾條件**：
- 最小評分閾值
- 排除歲破日
- 排除月破日
- 排除節氣交接日

**輸出**：
- 推薦時辰列表（含評分、評級）
- 有利因素、注意事項
- 可選方位信息（三吉門方位、用神方位）

**性能目標**：
- 7天：< 2秒
- 30天：< 5秒
- 365天：< 60秒`,
        inputSchema: schemaToJson(QimenZeRiSchema),
      },
  ];
  // 為所有 tool 注入唯讀 annotations（MCP 協議規範；客戶端可據此判斷安全/可快取）
  return {
    tools: tools.map((t) => ({ annotations: READONLY_ANNOTATIONS, ...t })),
  };
});

// ============================================
// Tool Handlers
// ============================================

const baziService = new BaziService({ debug: false });
const ziweiService = new ZiweiService();
const liuyaoService = new LiuyaoService();
const meihuaService = new MeihuaService();

// Helper: Calculate year stem and branch
function getYearStemBranch(year: number): { stem: string; branch: string } {
  const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const baseYear = 1984; // 甲子年
  const yearDiff = year - baseYear;
  const stemIndex = ((yearDiff % 10) + 10) % 10;
  const branchIndex = ((yearDiff % 12) + 12) % 12;
  return { stem: STEMS[stemIndex], branch: BRANCHES[branchIndex] };
}

// Helper: Parse GanZhi year input
function parseGanzhiYear(input: string | number): { year: number; ganzhi: string } {
  // Clients may serialize a numeric year as a string (e.g. "2026") — treat it as a year.
  if (typeof input === 'string' && /^\d{3,4}$/.test(input.trim())) {
    input = Number(input.trim());
  }
  if (typeof input === 'number') {
    // schema 的 union string 分支冇 min/max，數字字串轉數後必須補範圍驗證
    if (input < 1900 || input > 2100) {
      throw new Error(`年份超出支援範圍（1900-2100）：${input}`);
    }
    const { stem, branch } = getYearStemBranch(input);
    return { year: input, ganzhi: stem + branch };
  }
  // Parse GanZhi string to find year - search nearby years
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 60; y <= currentYear + 60; y++) {
    const { stem, branch } = getYearStemBranch(y);
    if (stem + branch === input) {
      return { year: y, ganzhi: input };
    }
  }
  // 搵唔到就報錯，唔好靜默用當年（silent wrong year）
  throw new Error(`無法識別的干支年：「${input}」，請用干支（如 乙巳）或公曆年份（如 2025）`);
}

// Helper: Parse GanZhi month input
function parseGanzhiMonth(input: string | number): number {
  // Clients may serialize a numeric month as a string (e.g. "8") — treat it as a month number.
  if (typeof input === 'string' && /^\d{1,2}$/.test(input.trim())) {
    input = Number(input.trim());
  }
  if (typeof input === 'number') {
    // schema 的 union string 分支冇 min/max，數字字串轉數後必須補範圍驗證
    if (input < 1 || input > 12) {
      throw new Error(`月份超出範圍（1-12）：${input}`);
    }
    return input; // 1-12
  }
  // Parse GanZhi month string to get month index
  const BRANCHES = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
  const branch = input.substring(1, 2);
  const idx = BRANCHES.indexOf(branch);
  if (idx < 0) {
    throw new Error(`無法識別的干支月：「${input}」，請用干支（如 丙寅）或月數（1-12，1=寅月）`);
  }
  return idx + 1;
}

// Helper: Get month stem branch for a given year and month
function getMonthStemBranch(year: number, monthNum: number): { stem: string; branch: string } {
  const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const BRANCHES = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];

  // Month branch: monthNum 1 = 寅, 2 = 卯, ..., 12 = 丑
  const branch = BRANCHES[(monthNum - 1) % 12];

  // Month stem depends on year stem
  const { stem: yearStem } = getYearStemBranch(year);
  const yearStemIndex = STEMS.indexOf(yearStem);

  // 五虎遁年起月诀
  const firstMonthStemMap: Record<number, number> = {
    0: 2, // 甲年 -> 丙寅月
    1: 4, // 乙年 -> 戊寅月
    2: 6, // 丙年 -> 庚寅月
    3: 8, // 丁年 -> 壬寅月
    4: 0, // 戊年 -> 甲寅月
    5: 2, // 己年 -> 丙寅月
    6: 4, // 庚年 -> 戊寅月
    7: 6, // 辛年 -> 庚寅月
    8: 8, // 壬年 -> 壬寅月
    9: 0  // 癸年 -> 甲寅月
  };

  const firstMonthStemIndex = firstMonthStemMap[yearStemIndex];
  const monthStemIndex = (firstMonthStemIndex + monthNum - 1) % 10;

  return { stem: STEMS[monthStemIndex], branch };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  // ""/null → 當「無提供」刪走，避免 z.coerce.number() 將空字串靜默變 0（錯盤級 footgun）
  const args = sanitizeToolArgs(rawArgs) as Record<string, unknown> | undefined;

  logger.info(`Tool called: ${name}`, args);

  try {
    // === Existing Chart Calculation Handlers ===
    if (name === "bazi_basic") {
      const validated = BaziCalculateSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);

      const result = await baziService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        minute: normalized.minute,
        gender: normalized.gender,
        longitude: normalized.longitude,
        timezone: normalized.timezone,
        dstOffset: normalized.dstOffset,
        timezoneId: normalized.timezoneId,
        dayBoundaryMode: normalized.dayBoundaryMode,
        useLunar: false,  // Already converted to solar if needed
      });

      // If targetYear is specified, calculate LiuNian
      let liuNianInfo = "";
      if (validated.targetYear && result.chart) {
        const liuNians = LiuNianCalculator.calculate(
          result.chart,
          normalized.year,
          validated.targetYear,
          validated.targetYear
        );
        if (liuNians.length > 0) {
          const liunian = liuNians[0];
          liuNianInfo = `\n\n=== 流年 ${validated.targetYear} ===\n干支：${liunian.stem}${liunian.branch}`;
        }
      }

      const options: FortuneTextOptions = {
        detail: validated.detail,
        includePersonal: false,
        includeLocation: !!validated.longitude,
      };

      const birthDate = new Date(normalized.year, normalized.month - 1, normalized.day, normalized.hour, normalized.minute);
      const text = renderBaziText(
        { bazi: result, gender: normalized.gender, birthDate },
        options
      );

      const sti = result.birthInfo?.solarTimeInfo;
      const p = (pi: any) => (pi ? `${pi.stem}${pi.branch}` : "");

      // Normalize element fields that may be a string, array, or undefined.
      const toElemArray = (v: any): string[] =>
        Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [];

      const sa = result.enhanced?.strengthAnalysis;
      const pa = result.enhanced?.patternAnalysis;
      const br = result.enhanced?.branchRelations;
      const yg = result.traditional?.yongShen;

      // Collect warnings; may be extended by uncertainty checks below.
      const warnings: string[] = [...(result.birthInfo?.warnings ?? [])];

      // --- Strength (heuristic scoring → medium confidence) ---
      const strength = {
        level: sa?.dayMasterStrength ?? result.traditional?.strength,
        score: sa?.totalScore,
        percentage: sa?.percentage,
        breakdown: sa?.breakdown,
        reasoning: sa?.details ?? [],
        summary: sa?.analysis,
        confidence: "medium",
      };

      // --- Pattern (use enhanced.patternAnalysis, NOT traditional.geJu) ---
      const primaryPattern = pa?.primaryPattern;
      const pattern = {
        primary: primaryPattern,
        secondary: pa?.secondaryPatterns ?? [],
        // primaryPattern.strength is 1-10 confidence in identification
        confidence:
          typeof primaryPattern?.strength === "number" && primaryPattern.strength >= 7
            ? "high"
            : "medium",
      };

      // --- Useful god (yongShen) ---
      const yongShenArr = toElemArray(yg?.yongShen);
      const xiShenArr = toElemArray(yg?.xiShen);
      const jiShenArr = toElemArray(yg?.jiShen);
      const xianShenArr = toElemArray(yg?.xianShen);
      const favorableElements = [...new Set([...yongShenArr, ...xiShenArr])];
      const uncertaintyReasons: string[] = [];
      let usefulGodConfidence: "high" | "medium" | "low";
      if (yongShenArr.length === 0) {
        usefulGodConfidence = "low";
        uncertaintyReasons.push("用神分析未能得出明確結果");
        warnings.push("用神分析未能得出明確結果，favorableElements 可能不完整");
      } else {
        // Heuristic system: honest confidence is "medium" even when populated.
        usefulGodConfidence = "medium";
      }
      const usefulGod = {
        yongShen: yongShenArr,
        xiShen: xiShenArr,
        jiShen: jiShenArr,
        xianShen: xianShenArr,
        favorableElements,
        unfavorableElements: jiShenArr,
        explanation: yg?.explanation,
        confidence: usefulGodConfidence,
        uncertaintyReasons,
      };

      // --- Interactions (from enhanced.branchRelations) ---
      const interactions = {
        combinations: [
          ...(br?.stemCombinations ?? []),
          ...(br?.sixHarmonies ?? []),
          ...(br?.threeHarmonies ?? []),
          ...(br?.threeMeetings ?? []),
        ],
        clashes: br?.sixConflicts ?? [],
        harms: br?.sixHarms ?? [],
        punishments: br?.threePunishments ?? [],
        destructions: br?.sixDestructions ?? [],
      };

      const structured = {
        calculation: {
          pillars: {
            year: p(result.chart?.year),
            month: p(result.chart?.month),
            day: p(result.chart?.day),
            hour: p(result.chart?.hour),
          },
          dayMaster: result.basic?.dayMaster,
          dayMasterElement: result.basic?.dayMasterElement,
          fiveElements: result.basic?.fiveElements,
          tenGods: result.basic?.tenGods,
          shenSha: result.basic?.shenSha ?? [],
          solarTimeInfo: sti,
        },
        analysis: {
          strength,
          pattern,
          usefulGod,
          interactions,
        },
        metadata: {
          trueSolarTimeApplied: sti?.applied ?? false,
          dayBoundaryMode: sti?.dayBoundaryMode ?? "MIDNIGHT_00",
          timezoneBasis: sti?.timezoneBasis ?? null,
          dstOffsetMinutes: sti?.dstOffsetMinutes ?? 0,
          version: SERVER_VERSION,
        },
        warnings,
      };

      return {
        content: [
          {
            type: "text",
            text: text + liuNianInfo + renderBaziTimeCorrection(result),
          },
        ],
        structuredContent: structured,
      };
    }

    if (name === "bazi_true_solar_time") {
      const v = TrueSolarTimeSchema.parse(args);
      assertValidSolarDate(v.year, v.month, v.day);
      const civil = new Date(v.year, v.month - 1, v.day, v.hour, v.minute);
      const d = TrueSolarTime.adjustWithDetail(civil, v.longitude, {
        timezone: v.timezone,
        dstOffset: v.dstOffset,
        timezoneId: v.timezoneId,
      });
      const pad = (n: number) => String(n).padStart(2, "0");
      const fmt = (dt: Date) =>
        `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
      const sign = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
      const utcSign = d.standardOffsetHours >= 0 ? "+" : "";
      const lines: string[] = [
        "=== 真太陽時換算 ===",
        `鐘錶時間：${fmt(civil)}`,
        `真太陽時：${fmt(d.adjusted)}`,
        "",
        `時區依據：${d.timezoneBasis}（標準經線 ${d.standardMeridian}°，UTC${utcSign}${d.standardOffsetHours}）`,
        `經度修正：${sign(d.longitudeCorrectionMinutes)} 分`,
        `均時差（Meeus）：${sign(d.equationOfTimeMinutes)} 分`,
        `夏令時扣減：${d.dstOffsetMinutes} 分`,
        `總修正：${sign(d.totalCorrectionMinutes)} 分`,
      ];
      if (d.assumedTimezone) {
        lines.push("⚠️ 未提供時區，已假設 UTC+8 北京時間；海外請補 timezone/timezoneId 以準確校正。");
      }
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          civilTime: fmt(civil),
          trueSolarTime: fmt(d.adjusted),
          standardMeridian: d.standardMeridian,
          standardOffsetHours: d.standardOffsetHours,
          longitudeCorrectionMinutes: round2(d.longitudeCorrectionMinutes),
          equationOfTimeMinutes: round2(d.equationOfTimeMinutes),
          dstOffsetMinutes: d.dstOffsetMinutes,
          totalCorrectionMinutes: round2(d.totalCorrectionMinutes),
          timezoneBasis: d.timezoneBasis,
          assumedTimezone: d.assumedTimezone,
        },
      };
    }

    if (name === "bazi_reverse") {
      const v = ReverseBaziSchema.parse(args);
      const target = v.bazi.trim().split(/\s+/).filter(Boolean);
      if (target.length !== 4) {
        return {
          content: [{ type: "text", text: "輸入需為四柱干支，以空格分隔，例如：戊寅 己未 己卯 辛未" }],
          isError: true,
        };
      }
      const endYear = v.endYear ?? new Date().getFullYear();
      if (endYear < v.startYear) {
        return { content: [{ type: "text", text: "endYear 不可小於 startYear" }], isError: true };
      }

      const sect = v.dayBoundaryMode === "ZI_HOUR_23" ? 1 : 2;
      // 時柱用 mingpan 一致的五鼠遁（當日日干起時），確保反查結果餵回 bazi_basic 會得同一盤。
      const HS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
      const EB = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
      const FIVE_RATS: Record<string, string> = {
        甲: "甲", 己: "甲", 乙: "丙", 庚: "丙", 丙: "戊", 辛: "戊", 丁: "庚", 壬: "庚", 戊: "壬", 癸: "壬",
      };
      const hourPillar = (dayGan: string, hour: number): string => {
        const start = HS.indexOf(FIVE_RATS[dayGan]);
        const zhiIndex = Math.ceil(hour / 2) % 12;
        return HS[(start + zhiIndex) % 10] + EB[zhiIndex];
      };
      const pad = (n: number) => String(n).padStart(2, "0");

      const matches: string[] = [];
      let truncated = false;
      outer: for (let y = v.startYear; y <= endYear; y++) {
        // 年柱過濾（加速）：公曆年 y 內可能出現兩個干支年 —— 立春前（1月~立春）屬上一干支年，
        // 立春後屬本干支年。以 6/1 樣本代表「立春後」；若上一年 6/1 樣本匹配，則 y 年年頭
        // （立春前）都可能命中，必須照掃（內層逐時精確核對年柱，不會誤報）。
        // 修正：舊邏輯只查本年 6/1，會漏掉所有立春前出生（如 1994-01 出生嘅癸酉年人）。
        const sampleYearPillar = (yy: number): string => {
          const e = Solar.fromYmdHms(yy, 6, 1, 12, 0, 0).getLunar().getEightChar();
          return e.getYearGan() + e.getYearZhi();
        };
        const matchesAfterLichun = sampleYearPillar(y) === target[0];
        const matchesBeforeLichun = sampleYearPillar(y - 1) === target[0];
        if (!matchesAfterLichun && !matchesBeforeLichun) continue;
        // 只匹配立春前段時，最多掃到 2 月尾（立春最遲 2/5 前後）即可，慳返 10 個月
        const maxMonth = matchesAfterLichun ? 12 : 2;
        for (let mo = 1; mo <= maxMonth; mo++) {
          const daysInMonth = new Date(y, mo, 0).getDate();
          for (let d = 1; d <= daysInMonth; d++) {
            for (let h = 0; h <= 23; h++) {
              const ec = Solar.fromYmdHms(y, mo, d, h, 0, 0).getLunar().getEightChar();
              ec.setSect(sect);
              const yp = ec.getYearGan() + ec.getYearZhi();
              if (yp !== target[0]) continue;
              const mp = ec.getMonthGan() + ec.getMonthZhi();
              if (mp !== target[1]) continue;
              const dp = ec.getDayGan() + ec.getDayZhi();
              if (dp !== target[2]) continue;
              const hp = hourPillar(ec.getDayGan(), h);
              if (hp !== target[3]) continue;
              matches.push(`${y}-${pad(mo)}-${pad(d)} ${pad(h)}:00`);
              if (matches.length >= v.limit) {
                truncated = true;
                break outer;
              }
            }
          }
        }
      }

      const lines: string[] = [
        `=== 八字反查：${v.bazi} ===`,
        `搜尋範圍：${v.startYear}–${endYear}　子時流派：${v.dayBoundaryMode}`,
        `找到 ${matches.length} 個候選${truncated ? "（已達上限，可能還有更多）" : ""}：`,
      ];
      if (matches.length === 0) {
        lines.push("（範圍內無匹配。請確認四柱與子時流派是否一致，或擴大年份範圍。）");
      } else {
        for (const m of matches) lines.push(`  ${m}`);
      }
      lines.push("");
      lines.push("註：反查使用鐘錶時間排盤（不含真太陽時校正）。確定候選後，建議用 bazi_basic 補經度/時區精算。");
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          bazi: v.bazi,
          startYear: v.startYear,
          endYear,
          dayBoundaryMode: v.dayBoundaryMode,
          matchCount: matches.length,
          truncated,
          candidates: matches,
        },
      };
    }

    if (name === "ziwei_basic") {
      const validated = ZiweiCalculateSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);

      const result = await ziweiService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        gender: normalized.gender,
      });

      const options: FortuneTextOptions = {
        detail: validated.detail,
        includePersonal: false,
      };

      const birthDate = new Date(normalized.year, normalized.month - 1, normalized.day, normalized.hour, normalized.minute);
      const text = renderZiweiText(
        {
          ziwei: result,
          gender: normalized.gender,
          birthDate,
          mutagen: result.mutagenInfo  // 傳入四化信息
        },
        options
      );

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
        structuredContent: { palaces: result.palaces, mutagen: result.mutagenInfo },
      };
    }

    // === 六爻工具處理器 ===

    if (name === "liuyao_basic") {
      const validated = LiuyaoBasicSchema.parse(args);
      // 日期驗證由 LiuyaoService 內部 normalizeBirthDateTime 處理

      const result = liuyaoService.calculate({
        yaoValues: validated.yaoValues as [6|7|8|9, 6|7|8|9, 6|7|8|9, 6|7|8|9, 6|7|8|9, 6|7|8|9],
        year: validated.year,
        month: validated.month,
        day: validated.day,
        hour: validated.hour,
        isLunar: validated.isLunar,
      });

      const text = renderLiuyaoText(result);

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
        structuredContent: { result },
      };
    }

    // === 梅花易數工具處理器 ===

    if (name === "meihua_basic") {
      const validated = MeihuaBasicSchema.parse(args);
      // 日期驗證由 MeihuaService 內部 normalizeBirthDateTime 處理

      const result = meihuaService.calculate({
        method: validated.method,
        year: validated.year,
        month: validated.month,
        day: validated.day,
        hour: validated.hour,
        isLunar: validated.isLunar,
        upperNumber: validated.upperNumber,
        lowerNumber: validated.lowerNumber,
        yaoNumber: validated.yaoNumber,
      });

      const text = renderMeihuaText(result);

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
        structuredContent: { result },
      };
    }

    // === 大六壬工具處理器 ===

    if (name === "daliuren_basic") {
      const validated = DaliurenBasicSchema.parse(args);

      const daliurenService = new DaliurenService();
      const result = daliurenService.calculate({
        jieqi: validated.jieqi,
        lunarMonth: validated.lunarMonth,
        dayGanZhi: validated.dayGanZhi,
        hourGanZhi: validated.hourGanZhi,
        guirenMethod: validated.guirenMethod,
      });

      const text = renderDaliurenText(result);

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
        structuredContent: { result },
      };
    }

    // === 奇門遁甲工具處理器 ===

    if (name === "qimen_basic") {
      const validated = QimenBasicSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);

      const qimenService = new QimenService();
      const result = qimenService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        minute: normalized.minute,
        isLunar: false,  // Already converted to solar if needed
        panType: validated.panType,
        panStyle: validated.panStyle,
        zhiRunMethod: validated.zhiRunMethod,
      });

      const text = renderQimenText(result);

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
        structuredContent: { result },
      };
    }
    // === 奇門遁甲用神 ===
    if (name === "qimen_yongshen") {
      const validated = QimenYongShenSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);

      const qimenService = new QimenService();
      const result = qimenService.calculateWithYongShen(
        {
          year: normalized.year,
          month: normalized.month,
          day: normalized.day,
          hour: normalized.hour,
          minute: normalized.minute,
          isLunar: false,
          panType: validated.panType,
          panStyle: validated.panStyle,
          zhiRunMethod: validated.zhiRunMethod,
        },
        validated.shiLei,
        {
          nianGan: validated.nianGan,
          includeShenSha: validated.includeShenSha,
        }
      );

      // 使用渲染器生成输出
      const { renderQimenYongShenText } = await import("./output/qimenTextRenderer");
      const text = renderQimenYongShenText(result);

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
        structuredContent: { result },
      };
    }

    if (name === "qimen_zeri") {
      const validated = QimenZeRiSchema.parse(args);
      assertValidSolarDate(validated.startYear, validated.startMonth, validated.startDay);
      assertValidSolarDate(validated.endYear, validated.endMonth, validated.endDay);

      const qimenService = new QimenService();
      const results = qimenService.findAuspiciousDates({
        startDate: new Date(validated.startYear, validated.startMonth - 1, validated.startDay),
        endDate: new Date(validated.endYear, validated.endMonth - 1, validated.endDay),
        shiLei: validated.shiLei,
        limit: validated.limit,
        minScore: validated.minScore,
        includeDirection: validated.includeDirection,
        excludeJieQiDay: validated.excludeJieQiDay,
        excludeSuiPo: validated.excludeSuiPo,
        excludeYuePo: validated.excludeYuePo,
        panType: validated.panType,
        panStyle: validated.panStyle,
        zhiRunMethod: validated.zhiRunMethod,
      });

      // 使用渲染器生成输出
      const { renderQimenZeRiText } = await import("./output/qimenTextRenderer");
      const text = renderQimenZeRiText(results, validated.shiLei);

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
        structuredContent: { candidates: results },
      };
    }

    // === BaZi List Tool Handlers ===

    if (name === "bazi_dayun") {
      const validated = BaziDaYunListSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);

      // Calculate BaZi chart first
      const result = await baziService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        minute: normalized.minute,
        gender: normalized.gender,
        longitude: normalized.longitude,
        timezone: normalized.timezone,
        dstOffset: normalized.dstOffset,
        timezoneId: normalized.timezoneId,
        dayBoundaryMode: normalized.dayBoundaryMode,
      });

      if (!result.chart || !result.birthInfo) {
        throw new Error("Failed to calculate BaZi chart");
      }

      // Calculate DaYun
      const daYunList = DaYunCalculator.calculate(
        result.chart,
        result.birthInfo,
        normalized.gender,
        { startYear: normalized.year, endYear: normalized.year + 100 }
      );

      // Get direction and start info
      const direction = LuckCycleCalculator.calLuckySequence(normalized.gender, result.chart.year.stem) === 'forward' ? '顺行' : '逆行';
      const startAge = daYunList.length > 0 ? daYunList[0].startAge : 1;
      const startYear = normalized.year + startAge - 1;

      const options: BaziListOptions & { direction: '顺行' | '逆行'; startAge: number; startYear: number } = {
        name: normalized.name,
        birthYear: normalized.year,
        birthMonth: normalized.month,
        birthDay: normalized.day,
        birthHour: normalized.hour,
        birthMinute: normalized.minute,
        gender: normalized.gender,
        dayMaster: result.chart.day.stem,
        yearPillar: { stem: result.chart.year.stem, branch: result.chart.year.branch },
        monthPillar: { stem: result.chart.month.stem, branch: result.chart.month.branch },
        dayPillar: { stem: result.chart.day.stem, branch: result.chart.day.branch },
        hourPillar: { stem: result.chart.hour.stem, branch: result.chart.hour.branch },
        direction,
        startAge,
        startYear,
      };

      const daYunOut = daYunList.slice(0, validated.count);
      const text = renderBaziDaYunList(daYunOut, options);

      return { content: [{ type: "text", text }], structuredContent: { daYun: daYunOut } };
    }

    if (name === "bazi_liunian") {
      const validated = BaziLiuNianListSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);

      // Calculate BaZi chart first
      const result = await baziService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        minute: normalized.minute,
        gender: normalized.gender,
        longitude: normalized.longitude,
        timezone: normalized.timezone,
        dstOffset: normalized.dstOffset,
        timezoneId: normalized.timezoneId,
        dayBoundaryMode: normalized.dayBoundaryMode,
      });

      if (!result.chart || !result.birthInfo) {
        throw new Error("Failed to calculate BaZi chart");
      }

      // Calculate DaYun list to match each LiuNian to its DaYun
      const daYunList = DaYunCalculator.calculate(
        result.chart,
        result.birthInfo,
        normalized.gender,
        { startYear: normalized.year, endYear: normalized.year + 100 }
      );

      // Calculate LiuNian for the range
      const liuNianList = LiuNianCalculator.calculate(
        result.chart,
        normalized.year,
        validated.startYear,
        validated.endYear
      );

      const options = {
        name: normalized.name,
        birthYear: normalized.year,
        birthMonth: normalized.month,
        birthDay: normalized.day,
        birthHour: normalized.hour,
        birthMinute: normalized.minute,
        gender: normalized.gender,
        dayMaster: result.chart.day.stem,
        yearPillar: { stem: result.chart.year.stem, branch: result.chart.year.branch },
        monthPillar: { stem: result.chart.month.stem, branch: result.chart.month.branch },
        dayPillar: { stem: result.chart.day.stem, branch: result.chart.day.branch },
        hourPillar: { stem: result.chart.hour.stem, branch: result.chart.hour.branch },
        startYear: validated.startYear,
        endYear: validated.endYear,
        daYunList,
      };

      const text = renderBaziLiuNianList(liuNianList, options);

      return { content: [{ type: "text", text }], structuredContent: { liuNian: liuNianList } };
    }

    if (name === "bazi_liuyue") {
      const validated = BaziLiuYueListSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);
      const { year: gregorianYear, ganzhi: ganzhiYear } = parseGanzhiYear(validated.ganzhiYear);

      // Calculate BaZi chart first
      const result = await baziService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        minute: normalized.minute,
        gender: normalized.gender,
        longitude: normalized.longitude,
        timezone: normalized.timezone,
        dstOffset: normalized.dstOffset,
        timezoneId: normalized.timezoneId,
        dayBoundaryMode: normalized.dayBoundaryMode,
      });

      if (!result.chart || !result.birthInfo) {
        throw new Error("Failed to calculate BaZi chart");
      }

      // Get year stem and branch
      const { stem: yearStem, branch: yearBranch } = getYearStemBranch(gregorianYear);

      // Calculate DaYun list to find current DaYun
      const daYunList = DaYunCalculator.calculate(
        result.chart,
        result.birthInfo,
        normalized.gender,
        { startYear: normalized.year, endYear: normalized.year + 100 }
      );

      // Calculate age for the target year (虛歲)
      const targetAge = gregorianYear - normalized.year + 1;

      // Find current DaYun
      let currentDaYun: { stem: string; branch: string; startAge: number; endAge: number } | undefined;
      const matchedDaYun = daYunList.find(dy => targetAge >= dy.startAge && targetAge <= dy.endAge);
      if (matchedDaYun) {
        currentDaYun = {
          stem: matchedDaYun.stem,
          branch: matchedDaYun.branch,
          startAge: matchedDaYun.startAge,
          endAge: matchedDaYun.endAge,
        };
      }

      // Calculate current LiuNian
      const liuNianList = LiuNianCalculator.calculate(
        result.chart,
        normalized.year,
        gregorianYear,
        gregorianYear
      );
      let currentLiuNian: { stem: string; branch: string; age: number } | undefined;
      if (liuNianList.length > 0) {
        const ln = liuNianList[0];
        currentLiuNian = {
          stem: ln.stem,
          branch: ln.branch,
          age: ln.age,
        };
      }

      // Natal pillars for month cross-analysis (十神 / 合沖刑害破)
      const natalPillars = [
        { stem: result.chart.year.stem, branch: result.chart.year.branch, position: '年柱' },
        { stem: result.chart.month.stem, branch: result.chart.month.branch, position: '月柱' },
        { stem: result.chart.day.stem, branch: result.chart.day.branch, position: '日柱' },
        { stem: result.chart.hour.stem, branch: result.chart.hour.branch, position: '時柱' },
      ];

      // Calculate LiuYue
      const calculator = new LiuYueCalculator();
      const liuYueList = calculator.calculateLiuYue(
        yearStem as any,
        yearBranch as any,
        (result.basic?.dayMasterElement || '木') as any,
        (result.traditional?.yongShen?.yongShen || []) as any,
        {
          year: normalized.year,
          month: normalized.month,
          day: normalized.day,
          hour: normalized.hour,
          minute: normalized.minute,
        },
        gregorianYear,
        {
          dayMaster: result.chart.day.stem,
          natalPillars,
          currentDaYun: currentDaYun
            ? { stem: currentDaYun.stem, branch: currentDaYun.branch }
            : undefined,
          currentLiuNian: currentLiuNian
            ? { stem: currentLiuNian.stem, branch: currentLiuNian.branch }
            : undefined,
        }
      );

      const options = {
        name: normalized.name,
        birthYear: normalized.year,
        birthMonth: normalized.month,
        birthDay: normalized.day,
        birthHour: normalized.hour,
        birthMinute: normalized.minute,
        gender: normalized.gender,
        dayMaster: result.chart.day.stem,
        yearPillar: { stem: result.chart.year.stem, branch: result.chart.year.branch },
        monthPillar: { stem: result.chart.month.stem, branch: result.chart.month.branch },
        dayPillar: { stem: result.chart.day.stem, branch: result.chart.day.branch },
        hourPillar: { stem: result.chart.hour.stem, branch: result.chart.hour.branch },
        ganzhiYear,
        gregorianYear,
        currentDaYun,
        currentLiuNian,
      };

      const text = renderBaziLiuYueList(liuYueList, options);

      return { content: [{ type: "text", text }], structuredContent: { liuYue: liuYueList } };
    }

    if (name === "bazi_liuri") {
      const validated = BaziLiuRiListSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);
      const { year: gregorianYear, ganzhi: ganzhiYear } = parseGanzhiYear(validated.ganzhiYear);
      const monthNum = parseGanzhiMonth(validated.ganzhiMonth);

      // Calculate BaZi chart first
      const result = await baziService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        minute: normalized.minute,
        gender: normalized.gender,
        longitude: normalized.longitude,
        timezone: normalized.timezone,
        dstOffset: normalized.dstOffset,
        timezoneId: normalized.timezoneId,
        dayBoundaryMode: normalized.dayBoundaryMode,
      });

      if (!result.chart || !result.birthInfo) {
        throw new Error("Failed to calculate BaZi chart");
      }

      // Get year and month stem/branch
      const { stem: yearStem, branch: yearBranch } = getYearStemBranch(gregorianYear);
      const { stem: monthStem, branch: monthBranch } = getMonthStemBranch(gregorianYear, monthNum);

      // Calculate DaYun list to find current DaYun
      const daYunList = DaYunCalculator.calculate(
        result.chart,
        result.birthInfo,
        normalized.gender,
        { startYear: normalized.year, endYear: normalized.year + 100 }
      );

      // Calculate age for the target year (虛歲)
      const targetAge = gregorianYear - normalized.year + 1;

      // Find current DaYun
      let currentDaYun: { stem: string; branch: string; startAge: number; endAge: number } | undefined;
      const matchedDaYun = daYunList.find(dy => targetAge >= dy.startAge && targetAge <= dy.endAge);
      if (matchedDaYun) {
        currentDaYun = {
          stem: matchedDaYun.stem,
          branch: matchedDaYun.branch,
          startAge: matchedDaYun.startAge,
          endAge: matchedDaYun.endAge,
        };
      }

      // Calculate current LiuNian
      const liuNianList = LiuNianCalculator.calculate(
        result.chart,
        normalized.year,
        gregorianYear,
        gregorianYear
      );
      let currentLiuNian: { stem: string; branch: string; age: number } | undefined;
      if (liuNianList.length > 0) {
        const ln = liuNianList[0];
        currentLiuNian = {
          stem: ln.stem,
          branch: ln.branch,
          age: ln.age,
        };
      }

      // Current LiuYue info
      const currentLiuYue = {
        stem: monthStem,
        branch: monthBranch,
        month: monthNum,
      };

      // Calculate LiuRi
      const calculator = new LiuRiCalculator();
      const liuRiList = calculator.calculateLiuRi(
        monthStem as any,
        monthBranch as any,
        yearStem as any,
        yearBranch as any,
        (result.basic?.dayMasterElement || '木') as any,
        (result.traditional?.yongShen?.yongShen || []) as any,
        gregorianYear,
        monthNum
      );

      // Get the first and last date from the calculated list
      const startDate = liuRiList.length > 0 ? liuRiList[0].date : new Date();
      const endDate = liuRiList.length > 0 ? liuRiList[liuRiList.length - 1].date : new Date();

      const options = {
        name: normalized.name,
        birthYear: normalized.year,
        birthMonth: normalized.month,
        birthDay: normalized.day,
        birthHour: normalized.hour,
        birthMinute: normalized.minute,
        gender: normalized.gender,
        dayMaster: result.chart.day.stem,
        yearPillar: { stem: result.chart.year.stem, branch: result.chart.year.branch },
        monthPillar: { stem: result.chart.month.stem, branch: result.chart.month.branch },
        dayPillar: { stem: result.chart.day.stem, branch: result.chart.day.branch },
        hourPillar: { stem: result.chart.hour.stem, branch: result.chart.hour.branch },
        ganzhiMonth: monthStem + monthBranch,
        ganzhiYear,
        gregorianYear,
        startDate,
        endDate,
        currentDaYun,
        currentLiuNian,
        currentLiuYue,
      };

      const text = renderBaziLiuRiList(liuRiList, options);

      return { content: [{ type: "text", text }], structuredContent: { liuRi: liuRiList } };
    }

    // === ZiWei List Tool Handlers ===

    if (name === "ziwei_daxian") {
      const validated = ZiweiDaXianListSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);

      // Calculate ZiWei chart
      const result = ziweiService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        gender: normalized.gender,
      });

      if (!result.decades || result.decades.length === 0) {
        throw new Error("Failed to calculate ZiWei decades");
      }

      // Determine direction
      const yangStems = ['甲', '丙', '戊', '庚', '壬'];
      const yearStem = result.basicInfo?.fourPillars?.year?.stem || '';
      const isYang = yangStems.includes(yearStem);
      const isMale = validated.gender === 'male';
      const direction = ((isYang && isMale) || (!isYang && !isMale)) ? '顺行' : '逆行';

      // Find Ming Gong stars
      const mingGongPalace = result.palaces?.find(p =>
        p.name === '命宮' || p.name === '命宫' || p.name === 'Life'
      );
      const mingGongStars = mingGongPalace?.majorStars?.map(s =>
        typeof s === 'string' ? s : s.name
      ) || [];

      // Find Shen Gong
      const shenGongPalace = result.palaces?.find(p => p.isBodyPalace);
      const shenGongStars = shenGongPalace?.majorStars?.map(s =>
        typeof s === 'string' ? s : s.name
      ) || [];

      const options: ZiweiListOptions & { direction: '顺行' | '逆行' } = {
        name: normalized.name,
        birthYear: normalized.year,
        birthMonth: normalized.month,
        birthDay: normalized.day,
        birthHour: normalized.hour,
        birthMinute: normalized.minute,
        gender: normalized.gender,
        mingGong: mingGongPalace?.name || '命宮',
        mingGongStars,
        shenGong: shenGongPalace?.name,
        shenGongStars,
        palaces: result.palaces,  // 传入完整宫位数据
        mutagenInfo: result.mutagenInfo,  // 传入四化信息
        direction,
      };

      const daXianOut = result.decades.slice(0, validated.count);
      const text = renderZiweiDaXianList(daXianOut, options);

      return { content: [{ type: "text", text }], structuredContent: { daXian: daXianOut } };
    }

    if (name === "ziwei_xiaoxian") {
      const validated = ZiweiXiaoXianListSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);

      const result = ziweiService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        gender: normalized.gender,
      });

      if (!result.palaces) {
        throw new Error("Failed to calculate ZiWei chart");
      }

      const minorLimitList = ziweiService.getMinorLimitRange(
        normalized.year,
        validated.startAge,
        validated.endAge
      );

      const mingGongPalace = result.palaces?.find(p =>
        p.name === '命宮' || p.name === '命宫' || p.name === 'Life'
      );
      const mingGongStars = mingGongPalace?.majorStars?.map(s =>
        typeof s === 'string' ? s : s.name
      ) || [];

      const currentYear = new Date().getFullYear();
      const currentAge = currentYear - normalized.year + 1;
      let currentDecade: { palaceName: string; startAge: number; endAge: number } | undefined;
      if (result.decades && result.decades.length > 0) {
        const matchedDecade = result.decades.find(
          d => currentAge >= d.startAge && currentAge <= d.endAge
        );
        if (matchedDecade) {
          currentDecade = {
            palaceName: matchedDecade.palaceName || result.palaces?.[matchedDecade.palaceIndex]?.name || '未知',
            startAge: matchedDecade.startAge,
            endAge: matchedDecade.endAge,
          };
        }
      }

      const options = {
        name: normalized.name,
        birthYear: normalized.year,
        birthMonth: normalized.month,
        birthDay: normalized.day,
        birthHour: normalized.hour,
        birthMinute: normalized.minute,
        gender: normalized.gender,
        mingGong: mingGongPalace?.name || '命宮',
        mingGongStars,
        palaces: result.palaces,
        mutagenInfo: result.mutagenInfo,
        startAge: validated.startAge,
        endAge: validated.endAge,
        currentDecade,
        decades: result.decades,
      };

      const text = renderZiweiXiaoXianList(minorLimitList, options);

      return { content: [{ type: "text", text }], structuredContent: { xiaoXian: minorLimitList } };
    }

    if (name === "ziwei_liunian") {
      const validated = ZiweiLiuNianListSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);

      // Calculate ZiWei chart
      const result = ziweiService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        gender: normalized.gender,
      });

      if (!result.palaces) {
        throw new Error("Failed to calculate ZiWei chart");
      }

      // Calculate yearly info for each year in the range
      const yearlyList = [];
      for (let year = validated.startYear; year <= validated.endYear; year++) {
        const yearly = YearlyCalculator.calculate(year, normalized.year, result.palaces);
        if (yearly) {
          yearlyList.push(yearly);
        }
      }

      // Find Ming Gong
      const mingGongPalace = result.palaces?.find(p =>
        p.name === '命宮' || p.name === '命宫' || p.name === 'Life'
      );
      const mingGongStars = mingGongPalace?.majorStars?.map(s =>
        typeof s === 'string' ? s : s.name
      ) || [];

      const options = {
        name: normalized.name,
        birthYear: normalized.year,
        birthMonth: normalized.month,
        birthDay: normalized.day,
        birthHour: normalized.hour,
        birthMinute: normalized.minute,
        gender: normalized.gender,
        mingGong: mingGongPalace?.name || '命宮',
        mingGongStars,
        palaces: result.palaces,  // 传入完整宫位数据
        mutagenInfo: result.mutagenInfo,  // 传入四化信息
        startYear: validated.startYear,
        endYear: validated.endYear,
        decades: result.decades,  // 传入大限列表用于匹配所属大限
      };

      const text = renderZiweiLiuNianList(yearlyList, options);

      return { content: [{ type: "text", text }], structuredContent: { liuNian: yearlyList } };
    }

    if (name === "ziwei_liuyue") {
      const validated = ZiweiLiuYueListSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);

      // Calculate ZiWei chart
      const result = ziweiService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        gender: normalized.gender,
      });

      // Get yearly months (农历月)
      const monthlyList = ziweiService.getYearlyMonths(validated.lunarYear);

      // Find Ming Gong
      const mingGongPalace = result.palaces?.find(p =>
        p.name === '命宮' || p.name === '命宫' || p.name === 'Life'
      );
      const mingGongStars = mingGongPalace?.majorStars?.map(s =>
        typeof s === 'string' ? s : s.name
      ) || [];

      // Check for leap month in this lunar year
      const lunar = Lunar.fromYmd(validated.lunarYear, 1, 1);
      const leapMonth = lunar.getYear() === validated.lunarYear ?
        (Lunar.fromYmd(validated.lunarYear, 6, 1) as any).getLeapMonth?.() : undefined;

      // Calculate age for the target year (虛歲)
      const targetAge = validated.lunarYear - normalized.year + 1;

      // Find current decade (大限)
      let currentDecade: { palaceName: string; startAge: number; endAge: number } | undefined;
      if (result.decades && result.decades.length > 0) {
        const matchedDecade = result.decades.find(
          d => targetAge >= d.startAge && targetAge <= d.endAge
        );
        if (matchedDecade) {
          currentDecade = {
            palaceName: matchedDecade.palaceName || result.palaces?.[matchedDecade.palaceIndex]?.name || '未知',
            startAge: matchedDecade.startAge,
            endAge: matchedDecade.endAge,
          };
        }
      }

      // Calculate current yearly (流年)
      const yearlyInfo = YearlyCalculator.calculate(validated.lunarYear, normalized.year, result.palaces!);
      let currentYearly: { year: number; age: number; palaceName: string; heavenlyStem: string; earthlyBranch: string } | undefined;
      if (yearlyInfo) {
        const { stem: yearStem, branch: yearBranch } = getYearStemBranch(validated.lunarYear);
        currentYearly = {
          year: validated.lunarYear,
          age: targetAge,
          palaceName: result.palaces?.[yearlyInfo.palaceIndex]?.name || '未知',
          heavenlyStem: yearStem,
          earthlyBranch: yearBranch,
        };
      }

      // Calculate current minor limit (小限)
      const minorLimitInfo = ziweiService.getMinorLimitInfo(normalized.year, validated.lunarYear);
      let currentMinorLimit: { age: number; palaceName: string; heavenlyStem: string; earthlyBranch: string } | undefined;
      if (minorLimitInfo) {
        currentMinorLimit = {
          age: minorLimitInfo.age,
          palaceName: result.palaces?.[minorLimitInfo.palaceIndex]?.name || '未知',
          heavenlyStem: minorLimitInfo.heavenlyStem,
          earthlyBranch: minorLimitInfo.earthlyBranch,
        };
      }

      // 添加小限四化到 mutagenInfo
      const enhancedMutagenInfo = { ...result.mutagenInfo };
      if (minorLimitInfo?.heavenlyStem) {
        enhancedMutagenInfo.minorLimit = MutagenCore.getMutagen(minorLimitInfo.heavenlyStem) || undefined;
      }

      const options = {
        name: normalized.name,
        birthYear: normalized.year,
        birthMonth: normalized.month,
        birthDay: normalized.day,
        birthHour: normalized.hour,
        birthMinute: normalized.minute,
        gender: normalized.gender,
        mingGong: mingGongPalace?.name || '命宮',
        mingGongStars,
        palaces: result.palaces,
        mutagenInfo: enhancedMutagenInfo,
        lunarYear: validated.lunarYear,
        gregorianYear: validated.lunarYear,
        leapMonth: typeof leapMonth === 'number' ? leapMonth : undefined,
        currentDecade,
        currentMinorLimit,
        currentYearly,
      };

      const text = renderZiweiLiuYueList(monthlyList, options);

      return { content: [{ type: "text", text }], structuredContent: { liuYue: monthlyList } };
    }

    if (name === "ziwei_liuri") {
      const validated = ZiweiLiuRiListSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);

      // Calculate ZiWei chart
      const result = ziweiService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        gender: normalized.gender,
      });

      // Handle leap month (negative number)
      const isLeapMonth = validated.lunarMonth < 0;
      const actualMonth = Math.abs(validated.lunarMonth);

      // Get lunar month boundaries
      const monthParam = isLeapMonth ? -actualMonth : actualMonth;
      const lunarFirstDay = Lunar.fromYmd(validated.lunarYear, monthParam, 1);

      // Find last day of the month
      let lastDayNum = 29;
      try {
        Lunar.fromYmd(validated.lunarYear, monthParam, 30);
        lastDayNum = 30;
      } catch {
        // Month only has 29 days
      }
      const lunarLastDay = Lunar.fromYmd(validated.lunarYear, monthParam, lastDayNum);

      // Convert to solar dates
      const firstSolar = lunarFirstDay.getSolar();
      const lastSolar = lunarLastDay.getSolar();
      const startDate = new Date(firstSolar.getYear(), firstSolar.getMonth() - 1, firstSolar.getDay());
      const endDate = new Date(lastSolar.getYear(), lastSolar.getMonth() - 1, lastSolar.getDay());

      // Build daily list
      const dailyList: ZiweiDailyInfo[] = [];
      for (let day = 1; day <= lastDayNum; day++) {
        try {
          const lunarDay = Lunar.fromYmd(validated.lunarYear, monthParam, day);
          const solarDay = lunarDay.getSolar();
          const solarDate = new Date(solarDay.getYear(), solarDay.getMonth() - 1, solarDay.getDay());

          // Get daily info from calculator
          const dailyInfo = ziweiService.getDailyInfo(
            solarDay.getYear(),
            solarDay.getMonth(),
            solarDay.getDay()
          );

          dailyList.push({
            lunarMonth: actualMonth,
            lunarDay: day,
            isLeapMonth,
            gregorianDate: solarDate,
            ganzhi: dailyInfo ? `${dailyInfo.heavenlyStem}${dailyInfo.earthlyBranch}` : '',
            palaceIndex: dailyInfo?.palaceIndex || 0,
          });
        } catch (e) {
          // Skip invalid dates
        }
      }

      // Find Ming Gong
      const mingGongPalace = result.palaces?.find(p =>
        p.name === '命宮' || p.name === '命宫' || p.name === 'Life'
      );
      const mingGongStars = mingGongPalace?.majorStars?.map(s =>
        typeof s === 'string' ? s : s.name
      ) || [];

      // Get monthly palace
      const monthlyInfo = ziweiService.getMonthlyInfo(
        validated.lunarYear,
        actualMonth - 1,
        actualMonth,
        isLeapMonth
      );
      const monthlyPalace = monthlyInfo ? result.palaces?.[monthlyInfo.palaceIndex]?.name : undefined;

      // Calculate age for the target year (虛歲)
      const targetAge = validated.lunarYear - normalized.year + 1;

      // Find current decade (大限)
      let currentDecade: { palaceName: string; startAge: number; endAge: number } | undefined;
      if (result.decades && result.decades.length > 0) {
        const matchedDecade = result.decades.find(
          d => targetAge >= d.startAge && targetAge <= d.endAge
        );
        if (matchedDecade) {
          currentDecade = {
            palaceName: matchedDecade.palaceName || result.palaces?.[matchedDecade.palaceIndex]?.name || '未知',
            startAge: matchedDecade.startAge,
            endAge: matchedDecade.endAge,
          };
        }
      }

      // Calculate current yearly (流年)
      const yearlyInfo = YearlyCalculator.calculate(validated.lunarYear, normalized.year, result.palaces!);
      let currentYearly: { year: number; age: number; palaceName: string; heavenlyStem: string; earthlyBranch: string } | undefined;
      if (yearlyInfo) {
        const { stem: yearStem, branch: yearBranch } = getYearStemBranch(validated.lunarYear);
        currentYearly = {
          year: validated.lunarYear,
          age: targetAge,
          palaceName: result.palaces?.[yearlyInfo.palaceIndex]?.name || '未知',
          heavenlyStem: yearStem,
          earthlyBranch: yearBranch,
        };
      }

      // Current monthly info (流月)
      let currentMonthly: { month: number; palaceName: string; heavenlyStem?: string; earthlyBranch?: string } | undefined;
      if (monthlyInfo) {
        currentMonthly = {
          month: actualMonth,
          palaceName: result.palaces?.[monthlyInfo.palaceIndex]?.name || '未知',
          heavenlyStem: monthlyInfo.heavenlyStem,
          earthlyBranch: monthlyInfo.earthlyBranch,
        };
      }

      // Calculate current minor limit (小限)
      const minorLimitInfo = ziweiService.getMinorLimitInfo(normalized.year, validated.lunarYear);
      let currentMinorLimit: { age: number; palaceName: string; heavenlyStem: string; earthlyBranch: string } | undefined;
      if (minorLimitInfo) {
        currentMinorLimit = {
          age: minorLimitInfo.age,
          palaceName: result.palaces?.[minorLimitInfo.palaceIndex]?.name || '未知',
          heavenlyStem: minorLimitInfo.heavenlyStem,
          earthlyBranch: minorLimitInfo.earthlyBranch,
        };
      }

      // 计算小限四化和流月四化
      const enhancedMutagenInfo = { ...result.mutagenInfo };
      if (minorLimitInfo?.heavenlyStem) {
        enhancedMutagenInfo.minorLimit = MutagenCore.getMutagen(minorLimitInfo.heavenlyStem) || undefined;
      }
      if (monthlyInfo?.heavenlyStem) {
        enhancedMutagenInfo.monthly = MutagenCore.getMutagen(monthlyInfo.heavenlyStem) || undefined;
      }

      const options = {
        name: normalized.name,
        birthYear: normalized.year,
        birthMonth: normalized.month,
        birthDay: normalized.day,
        birthHour: normalized.hour,
        birthMinute: normalized.minute,
        gender: normalized.gender,
        mingGong: mingGongPalace?.name || '命宮',
        mingGongStars,
        palaces: result.palaces,
        mutagenInfo: enhancedMutagenInfo,
        lunarYear: validated.lunarYear,
        lunarMonth: actualMonth,
        isLeapMonth,
        gregorianStartDate: startDate,
        gregorianEndDate: endDate,
        monthlyPalace,
        currentDecade,
        currentMinorLimit,
        currentYearly,
        currentMonthly,
      };

      const text = renderZiweiLiuRiList(dailyList, options);

      return { content: [{ type: "text", text }], structuredContent: { liuRi: dailyList } };
    }

    // === 八字顯化指引 ===
    if (name === "bazi_manifestation") {
      const validated = BaziManifestationSchema.parse(args);
      const normalized = normalizeBirthInfo(validated);

      const result = await baziService.calculate({
        year: normalized.year,
        month: normalized.month,
        day: normalized.day,
        hour: normalized.hour,
        minute: normalized.minute,
        gender: normalized.gender,
        longitude: normalized.longitude,
        timezone: normalized.timezone,
        dstOffset: normalized.dstOffset,
        timezoneId: normalized.timezoneId,
        dayBoundaryMode: normalized.dayBoundaryMode,
      });

      if (!result.chart) {
        throw new Error("Failed to calculate BaZi chart");
      }

      const profile = mapBaziToManifestation(result, { targetYear: validated.targetYear });
      const text = renderManifestationText(profile);

      return { content: [{ type: "text", text }], structuredContent: { profile } };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    logger.error(`Tool ${name} failed`, error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// ============================================
// Start Server
// ============================================

// 讀取並解析 JSON 請求體（HTTP 模式用）
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    let aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      raw += chunk;
      if (raw.length > 4_000_000) {
        aborted = true;
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (aborted) return;
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", (error) => {
      if (aborted) return;
      reject(error);
    });
  });
}

// Streamable HTTP（stateless）入口：
// - sessionIdGenerator: undefined → 不發 session id，重啟/閒置都不會令 ChatGPT 端 session 失效
// - enableJsonResponse: true → 直接回單次 JSON，不開長 SSE stream，避開 Cloudflare Tunnel 的 idle timeout
// 單一 transport 連接一次，所有請求經 handleRequest 依 JSON-RPC id 對應回各自的 res。
async function startHttpServer(): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  const port = Number(process.env.PORT) || 8000;
  const mcpPath = process.env.MCP_PATH || "/mcp";

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url || "").split("?")[0];

    if (req.method === "GET" && (path === "/healthz" || path === "/health")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: SERVER_VERSION }));
      return;
    }

    if (path === mcpPath) {
      // Stateless 模式只需 POST（request/response）。GET（standalone SSE）與 DELETE（session
      // teardown）在 sessionIdGenerator=undefined 下無意義；尤其 DELETE 會令 transport.close()
      // 觸發，永久廢掉共享 transport（server 變死但 /healthz 仍回 200）。故一律只放行 POST。
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json", "Allow": "POST" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method Not Allowed: only POST is supported in stateless mode" },
          id: null,
        }));
        return;
      }
      try {
        const body = await readJsonBody(req);
        await transport.handleRequest(req, res, body);
      } catch (error) {
        logger.error("MCP HTTP request failed", error as Error);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          }));
        }
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(port, () => {
    logger.info(
      `Mingpan MCP server started (v${SERVER_VERSION}) — Streamable HTTP (stateless) on :${port}${mcpPath}`
    );
  });

  // Docker stop 先發 SIGTERM：先收掉新連線、放完手上請求才退出
  const shutdown = () => {
    logger.info("Shutting down MCP HTTP server...");
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

async function main() {
  const useHttp = process.argv.includes("--http") || process.env.MCP_HTTP === "1";
  if (useHttp) {
    await startHttpServer();
    return;
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`Mingpan MCP server started (v${SERVER_VERSION})`);
}

main().catch((error) => {
  logger.error("Server failed to start", error);
  process.exit(1);
});
