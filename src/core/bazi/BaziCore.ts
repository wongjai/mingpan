/**
 * BaZi Core Calculator
 * Enhanced with taro-bazi astronomical calculations
 * Language-agnostic core calculations
 */

import { 
  BaziChart, 
  Pillar, 
  HiddenStem,
  FiveElementsAnalysis,
  ElementBalance,
  TwelveGrowthStage,
  NaYinInfo,
  LunarDate,
  BaziCoreInput,
  BaziCoreResult,
  DayBoundaryMode,
  SolarTimeInfo
} from './types';
import { HEAVENLY_STEMS, EARTHLY_BRANCHES, FIVE_ELEMENTS, HIDDEN_STEMS, NA_YIN, GROWTH_STAGE_MAPPING } from '../../core/constants/bazi';
import { TrueSolarTime } from './TrueSolarTime';
import { 
  getSolarTermInfo, 
  calculateSolarTerm, 
  getAdjacentSolarTermTime,
  SOLAR_TERMS,
  SOLAR_TERM_TO_ZHI
} from './SolarTermCalculator';

// Import necessary utilities from existing code
import { PreciseCalendar } from '../../core/calendar/calendar';
import { Solar, Lunar } from 'lunar-javascript';

// Define CalendarDate interface
interface CalendarDate {
  year: number;
  month: number;
  day: number;
  hour: number;
}

// Define solar term info interface
interface SolarTermData {
  solarTerm: string;
  isCurrentMonthSolarTerm: boolean;
  adjacentSolarTermTime?: {
    previous: string;
    next: string;
  };
}

export class BaziCore {
  constructor() {
    // PreciseCalendar uses static methods, no need to instantiate
  }
  
