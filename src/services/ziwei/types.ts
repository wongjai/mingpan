/**
 * 紫微斗数服务统一类型定义
 * 所有紫微相关的类型都在这里定义，避免重复和混乱
 */

// ==================== 输入类型 ====================

export interface ZiweiInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  gender: 'male' | 'female';
  language?: string;  // 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP'
}

// ==================== 基础类型 ====================

export interface StemBranch {
  stem: string;      // 天干
  branch: string;    // 地支
}

export interface FourPillars {
  year: StemBranch;
  month: StemBranch;
  day: StemBranch;
  hour: StemBranch;
}

export interface BasicInfo {
  zodiac: string;           // 生肖
  constellation: string;    // 星座
  fourPillars: FourPillars; // 四柱
  fiveElement: string;      // 五行局
  soul: string;             // 命主
  body: string;             // 身主
}

// ==================== 星曜类型 ====================

export interface Star {
  name: string;             // 星曜名称
  brightness?: string;      // 亮度（庙旺得利平不陷）
  type: 'major' | 'minor' | 'auxiliary' | 'flower' | 'helper';  // 主星/辅星/杂曜/桃花星/解神
  scope?: string;           // 范围：origin(本命) / decadal(大限) / yearly(流年)
}

export interface StarWithMutagen extends Star {
  mutagen?: string[];       // 四化标记 ['本禄', '限权', '年科']
}

// 流曜类型
export interface HoroscopeStar {
  name: string;             // 流曜名称 (流昌、流曲、流魁、流钺等)
  type: 'soft' | 'tough' | 'flower' | 'helper';  // 吉星/凶星/桃花/解神
  scope: 'yearly' | 'decadal' | 'monthly' | 'daily' | 'hourly';  // 作用范围
}

// ==================== 宫位类型 ====================

export interface Palace {
  name: string;               // 宫位名称
  index: number;              // 宫位索引 (0-11)
  position: number;           // 命盘位置 (0-11)
  earthlyBranch: string;      // 地支
  heavenlyStem: string;       // 天干
  majorStars: StarWithMutagen[];    // 主星
  minorStars: StarWithMutagen[];    // 辅星（包含杂曜）
  horoscopeStars?: HoroscopeStar[]; // 流曜
  isBodyPalace?: boolean;     // 是否为身宫
  extras?: {                  // 额外信息
    changsheng12?: string;    // 长生十二宫
    boshi12?: string;         // 博士十二宫
    jiangqian12?: string;     // 将前十二宫
    suiqian12?: string;       // 岁前十二宫
    ages?: number[];          // 小限年龄序列
  };
}

// ==================== 大限类型 ====================

export interface DecadeInfo {
  index: number;              // 大限索引 (0-11)
  palaceIndex: number;        // 对应的宫位索引
  startAge: number;           // 起始年龄（虚岁）
  endAge: number;             // 结束年龄（虚岁）
  heavenlyStem: string;       // 大限天干
  earthlyBranch: string;      // 大限地支
  palaceName: string;         // 大限宫位名称
  label: string;              // 显示标签
  stars?: (string | HoroscopeStar)[][];  // 大限流曜 (12宫位数组)
}

// ==================== 流年类型 ====================

export interface YearlyInfo {
  year: number;               // 年份
  age: number;                // 虚岁
  heavenlyStem: string;       // 流年天干
  earthlyBranch: string;      // 流年地支
  palaceIndex: number;        // 流年命宫位置
  stars?: (string | HoroscopeStar)[][];  // 流年流曜 (12宫位数组)
}

// ==================== 小限类型 ====================

export interface MinorLimitInfo {
  age: number;                // 虚岁
  year: number;               // 年份
  palaceIndex: number;        // 小限命宫位置
  heavenlyStem: string;       // 小限天干
  earthlyBranch: string;      // 小限地支
  palaceNames?: string[];     // 小限十二宫排列
  mutagen?: string[];         // 小限四化（化禄、化权、化科、化忌星曜）
}

// ==================== 四化类型 ====================

export interface MutagenInfo {
  lu?: string;                // 化禄星曜
  quan?: string;              // 化权星曜
  ke?: string;                // 化科星曜
  ji?: string;                // 化忌星曜
}

export interface CompleteMutagenInfo {
  natal: MutagenInfo;         // 本命四化
  decadal?: MutagenInfo;      // 大限四化
  minorLimit?: MutagenInfo;   // 小限四化
  yearly?: MutagenInfo;       // 流年四化
  monthly?: MutagenInfo;      // 流月四化
  daily?: MutagenInfo;        // 流日四化
  hourly?: MutagenInfo;       // 流时四化
  combined: Map<string, string[]>;  // 合并的四化信息
}

