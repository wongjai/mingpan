/**
 * BaZi Service Type Definitions
 * Comprehensive types for the unified BaZi service
 */

// 真太陽時 / 時間校正明細與子時流派（單一真理來源於 core 層）
import type { SolarTimeInfo, DayBoundaryMode } from '../../core/bazi/types';
export type { SolarTimeInfo, DayBoundaryMode };

// Basic Types
export type Language = 'zh-TW' | 'zh-CN' | 'en' | 'ja';
export type Gender = 'male' | 'female';
export type DayMasterStrength = '衰极' | '身弱' | '偏弱' | '中和' | '偏强' | '身旺' | '旺极';

// Input Types
export interface BaziInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  gender?: Gender;
  longitude?: number; // For true solar time adjustment
  timezone?: number; // 出生鐘錶標準時區 UTC 偏移（小時），缺省 8（北京）
  dstOffset?: number; // 顯式夏令時偏移（小時）
  timezoneId?: string; // IANA 時區標識（如 'Asia/Shanghai'）
  dayBoundaryMode?: 'MIDNIGHT_00' | 'ZI_HOUR_23'; // 子時換日流派，缺省 MIDNIGHT_00
  name?: string; // Optional name for personal reference
  useLunar?: boolean; // Whether to use lunar calendar
  options?: BaziOptions;
}

export interface BaziOptions {
  includeEnhanced?: boolean;  // Include taro-bazi enhanced features
  includeShenSha?: boolean;   // Include Shen Sha analysis
  includeTraditional?: boolean; // Include traditional analysis (Yong Shen, Ge Ju)
  timeRange?: {              // For Da Yun and Liu Nian calculations
    startYear?: number;
    endYear?: number;
  };
  includeLiuYue?: boolean;    // Include monthly fortune (流月)
  liuYueOptions?: {
    year: number;             // Year for monthly calculations
    includeAllMonths?: boolean; // Calculate all 12 months or just current
  };
  includeLiuRi?: boolean;     // Include daily fortune (流日)
  liuRiOptions?: {
    year: number;
    month: number;            // Month for daily calculations
    includeHourly?: boolean;  // Include hourly analysis for each day
    singleDate?: Date;        // Calculate for single date only
  };
  language?: Language;
}

// Core Types
export type Stem = '甲' | '乙' | '丙' | '丁' | '戊' | '己' | '庚' | '辛' | '壬' | '癸';
export type Branch = '子' | '丑' | '寅' | '卯' | '辰' | '巳' | '午' | '未' | '申' | '酉' | '戌' | '亥';
export type FiveElement = '木' | '火' | '土' | '金' | '水';

// Chinese Date for calculations
export interface ChineseDate {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  isLeapMonth?: boolean;
}

// Core Data Structures
export interface BaziChart {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  hour: Pillar;
}

export interface Pillar {
  stem: string;      // 天干 (Heavenly Stem)
  branch: string;    // 地支 (Earthly Branch)
  hiddenStems?: HiddenStem[]; // 藏干
  naYin?: string;    // 纳音
  selfSitting?: string; // 自坐 (Self-sitting relationship)
  void?: boolean;    // 空亡 (Whether this branch is void)
  voidBranches?: string[]; // 空亡地支 (All void branches for this pillar)
}

export interface HiddenStem {
  stem: string;
  power: number;  // Power coefficient (0-1)
  isMain: boolean;
}

// Basic Analysis Types - 中文键符合TASK_000中文内联开发原则
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
  distribution?: '平衡' | '失衡' | '严重失衡';
}

export interface TenGodInfo {
  name: string;
  element: string;
  position: '年柱' | '月柱' | '日柱' | '時柱';
  strength: number;
  interpretation?: string;
}

export interface ShenShaInfo {
  name: string;
  type: '吉星' | '凶星' | '中性';
  position: string;
  description?: string;
}

// Enhanced Analysis Types (from taro-bazi)
export interface QuantitativeStrengthAnalysis {
  dayMasterStrength: DayMasterStrength;
  totalScore: number;
  breakdown: {
    base: number;           // 36-point base
    monthSupport: number;   // Monthly support
    stemSupport: number;    // Stem relationships
    branchSupport: number;  // Branch relationships
    seasonalAdjustment: number;
    branchInteractionAdjustment?: number; // Branch interaction adjustments
  };
  percentage: number;
  analysis: string;
  details?: Array<{
    category: 'base' | 'stem' | 'root' | 'interaction';
    item: string;
    score: number;
    adjustment: number;
    adjustmentString?: string; // Original adjustment description
    finalScore?: number; // Final score after adjustments
  }>;
  characteristics?: string[];
  recommendations?: string[];
}