  /**
   * Main calculation method
   * Calculates the four pillars based on birth information
   */
  async calculate(input: BaziCoreInput): Promise<BaziCoreResult> {
    // Step 1: Create date object
    let birthDate = new Date(
      input.year,
      input.month - 1,
      input.day,
      input.hour,
      input.minute || 0
    );
    
    // Step 2: Apply true solar time (longitude) and/or DST clock correction.
    //   真太陽時 = 平太陽時 + 經度差 + 均時差（Jean Meeus）− 夏令時。
    //   即使無經度，夏令時（如中國 1986–1991）仍會校正鐘錶時間，再餵入四柱計算。
    //   未提供時區時假設北京時間（UTC+8 / 120°E），與歷史行為一致。
    const dayBoundaryMode: DayBoundaryMode = input.dayBoundaryMode ?? 'MIDNIGHT_00';
    const tstDetail = TrueSolarTime.adjustWithDetail(birthDate, input.longitude, {
      timezone: input.timezone,
      dstOffset: input.dstOffset,
      timezoneId: input.timezoneId,
    });
    let trueSolarTime: Date | undefined;
    if (input.longitude !== undefined) {
      trueSolarTime = tstDetail.adjusted;
    }
    // 任何非零校正（經度/均時差/夏令時）都套用到後續四柱計算；總修正為 0 時 instant 不變（向後兼容）。
    birthDate = tstDetail.adjusted;

    const warnings: string[] = [];
    if (tstDetail.assumedTimezone) {
      warnings.push('未提供時區，已假設 UTC+8 北京時間；海外出生請補 timezone/timezoneId 以準確校正真太陽時。');
    }
    const solarTimeInfo: SolarTimeInfo = {
      applied: input.longitude !== undefined || tstDetail.totalCorrectionMinutes !== 0,
      standardMeridian: tstDetail.standardMeridian,
      longitudeCorrectionMinutes: tstDetail.longitudeCorrectionMinutes,
      equationOfTimeMinutes: tstDetail.equationOfTimeMinutes,
      dstOffsetMinutes: tstDetail.dstOffsetMinutes,
      totalCorrectionMinutes: tstDetail.totalCorrectionMinutes,
      standardOffsetHours: tstDetail.standardOffsetHours,
      timezoneBasis: tstDetail.timezoneBasis,
      assumedTimezone: tstDetail.assumedTimezone,
      dayBoundaryMode,
    };
    
    // Step 3: Calculate solar terms using lunar-javascript
    const solar = Solar.fromYmdHms(
      birthDate.getFullYear(),
      birthDate.getMonth() + 1,
      birthDate.getDate(),
      birthDate.getHours(),
      birthDate.getMinutes(),
      birthDate.getSeconds()
    );
    const lunar = solar.getLunar();
    // Get the previous Jie to determine the current month
    const prevJie = lunar.getPrevJie();
    const solarTerm = prevJie ? prevJie.getName() : '立春'; // Default to LiChun if no term found
    
    // Calculate if it's current month solar term
    const monthZhi = SOLAR_TERM_TO_ZHI[solarTerm] || '卯';
    const isCurrentMonthSolarTerm = true; // Simplified for now
    
    // Get adjacent solar term times (simplified)
    const adjacentSolarTermTime = {
      previous: '',
      next: ''
    };
    
    // Step 4: Calculate four pillars with solar term consideration
    // 四柱改用 lunar getEightChar()（基於已含真太陽時調整的 birthDate），一次過：
    // - 🔴-1：真太陽時實際餵入年/月/日/時柱（原 calculateHoroscope 用未調整的 input.*）
    // - 🔴-2：setSect(2) 子時不換日（用戶選定流派；實證 lunar-javascript sect=2=當日、sect=1=次日）
    // - 年柱用實際出生日（原 calculateYearPillar 用月中 15 號，立春前後會錯）
    // - 月柱/換月統一走 lunar 高精度節氣
    const eightChar = lunar.getEightChar();
    // dayBoundaryMode 控制子時換日：
    //   MIDNIGHT_00（缺省，sect=2）= 子時不換日，晚子時屬當日（mingpan 歷史標準）
    //   ZI_HOUR_23（sect=1）        = 23:00 即換日，晚子時屬次日子時
    eightChar.setSect(dayBoundaryMode === 'ZI_HOUR_23' ? 1 : 2);
    const chart = this.buildChartFromEightChar(eightChar, birthDate.getHours());
    
    // Step 5: Get lunar date (already calculated above)
    const rawMonth = lunar.getMonth();
    const lunarDate: LunarDate = {
      year: lunar.getYear(),
      month: Math.abs(rawMonth),
      day: lunar.getDay(),
      hour: solar.getHour(),
      isLeapMonth: rawMonth < 0,
      monthName: lunar.getMonthInChinese(),
      dayName: lunar.getDayInChinese()
    };
    
    // Step 6: Calculate derived information
    const dayMasterElement = this.getStemElement(chart.day.stem);
    const zodiac = this.getZodiac(chart.year.branch);
    const naYin = this.getNaYin(chart.year);
    const fiveElements = this.calculateFiveElements(chart);
    
    // Step 7: Calculate additional features from taro-bazi
    const voidBranches = this.calculateVoidBranches(chart.day);
    const twelveGrowthStages = await this.calculateTwelveGrowthStages(chart);
    
    return {
      chart,
      birthInfo: {
        solar: birthDate,
        lunar: lunarDate,
        trueSolarTime,
        solarTerm,
        adjacentSolarTermTime,
        solarTimeInfo,
        warnings: warnings.length ? warnings : undefined
      },
      zodiac,
      dayMasterElement,
      naYin,
      fiveElements,
      voidBranches,
      twelveGrowthStages
    };
  }
  
