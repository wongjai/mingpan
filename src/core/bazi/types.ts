/**
 * Core BaZi Types
 * Domain models for BaZi calculations - language agnostic
 */

// Basic pillar structure
export interface Pillar {
  stem: string;      // 天干
  branch: string;    // 地支
  hiddenStems?: HiddenStem[];
  naYin?: string;
  selfSitting?: string; // 自坐 (Self-sitting relationship)
  void?: boolean;    // 空亡 (Whether this branch is void)
  voidBranches?: string[]; // 空亡地支 (All void branches for this pillar)
}

export interface HiddenStem {
  stem: string;
  power: number;     // 0-1
  isMain: boolean;
}

// BaZi chart structure
export interface BaziChart {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  hour: Pillar;
}

// Five elements analysis - 中文键符合TASK_000中文内联开发原则
export interface FiveElementsAnalysis {
  木: number;
  火: number;
  土: number;
  金: number;
  水: number;
  total: number;
  balance: ElementBalance;
}

export interface ElementBalance {
  strongest: string;
  weakest: string;
  missing: string[];
  percentage?: Record<string, number>;
  distribution?: '平衡' | '失衡' | '严重失衡';
}

// Advanced analysis types
export interface TwelveGrowthStage {
  stage: string;
  element: string;
  branch: string;
  meaning: string;
  strength: number;
  power?: number;
  state?: string;
}

export interface NaYinInfo {
  name: string;
  element: string;
  meaning: string;
}

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  hour: number;
  isLeapMonth: boolean;
  monthName?: string;
  dayName?: string;
}

// 子時換日流派
export type DayBoundaryMode = 'MIDNIGHT_00' | 'ZI_HOUR_23';

// 真太陽時 / 時間校正明細（供 output 審計）
export interface SolarTimeInfo {
  applied: boolean;                    // 是否套用了任何時間校正（經度/均時差/夏令時）
  standardMeridian: number;            // 標準經線（度）
  longitudeCorrectionMinutes: number;  // 經度修正（分鐘）
  equationOfTimeMinutes: number;       // 均時差（分鐘）
  dstOffsetMinutes: number;            // 夏令時扣減（分鐘）
  totalCorrectionMinutes: number;      // 總修正（分鐘）
  standardOffsetHours: number;         // 標準時區偏移（小時）
  timezoneBasis: string;               // 時區依據：default-beijing | offset:N | iana:ID
  assumedTimezone: boolean;            // 是否假設了北京時間（未提供時區但有經度）
  dayBoundaryMode: DayBoundaryMode;    // 子時換日流派
}

// Input/Output types for BaziCore
export interface BaziCoreInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  gender?: 'male' | 'female';
  isLunar?: boolean;
  longitude?: number;
  /** 出生鐘錶標準時區 UTC 偏移（小時），缺省 8（北京） */
  timezone?: number;
  /** 顯式夏令時偏移（小時） */
  dstOffset?: number;
  /** IANA 時區標識（如 'Asia/Shanghai'） */
  timezoneId?: string;
  /** 子時換日流派，缺省 MIDNIGHT_00（與歷史行為一致） */
  dayBoundaryMode?: DayBoundaryMode;
}

export interface BaziCoreResult {
  chart: BaziChart;
  birthInfo: {
    solar: Date;
    lunar: LunarDate;
    trueSolarTime?: Date;
    solarTerm?: string;
    adjacentSolarTermTime?: {
      previous: string;
      next: string;
    };
    /** 真太陽時 / 時間校正明細 */
    solarTimeInfo?: SolarTimeInfo;
    /** 計算過程的提示（如未提供時區已假設北京時間） */
    warnings?: string[];
  };
  zodiac: string;
  dayMasterElement: string;
  naYin: NaYinInfo;
  fiveElements: FiveElementsAnalysis;
  voidBranches?: string[];
  twelveGrowthStages?: TwelveGrowthStage[];
}

// Strength analysis (for components that need it)
export interface ElementStrength {
  element: string;
  state: string;
  count: number;
  percentage: number;
  stemSupport: number;
  branchSupport: number;
  strength: number;
  totalScore: number;
}

export interface ElementBalanceAnalysis {
  supportingElements: string[];
  suppressingElements: string[];
  dominantElement: string;
  weakestElement: string;
  balanced: boolean;
  balance: '平衡' | '失衡' | '高度失衡';
  analysis: string;
  dominant?: string;
  lacking?: string;
  suggestions: string[];
}