export interface BranchRelations {
  clashes: RelationPair[];      // 冲
  combines: RelationPair[];     // 合
  harms: RelationPair[];        // 害
  punishments: RelationPair[];  // 刑
  destructions: RelationPair[]; // 破
  threeHarmony: string[][];     // 三合
  directional: string[][];      // 方合
}

export interface RelationPair {
  branch1: string;
  branch2: string;
  position1: string;
  position2: string;
  type: string;
  impact: '正面' | '负面' | '中性';
}

export interface ClimateAnalysis {
  temperature: '寒' | '凉' | '中性' | '暖' | '热';
  humidity: '燥' | '偏燥' | '平衡' | '偏湿' | '湿';
  season: string;
  adjustment: string;
  suggestions: string[];
}

export interface TwelveGrowthStage {
  stage: string;
  element: string;
  branch: string;
  meaning: string;
  strength: number;
}

// Traditional Analysis Types
export interface YongShenAnalysis {
  yongShen: string[];     // 用神
  xiShen: string[];       // 喜神
  jiShen: string[];       // 忌神
  xianShen: string[];     // 闲神
  explanation: string;
  recommendations?: YongShenRecommendations; // Actionable recommendations
}

export interface YongShenRecommendations {
  career: CareerRecommendations;
  lifestyle: LifestyleRecommendations;
  relationships: RelationshipRecommendations;
  health: HealthRecommendations;
  luck: LuckEnhancers;
  fengShui: FengShuiSuggestions;
}

export interface CareerRecommendations {
  favorableIndustries: string[]; // Translation keys
  avoidIndustries: string[]; // Translation keys
  idealRoles: string[]; // Translation keys
  workEnvironment: string[]; // Translation keys
  businessPartners: string[]; // Elements to seek in partners
  timing: string; // Best period for career moves
}

export interface LifestyleRecommendations {
  dailyHabits: string[]; // Translation keys
  exercises: string[]; // Translation keys
  hobbies: string[]; // Translation keys
  environment: string[]; // Translation keys
  diet: string[]; // Translation keys
  schedule: string; // Best daily rhythm
}

export interface RelationshipRecommendations {
  compatibleElements: string[]; // Elements
  communicationStyle: string[]; // Translation keys
  socialActivities: string[]; // Translation keys
  partnerQualities: string[]; // Translation keys
  conflictResolution: string[]; // Translation keys
  familyDynamics: string; // Translation key
}

export interface HealthRecommendations {
  preventiveMeasures: string[]; // Translation keys
  vulnerableAreas: string[]; // Translation keys
  exercises: string[]; // Translation keys
  dietaryGuidelines: string[]; // Translation keys
  seasonalCare: string[]; // Translation keys
  stressManagement: string[]; // Translation keys
}

export interface LuckEnhancers {
  colors: string[]; // Translation keys for color names
  numbers: number[]; // Lucky numbers
  directions: string[]; // Translation keys for directions
  seasons: string[]; // Translation keys for seasons
  timeOfDay: string[]; // Translation keys for time periods
  materials: string[]; // Translation keys for materials/textures
}

export interface FengShuiSuggestions {
  homeLayout: string[]; // Translation keys
  officeSetup: string[]; // Translation keys
  sleepDirection: string; // Translation key
  decorElements: string[]; // Translation keys
  plants: string[]; // Translation keys
  avoidPlacements: string[]; // Translation keys
}

export interface GeJuAnalysis {
  pattern: string;        // 格局
  type: string;
  quality: '优秀' | '良好' | '一般' | '较差';
  description: string;
}

// Time-based Analysis Types
export interface DaYun {
  index: number;
  startAge: number;
  endAge: number;
  startYear: number;
  endYear: number;
  stem: string;
  branch: string;
  tenGod: string;
  analysis?: DaYunAnalysis;
  voidBranches?: string[]; // 空亡地支 for this period
}