  /**
   * 由 lunar getEightChar 組裝四柱（取代手砌的 calculateHoroscope 路徑）。
   * EightChar 已正確處理真太陽時（透過調整後的 birthDate）、節氣換月、立春換年、
   * 子時流派（setSect）。下游 chart 結構不變。
   */
  private buildChartFromEightChar(ec: any, hour: number): BaziChart {
    const yg = ec.getYearGan(), yz = ec.getYearZhi();
    const mg = ec.getMonthGan(), mz = ec.getMonthZhi();
    const dg = ec.getDayGan(), dz = ec.getDayZhi();
    // 時柱用「當日日干起時」（夜子時正統 = mingpan 原生標準，與子時不換日一致），
    // 而非 lunar getTime 的「晚子時屬次日子時」。hour 為真太陽時調整後的小時。
    const { hourGan: hg, hourZhi: hz } = this.calculateHourPillar(dg, hour);
    const chart: BaziChart = {
      year: this.createPillar(yg, yz),
      month: this.createPillar(mg, mz),
      day: this.createPillar(dg, dz),
      hour: this.createPillar(hg, hz),
    };
    chart.year.selfSitting = this.calculateSelfSitting(yg, yz);
    chart.month.selfSitting = this.calculateSelfSitting(mg, mz);
    chart.day.selfSitting = this.calculateSelfSitting(dg, dz);
    chart.hour.selfSitting = this.calculateSelfSitting(hg, hz);
    return chart;
  }

  /**
   * Calculate hour pillar
   */
  private calculateHourPillar(dayGan: string, hour: number): {
    hourGan: string;
    hourZhi: string;
  } {
    // Five Rats Escape (五鼠遁) for hour stem
    const fiveRatsDict: Record<string, string> = {
      '甲': '甲', '己': '甲',
      '乙': '丙', '庚': '丙',
      '丙': '戊', '辛': '戊',
      '丁': '庚', '壬': '庚',
      '戊': '壬', '癸': '壬'
    };
    
    const startGan = fiveRatsDict[dayGan];
    const startGanIndex = HEAVENLY_STEMS.findIndex(s => s.name === startGan);
    const zhiIndex = Math.ceil(hour / 2) % 12;
    const ganIndex = (startGanIndex + zhiIndex) % 10;
    
    return {
      hourGan: HEAVENLY_STEMS[ganIndex].name,
      hourZhi: EARTHLY_BRANCHES[zhiIndex].name
    };
  }
  
  /**
   * Create a pillar with hidden stems and Na Yin
   */
  private createPillar(stem: string, branch: string): Pillar {
    const hiddenStems = this.getHiddenStems(branch);
    const naYin = NA_YIN[`${stem}${branch}`] || '';
    
    // Self-sitting will be calculated later based on day stem
    const selfSitting = '';
    
    // Calculate void branches for this pillar
    const voidBranches = this.calculateVoidBranches({ stem, branch });
    const isVoid = voidBranches.includes(branch);
    
    return {
      stem,
      branch,
      hiddenStems,
      naYin,
      selfSitting,
      void: isVoid,
      voidBranches
    };
  }
  
  /**
   * Get hidden stems for a branch
   */
  private getHiddenStems(branch: string): HiddenStem[] {
    const stems = HIDDEN_STEMS[branch];
    if (!stems) return [];
    
    return stems.map((stem, index) => ({
      stem: stem.stem,
      power: stem.power,
      isMain: index === 0
    }));
  }
  
  /**
   * Get element of a heavenly stem
   */
  private getStemElement(stem: string): string {
    const stemData = HEAVENLY_STEMS.find(s => s.name === stem);
    return stemData?.element || '';
  }
  
  /**
   * Get element of an earthly branch
   */
  private getBranchElement(branch: string): string {
    const branchData = EARTHLY_BRANCHES.find(b => b.name === branch);
    return branchData?.element || '';
  }
  
  /**
   * Get zodiac animal for a branch
   */
  private getZodiac(branch: string): string {
    const branchData = EARTHLY_BRANCHES.find(b => b.name === branch);
    return branchData?.zodiac || branch;
  }
  
  /**
   * Get Na Yin information
   */
  private getNaYin(pillar: Pillar): NaYinInfo {
    const naYinName = pillar.naYin || '';
    const element = this.extractNaYinElement(naYinName);
    
    return {
      name: naYinName,
      element,
      meaning: this.getNaYinMeaning(naYinName)
    };
  }
  
  /**
   * Extract element from Na Yin name
   */
  private extractNaYinElement(naYin: string): string {
    for (const element of FIVE_ELEMENTS) {
      if (naYin.includes(element.name)) {
        return element.name;
      }
    }
    return '';
  }
  