// ==================== 运限类型 ====================

export interface HoroscopeInfo {
  decadal?: {
    index: number;
    heavenlyStem: string;
    earthlyBranch: string;
    palaceNames?: string[];
    mutagen?: MutagenInfo;
    startAge?: number;
    endAge?: number;
  };
  yearly?: {
    heavenlyStem: string;
    earthlyBranch: string;
    palaceNames?: string[];
    mutagen?: MutagenInfo;
    yearlyDecStar?: any[];
  };
  monthly?: any;
  daily?: any;
}

// ==================== 增强宫位类型（用于显示） ====================

export interface EnhancedPalace extends Palace {
  // 大限信息
  decadeInfo?: {
    startAge: number;
    endAge: number;
    isCurrent?: boolean;
  };
  
  // 动态宫位名称
  dynamicNames?: {
    decadal?: string;       // 大限时的名称（如"限财帛"）
    yearly?: string;        // 流年时的名称（如"年官禄"）
  };
  
  // 高亮状态
  isDecadeHighlight?: boolean;  // 是否为选中的大限宫位
  isYearlyHighlight?: boolean;  // 是否为选中的流年宫位
  
  // 小限年龄
  minorLimitAges?: number[];
}

// ==================== 最终结果类型 ====================

export interface ZiweiResult {
  // 基本信息
  basicInfo: BasicInfo;
  
  // 日期信息
  solarDate: string;          // 阳历日期
  lunarDate: {                // 农历日期
    year: number;
    month: number;
    day: number;
    isLeapMonth: boolean;
  };
  
  // 十二宫位
  palaces: EnhancedPalace[];
  
  // 大限信息
  decades: DecadeInfo[];
  currentDecade?: DecadeInfo;
  
  // 流年信息（如果请求）
  yearlyInfo?: YearlyInfo;
  
  // 四化信息
  mutagenInfo?: CompleteMutagenInfo;
  
  // 其他信息
  gender: 'male' | 'female';
  birthYear: number;
  language: string;
}

// ==================== 服务配置类型 ====================

export interface ZiweiServiceConfig {
  language?: string;
  includeYearlyInfo?: boolean;
  includeMutagenInfo?: boolean;
  debug?: boolean;
  targetYear?: number;  // 目标年份，用于计算特定年份的运限信息
}

// ==================== 错误类型 ====================

export class ZiweiCalculationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ZiweiCalculationError';
  }
}

// ==================== 工具类型 ====================

export type PalacePosition = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface BranchPosition {
  branch: string;
  position: PalacePosition;
}

// 地支位置映射
export const BRANCH_POSITIONS: Record<string, { row: number; col: number }> = {
  '巳': { row: 0, col: 0 }, '午': { row: 0, col: 1 }, '未': { row: 0, col: 2 }, '申': { row: 0, col: 3 },
  '酉': { row: 1, col: 3 }, '戌': { row: 2, col: 3 }, '亥': { row: 3, col: 3 }, '子': { row: 3, col: 2 },
  '丑': { row: 3, col: 1 }, '寅': { row: 3, col: 0 }, '卯': { row: 2, col: 0 }, '辰': { row: 1, col: 0 }
};

// 宫位名称（按顺序 - 顺时针方向）
export const PALACE_NAMES = [
  '命宮', '父母', '福德', '田宅', '官祿', '交友',
  '遷移', '疾厄', '財帛', '子女', '夫妻', '兄弟'
];

// 英文宫位名称（顺时针方向）
export const PALACE_NAMES_EN = [
  'Life', 'Parents', 'Fortune', 'Property', 'Career', 'Friends',
  'Travel', 'Health', 'Wealth', 'Children', 'Marriage', 'Siblings'
];

// ==================== 常量 ====================

export const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 时辰对应地支索引
export const HOUR_TO_INDEX: Record<number, number> = {
  23: 0, 0: 0,   // 子（23時晚子：0=不換日用當日／12=換日用次日，屬流派選擇）
  1: 1, 2: 1,    // 丑
  3: 2, 4: 2,    // 寅
  5: 3, 6: 3,    // 卯
  7: 4, 8: 4,    // 辰
  9: 5, 10: 5,   // 巳
  11: 6, 12: 6,  // 午
  13: 7, 14: 7,  // 未
  15: 8, 16: 8,  // 申
  17: 9, 18: 9,  // 酉
  19: 10, 20: 10,// 戌
  21: 11, 22: 11 // 亥
};