export interface DaYunAnalysis {
  fortune: '优秀' | '良好' | '一般' | '挑战' | '困难';
  career: FortunePrediction;
  wealth: FortunePrediction;
  relationships: FortunePrediction;
  health: FortunePrediction;
  suggestions: string[];
}

export interface LiuNian {
  year: number;
  age: number;
  stem: string;
  branch: string;
  zodiac: string;
  tenGod: string;
  analysis?: LiuNianAnalysis;
}

export interface LiuNianAnalysis {
  overall: '优秀' | '良好' | '一般' | '挑战';
  events: string[];
  warnings: string[];
  opportunities: string[];
}

export interface FortunePrediction {
  rating: number; // 1-10
  trend: '上升' | '稳定' | '下降';
  description: string;
}

// Liu Yue (Monthly) Types
export interface LiuYueInfo {
  month: number;
  stem: Stem;
  branch: Branch;
  startDate: Date;
  endDate: Date;
  fortune: string;
  rating: number;
  mainInfluences: string[];
  opportunities: string[];
  challenges: string[];
  recommendations: string[];
  healthFocus: string[];
  luckyDays: number[];
  solarTerm?: {
    name: string;
    date: Date;
  };
}

export interface LiuYue {
  year: number;
  month: number;
  stem: string;
  branch: string;
  tenGod: string;
  element: string;
  season: string;
  analysis?: LiuYueAnalysis;
}

export interface LiuYueAnalysis {
  overall: '优秀' | '良好' | '一般' | '挑战';
  career: FortunePrediction;
  wealth: FortunePrediction;
  relationships: FortunePrediction;
  health: HealthIndicator;
  luckyDays: number[];
  unluckyDays: number[];
  activities: ActivitySuggestion[];
  elementBalance: ElementShift;
  monthlyTheme: string;
}

export interface HealthIndicator {
  stressLevel: 'low' | 'moderate' | 'high';
  vulnerableAreas: string[];
  preventiveMeasures: string[];
  energyLevel: number; // 1-10
}

export interface ActivitySuggestion {
  type: 'travel' | 'negotiation' | 'investment' | 'relationship' | 'study' | 'rest' | 'medical';
  favorability: '大吉' | '吉' | '中性' | '凶';
  reason: string;
}

export interface ElementShift {
  dominant: string;
  trend: '增强' | '减弱' | '稳定';
  impact: string;
}

// Liu Ri (Daily) Types
export interface LiuRiInfo {
  date: Date;
  day: number;
  stem: Stem;
  branch: Branch;
  fortune: string;
  rating: number;
  mainInfluences: string[];
  activities: {
    favorable: string[];
    avoid: string[];
  };
  luckyHours: number[];
  hourlyFortunes: Array<{
    hour: string;
    branch: Branch;
    rating: number;
    activity: string;
  }>;
  energy: string;
  mood: string;
  opportunities: string[];
  warnings: string[];
}

export interface LiuRi {
  date: Date;
  stem: string;
  branch: string;
  tenGod: string;
  element: string;
  analysis?: LiuRiAnalysis;
}

export interface LiuRiAnalysis {
  rating: number; // 1-10 quick daily rating
  quality: '优秀' | '良好' | '一般' | '挑战' | '困难';
  activities: DailyActivity[];
  hourlyAnalysis?: HourlyAnalysis[];
  almanacInfo: AlmanacInfo;
  quickTips: string[];
  elementalFlow: ElementalFlow;
  biorhythm: BiorhythmIndicator;
}

export interface DailyActivity {
  activity: string; // Translation key for activity type
  suitability: '大宜' | '宜' | '中性' | '忌' | '大忌';
  bestHours?: number[]; // 0-23 hours
  reason?: string; // Translation key
}

export interface HourlyAnalysis {
  hour: number; // 0-23
  stem: string;
  branch: string;
  quality: '优秀' | '良好' | '中性' | '较差';
  activities: string[]; // Suitable activities for this hour
}

export interface AlmanacInfo {
  suitable: string[]; // 宜 - Suitable activities (translation keys)
  avoid: string[]; // 忌 - Activities to avoid (translation keys)
  auspiciousHours: number[]; // Lucky hours
  inauspiciousHours: number[]; // Unlucky hours
  conflictZodiac?: string; // Zodiac sign in conflict today
}