  /**
   * Get Na Yin meaning
   */
  private getNaYinMeaning(naYin: string): string {
    // Simplified - in real implementation, would have detailed meanings
    const meanings: Record<string, string> = {
      '海中金': '海中之金，深藏不露',
      '爐中火': '爐中之火，煉化萬物',
      '大林木': '大林之木，挺拔向上',
      '路旁土': '路旁之土，承載萬物',
      '劍鋒金': '劍鋒之金，鋒芒畢露',
      // ... more meanings
    };
    return meanings[naYin] || naYin;
  }
  
  /**
   * Calculate five elements distribution
   */
  calculateFiveElements(chart: BaziChart): FiveElementsAnalysis {
    const count: Record<string, number> = {
      木: 0,
      火: 0,
      土: 0,
      金: 0,
      水: 0
    };
    
    // Count stems
    const stems = [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem];
    stems.forEach(stem => {
      const element = this.getStemElement(stem);
      if (element) count[element]++;
    });
    
    // Count branches (main qi)
    const branches = [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch];
    branches.forEach(branch => {
      const element = this.getBranchElement(branch);
      if (element) count[element]++;
    });
    
    // Count hidden stems
    const allPillars = [chart.year, chart.month, chart.day, chart.hour];
    allPillars.forEach(pillar => {
      if (pillar.hiddenStems) {
        pillar.hiddenStems.forEach(hidden => {
          const element = this.getStemElement(hidden.stem);
          if (element) count[element] += hidden.power;
        });
      }
    });
    
    // Calculate total and balance
    const total = Object.values(count).reduce((sum, val) => sum + val, 0);
    const elements = Object.entries(count).map(([elem, val]) => ({ element: elem, count: val }));
    const sorted = elements.sort((a, b) => b.count - a.count);
    
    const missing = FIVE_ELEMENTS
      .filter(e => count[e.name] === 0)
      .map(e => e.name);
    
    const balance: ElementBalance = {
      strongest: sorted[0].element,
      weakest: sorted[sorted.length - 1].element,
      missing,
      distribution: this.evaluateDistribution(count, total)
    };
    
    return {
      木: count['木'],
      火: count['火'],
      土: count['土'],
      金: count['金'],
      水: count['水'],
      total,
      balance
    };
  }
  
  /**
   * Evaluate element distribution
   */
  private evaluateDistribution(
    count: Record<string, number>,
    total: number
  ): '平衡' | '失衡' | '严重失衡' {
    const values = Object.values(count);
    const avg = total / 5;
    const deviations = values.map(v => Math.abs(v - avg));
    const maxDeviation = Math.max(...deviations);
    
    if (maxDeviation < avg * 0.5) return '平衡';
    if (maxDeviation < avg * 1.0) return '失衡';
    return '严重失衡';
  }
  
