/**
 * 時間歸一化工具
 * 
 * 設計原則：
 * 1. 當前階段統一使用北京時間（UTC+8），不對外暴露時區參數
 * 2. 農曆輸入在入口層即轉換為公曆，內部計算統一走公曆
 * 
 * TODO: 多時區支持（M4 里程碑）
 * - 新增 timezone 參數
 * - 引入 date-fns-tz 或 @js-temporal/polyfill
 */

import { Lunar } from 'lunar-javascript';

// ============================================
// Constants
// ============================================

/** 北京時區 IANA 標識（內部使用） */
export const BEIJING_TZ = 'Asia/Shanghai';

// ============================================
// Types
// ============================================

export interface BirthDateTimeInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  isLunar?: boolean;
}

export interface NormalizedBirthDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 標記原始輸入是否為農曆（用於輸出顯示） */
  isLunarInput: boolean;
}

// ============================================
// Functions
// ============================================

/**
 * 歸一化出生日期時間
 * 
 * 處理邏輯：
 * 1. 補齊 minute 默認值
 * 2. 如果是農曆輸入，轉換為公曆
 * 
 * @example
 * // 公曆輸入
 * normalizeBirthDateTime({ year: 1990, month: 5, day: 15, hour: 10 })
 * // { year: 1990, month: 5, day: 15, hour: 10, minute: 0, isLunarInput: false }
 * 
 * // 農曆輸入
 * normalizeBirthDateTime({ year: 1990, month: 4, day: 21, hour: 10, isLunar: true })
 * // { year: 1990, month: 5, day: 15, hour: 10, minute: 0, isLunarInput: true }
 */
/**
 * 驗證公曆日期真實存在。JS Date 會將 2/30 靜默滾去 3/2（rollover），
 * 令打錯日期的用戶攞到一張錯盤而毫無警告 —— 這裡直接報錯。
 */
export function assertValidSolarDate(year: number, month: number, day: number): void {
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    throw new Error(`無效的公曆日期：${year}年${month}月${day}日不存在，請檢查輸入`);
  }
}

export function normalizeBirthDateTime(input: BirthDateTimeInput): NormalizedBirthDateTime {
  const minute = input.minute ?? 0;
  const isLunarInput = !!input.isLunar;

  // 公曆輸入：先驗證日期真實存在（Date 會將 2/30 靜默滾去 3/2，造成無警告錯盤）
  if (!isLunarInput) {
    assertValidSolarDate(input.year, input.month, input.day);
    return {
      year: input.year,
      month: input.month,
      day: input.day,
      hour: input.hour,
      minute,
      isLunarInput,
    };
  }

  // 農曆輸入：轉換為公曆
  // 注意：lunar-javascript 的 fromYmd 不處理閏月，閏月需要用 fromYmdHms 的第二個參數
  // 當前簡化處理，閏月按本月算（與梅花易數口徑一致）
  const lunar = Lunar.fromYmd(input.year, input.month, input.day);
  const solar = lunar.getSolar();

  return {
    year: solar.getYear(),
    month: solar.getMonth(),
    day: solar.getDay(),
    hour: input.hour,
    minute,
    isLunarInput,
  };
}