export interface ElementalFlow {
  dominant: string; // Dominant element of the day
  interaction: '和谐' | '中性' | '冲突';
  advice: string; // Translation key for elemental advice
}

export interface BiorhythmIndicator {
  physical: number; // 1-10
  emotional: number; // 1-10
  intellectual: number; // 1-10
  overall: number; // 1-10
}

// Main Result Type
export interface BaziResult {
  // Core Data
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
    solarTimeInfo?: SolarTimeInfo;
    warnings?: string[];
  };

  // Basic Analysis
  basic: {
    zodiac: string;
    dayMaster: string;
    dayMasterElement: string;
    naYin: NaYinInfo;
    naYinAnalysis?: any; // Detailed NaYin analysis from NaYinAnalyzer
    fiveElements: FiveElementsAnalysis;
    tenGods: TenGodInfo[];
    shenSha?: ShenShaInfo[];
  };
  
  // Traditional Analysis
  traditional?: {
    yongShen: YongShenAnalysis;
    geJu: GeJuAnalysis;
    strength: DayMasterStrength;
  };
  
  // Enhanced Analysis (taro-bazi features)
  enhanced?: {
    strengthAnalysis: QuantitativeStrengthAnalysis;
    hiddenStems: HiddenStemsAnalysis;
    twelveGrowthStages: TwelveGrowthStage[];
    voidBranches: string[];
    branchRelations: any; // Using RelationsResult from analyzer
    climate: ClimateAnalysis;
    monthStrength: number;
    patternAnalysis?: any; // PatternAnalysisResult from analyzer
  };
  
  // Time-based Analysis
  timeBased: {
    daYun: DaYun[];
    currentDaYun?: DaYun;
    liuNian?: LiuNian[];
    currentLiuNian?: LiuNian;
    liuYue?: LiuYue[];        // Monthly fortune
    currentLiuYue?: LiuYue;   // Current month
    liuRi?: LiuRi[];          // Daily fortune
    todayLiuRi?: LiuRi;       // Today's fortune
  };
  
  // Metadata
  meta: {
    calculatedAt: Date;
    version: string;
    options: BaziOptions;
    luckSequence?: any; // Luck sequence information from LuckCycleCalculator
  };
}

// Supporting Types
export interface LunarDate {
  year: number;
  month: number;
  day: number;
  hour?: number;
  isLeapMonth: boolean;
  yearName?: string;
  monthName?: string;
  dayName?: string;
}

export interface NaYinInfo {
  name: string;
  element: string;
  meaning: string;
}

export interface HiddenStemsAnalysis {
  total: number;
  byElement: Record<string, number>;
  mainQi: string[];
  residualQi: string[];
}

// Service Configuration
export interface BaziServiceConfig {
  defaultLanguage?: Language;
  enableCaching?: boolean;
  debug?: boolean;
  // When true, compute continues with safe fallbacks instead of throwing.
  // Use strictly for share rendering to avoid breaking UX.
  lenient?: boolean;
}

// Error Types
export class BaziCalculationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'BaziCalculationError';
  }
}

// Translation Types
export interface TranslatedBaziResult extends BaziResult {
  translations: {
    stems: Record<string, string>;
    branches: Record<string, string>;
    elements: Record<string, string>;
    tenGods: Record<string, string>;
    shenSha?: Record<string, string>;
  };
}

// Compatibility Types for Components
// These types are designed to make component usage easier while maintaining consistency

/**
 * Birth information for BaZi calculation
 * Compatible with component forms
 */
export interface BirthInfo {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  gender: 'male' | 'female';
  name?: string;
  isLunar?: boolean;
  longitude?: number;
}

/**
 * Simple BaZi pillar for display components
 */
export interface BaziPillar {
  stem: string;
  branch: string;
}

/**
 * Five elements count for components
 * Uses English property names for language independence
 */
export interface FiveElementsCount {
  木: number;
  火: number;
  土: number;
  金: number;
  水: number;
}

/**
 * Simplified BaZi analysis for components
 * This is a flattened version of BaziResult for easier component usage
 */
export interface BaziAnalysis {
  // Core data
  chart: BaziChart;
  birthInfo: BirthInfo;
  
  // Basic info
  zodiac: string;
  dayMaster: string;
  dayMasterElement: string;
  