  /**
   * Calculate twelve growth stages based on taro-bazi logic
   */
  async calculateTwelveGrowthStages(chart: BaziChart): Promise<TwelveGrowthStage[]> {
    const dayGan = chart.day.stem;
    const dayGanIndex = HEAVENLY_STEMS.findIndex(s => s.name === dayGan);
    const twelveGrowInfo: Record<string, string> = {};
    
    const twelvegGrowthStages = [
      '長生', '沐浴', '冠帶', '臨官', '帝旺', '衰',
      '病', '死', '墓', '絕', '胎', '養'
    ];
    
    // Yang stems go forward, Yin stems go backward
    if (dayGanIndex % 2 === 0) {
      // Yang day master - forward
      const offsetMap: Record<string, number> = {
        '甲': 1,  // 木 starts at 亥
        '丙': -2, // 火 starts at 寅
        '戊': -2, // 土 starts at 寅
        '庚': -5, // 金 starts at 巳
        '壬': -8  // 水 starts at 申
      };
      const offset = offsetMap[dayGan] || 0;
      
      EARTHLY_BRANCHES.forEach((branch, index) => {
        const stageIndex = (index + offset + 12) % 12;
        twelveGrowInfo[branch.name] = twelvegGrowthStages[stageIndex];
      });
    } else {
      // Yin day master - backward
      const offsetMap: Record<string, number> = {
        '乙': -6, // 木 starts at 午
        '丁': -3, // 火 starts at 酉
        '己': -3, // 土 starts at 酉
        '辛': 0,  // 金 starts at 子
        '癸': 3   // 水 starts at 卯
      };
      const offset = offsetMap[dayGan] || 0;
      
      EARTHLY_BRANCHES.forEach((branch, index) => {
        const stageIndex = ((-index + offset + 12) % 12 + 12) % 12;
        twelveGrowInfo[branch.name] = twelvegGrowthStages[stageIndex];
      });
    }
    
    // Build result for each pillar
    const branches = [
      { branch: chart.year.branch, position: 'year' },
      { branch: chart.month.branch, position: 'month' },
      { branch: chart.day.branch, position: 'day' },
      { branch: chart.hour.branch, position: 'hour' }
    ];
    
    return branches.map(({ branch, position }) => {
      const stage = twelveGrowInfo[branch];
      const stageInfo = this.getGrowthStageInfo(stage);
      return {
        stage,
        element: this.getStemElement(dayGan),
        branch,
        meaning: stageInfo.meaning,
        strength: stageInfo.strength
      };
    });
  }
  
  /**
   * Get growth stage information
   */
  private getGrowthStageInfo(stage: string): {
    meaning: string;
    strength: number;
  } {
    const stageInfo: Record<string, { meaning: string; strength: number }> = {
      '長生': { meaning: 'Birth - New beginning', strength: 0.8 },
      '沐浴': { meaning: 'Bath - Cleansing', strength: 0.6 },
      '冠帶': { meaning: 'Crown - Coming of age', strength: 0.9 },
      '臨官': { meaning: 'Official - Peak career', strength: 1.0 },
      '帝旺': { meaning: 'Emperor - Maximum power', strength: 1.2 },
      '衰': { meaning: 'Decline - Weakening', strength: 0.7 },
      '病': { meaning: 'Sick - Illness', strength: 0.5 },
      '死': { meaning: 'Death - End', strength: 0.3 },
      '墓': { meaning: 'Tomb - Storage', strength: 0.4 },
      '絕': { meaning: 'Extinction - Void', strength: 0.2 },
      '胎': { meaning: 'Embryo - Conception', strength: 0.5 },
      '養': { meaning: 'Nurture - Growth', strength: 0.6 }
    };
    
    return stageInfo[stage] || { meaning: stage, strength: 0.5 };
  }
  
  /**
   * Calculate self-sitting relationship (自坐)
   * Uses the twelve growth stages (十二长生) system
   * Based on taro-bazi implementation
   */
  private calculateSelfSitting(stem: string, branch: string): string {
    // Twelve growth stages in order
    const twelveGrowthStages = [
      '长生', '沐浴', '冠带', '临官', '帝旺', 
      '衰', '病', '死', '墓', '绝', '胎', '养'
    ];
    
    // Get branch index
    const branchIndex = EARTHLY_BRANCHES.findIndex(b => b.name === branch);
    if (branchIndex === -1) return '';
    
    // Get stem index to determine offset
    const stemIndex = HEAVENLY_STEMS.findIndex(s => s.name === stem);
    if (stemIndex === -1) return '';
    
    // Use taro-bazi offsets for twelve growth stages calculation
    // These offsets have been verified to produce correct results
    const offsetMap: Record<string, number> = {
      '甲': 1,   // Yang Wood
      '乙': -6,  // Yin Wood
      '丙': -2,  // Yang Fire
      '丁': -3,  // Yin Fire
      '戊': -2,  // Yang Earth (same as Yang Fire)
      '己': -3,  // Yin Earth (same as Yin Fire)
      '庚': -5,  // Yang Metal
      '辛': 0,   // Yin Metal
      '壬': -8,  // Yang Water
      '癸': 3    // Yin Water
    };
    
    const offset = offsetMap[stem] || 0;
    
    // Calculate stage index
    let stageIndex: number;
    if (stemIndex % 2 === 0) {
      // Yang stems (even index) - forward progression
      stageIndex = (branchIndex + offset + 12) % 12;
    } else {
      // Yin stems (odd index) - reverse progression
      stageIndex = ((-branchIndex + offset + 12) % 12 + 12) % 12;
    }
    
    return twelveGrowthStages[stageIndex];
  }