  // Analysis data
  fiveElements: FiveElementsCount;
  tenGods: TenGodRelation[];
  shenSha: ShenShaInfo[];
  strength?: '身弱' | '正格' | '身旺';
  
  // Time-based
  daYun: DaYun[];
  lunarInfo: LunarDate;
  
  // Traditional analysis
  yongShenAnalysis?: YongShenAnalysis;
  geJuAnalysis?: GeJuAnalysis;
  
  // Enhanced analysis
  elementStrengths?: any;
  elementBalance?: any;
  advancedAnalysis?: any;
  strengthAnalysis?: any;
  
  // Current fortune
  daYunAnalysis?: SimpleDaYunAnalysis;
  currentLiuNian?: LiuNianAnalysis;
}

/**
 * Ten god relation for components
 */
export interface TenGodRelation {
  god: string;
  element: string;
  strength: number;
  position: string;
  stem: string;
}

/**
 * Simple Da Yun analysis
 */
export interface SimpleDaYunAnalysis {
  period: string;
  stem: string;
  branch: string;
  ganRelation: string;
  influence: string;
  description: string;
}

/**
 * Converter functions to transform between service types and component types
 */
export class BaziTypeConverter {
  /**
   * Convert BirthInfo to BaziInput
   */
  static toBaziInput(birthInfo: BirthInfo): BaziInput {
    return {
      year: birthInfo.year,
      month: birthInfo.month,
      day: birthInfo.day,
      hour: birthInfo.hour,
      minute: birthInfo.minute,
      gender: birthInfo.gender as Gender,
      longitude: birthInfo.longitude,
      options: {
        includeEnhanced: true,
        includeShenSha: true,
        includeTraditional: true
      }
    };
  }

  /**
   * Convert BaziResult to BaziAnalysis
   */
  static toBaziAnalysis(result: BaziResult, birthInfo: BirthInfo): BaziAnalysis {
    return {
      chart: result.chart,
      birthInfo,
      zodiac: result.basic.zodiac,
      dayMaster: result.basic.dayMaster,
      dayMasterElement: result.basic.dayMasterElement,
      fiveElements: {
        木: result.basic.fiveElements.木,
        火: result.basic.fiveElements.火,
        土: result.basic.fiveElements.土,
        金: result.basic.fiveElements.金,
        水: result.basic.fiveElements.水
      },
      tenGods: result.basic.tenGods.map(tg => ({
        god: tg.name,
        element: tg.element,
        position: tg.position as string,
        strength: tg.strength,
        stem: ''
      })),
      shenSha: result.basic.shenSha || [],
      strength: this.mapStrength(result.traditional?.strength),
      daYun: result.timeBased.daYun,
      lunarInfo: result.birthInfo.lunar,
      yongShenAnalysis: result.traditional?.yongShen,
      geJuAnalysis: result.traditional?.geJu,
      elementStrengths: result.enhanced?.strengthAnalysis,
      elementBalance: result.basic.fiveElements.balance,
      advancedAnalysis: {
        hiddenStems: result.enhanced?.hiddenStems,
        twelveGrowthStages: result.enhanced?.twelveGrowthStages,
        voidBranches: result.enhanced?.voidBranches,
        branchRelations: result.enhanced?.branchRelations,
        climate: result.enhanced?.climate,
        monthStrength: result.enhanced?.monthStrength
      },
      strengthAnalysis: result.enhanced?.strengthAnalysis
    };
  }

  /**
   * Map strength values
   */
  private static mapStrength(strength?: DayMasterStrength): '身弱' | '正格' | '身旺' | undefined {
    if (!strength) return undefined;
    
    const mapping: Record<DayMasterStrength, '身弱' | '正格' | '身旺'> = {
      '衰极': '身弱',
      '身弱': '身弱',
      '偏弱': '身弱',
      '中和': '正格',
      '偏强': '身旺',
      '身旺': '身旺',
      '旺极': '身旺'
    };
    
    return mapping[strength];
  }

  /**
   * Convert simple pillar to full pillar
   */
  static toFullPillar(pillar: BaziPillar): Pillar {
    return {
      stem: pillar.stem,
      branch: pillar.branch
    };
  }

  /**
   * Convert full pillar to simple pillar
   */
  static toSimplePillar(pillar: Pillar): BaziPillar {
    return {
      stem: pillar.stem,
      branch: pillar.branch
    };
  }
}