  /**
   * Calculate void branches (空亡) based on taro-bazi logic
   */
  calculateVoidBranches(pillar: { stem: string; branch: string }): string[] {
    const gan = pillar.stem;
    const zhi = pillar.branch;
    
    const ganIndex = HEAVENLY_STEMS.findIndex(s => s.name === gan);
    const zhiIndex = EARTHLY_BRANCHES.findIndex(b => b.name === zhi);
    
    if (ganIndex === -1 || zhiIndex === -1) return [];
    
    let diffIndex = zhiIndex - ganIndex;
    diffIndex = diffIndex < 0 ? diffIndex + 11 : diffIndex;
    
    // Determine void branches based on JiaZi cycle pattern
    if (diffIndex === 0 || diffIndex === 11) return ['戌', '亥']; // 甲子旬
    if (diffIndex === 9 || diffIndex === 10) return ['申', '酉']; // 甲戌旬
    if (diffIndex === 7 || diffIndex === 8) return ['午', '未']; // 甲申旬
    if (diffIndex === 5 || diffIndex === 6) return ['辰', '巳']; // 甲午旬
    if (diffIndex === 3 || diffIndex === 4) return ['寅', '卯']; // 甲辰旬
    if (diffIndex === 1 || diffIndex === 2) return ['子', '丑']; // 甲寅旬
    
    return [];
  }
  
  /**
   * Calculate month strength
   */
  calculateMonthStrength(chart: BaziChart, birthInfo: any): number {
    const monthBranch = chart.month.branch;
    const season = this.getSeason(monthBranch);
    const dayMasterElement = this.getStemElement(chart.day.stem);
    
    // Calculate strength based on seasonal support
    let strength = 1.0;
    
    // Element-season relationships
    const seasonSupport: Record<string, Record<string, number>> = {
      '春': { '木': 1.5, '火': 1.2, '土': 0.8, '金': 0.6, '水': 0.9 },
      '夏': { '木': 0.9, '火': 1.5, '土': 1.2, '金': 0.7, '水': 0.6 },
      '秋': { '木': 0.6, '火': 0.8, '土': 1.1, '金': 1.5, '水': 1.2 },
      '冬': { '木': 1.2, '火': 0.6, '土': 0.9, '金': 0.8, '水': 1.5 }
    };
    
    if (seasonSupport[season] && seasonSupport[season][dayMasterElement]) {
      strength = seasonSupport[season][dayMasterElement];
    }
    
    return strength;
  }
  
  /**
   * Get season from month branch
   */
  private getSeason(monthBranch: string): string {
    const branchSeasons: Record<string, string> = {
      '寅': '春', '卯': '春', '辰': '春',
      '巳': '夏', '午': '夏', '未': '夏',
      '申': '秋', '酉': '秋', '戌': '秋',
      '亥': '冬', '子': '冬', '丑': '冬'
    };
    return branchSeasons[monthBranch] || '春';
  }
  
  /**
   * Get birth info for other calculations
   */
  async getBirthInfo(year: number, month: number, day: number, hour: number): Promise<any> {
    const solar = Solar.fromYmdHms(year, month, day, hour, 0, 0);
    const lunar = solar.getLunar();
    const rawMonth = lunar.getMonth();
    
    return {
      solar: new Date(year, month - 1, day, hour),
      lunar: {
        year: lunar.getYear(),
        month: Math.abs(rawMonth),
        day: lunar.getDay(),
        isLeapMonth: rawMonth < 0,
        monthName: lunar.getMonthInChinese(),
        dayName: lunar.getDayInChinese()
      }
    };
  }
}
