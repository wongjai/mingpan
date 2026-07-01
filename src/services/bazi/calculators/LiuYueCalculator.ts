import {
  Stem,
  Branch,
  FiveElement,
  LiuYueInfo,
  LiuYueInteraction,
  LiuYueInteractions,
  LiuYueTenGods,
  LiuYueDomainGuidance,
  ChineseDate
} from '../types';
import { HEAVENLY_STEMS, EARTHLY_BRANCHES, FIVE_ELEMENTS, HIDDEN_STEMS } from '../../../core/constants/bazi';
import { LuckCycleCalculator } from './LuckCycleCalculator';
import { PreciseSolarTermCalculator } from '../../../core/calendar/solarTerms';
import { TenGodsAnalyzer } from '../analyzers/TenGodsAnalyzer';
import { RelationsAnalyzer, BranchRelation, StemRelation } from '../analyzers/RelationsAnalyzer';

// 流月柱在跨柱關係分析中的位置標籤
const LIUYUE_POSITION = '流月';

// 互動關係類型 → 繁體中文名稱
const RELATION_TYPE_LABELS: Record<string, string> = {
  sixHarmony: '六合',
  sixConflict: '六沖',
  sixHarm: '六害',
  threePunishment: '三刑',
  threeHarmony: '三合',
  sixDestruction: '六破',
  threeMeeting: '三會',
  fiveCombination: '天干五合'
};

// Extract simple arrays for easier usage
const STEMS = HEAVENLY_STEMS.map(s => s.name) as Stem[];
const BRANCHES = EARTHLY_BRANCHES.map(b => b.name) as Branch[];

// Create stem-element mapping
const STEM_ELEMENTS: Record<Stem, FiveElement> = HEAVENLY_STEMS.reduce((acc, stem) => {
  acc[stem.name as Stem] = stem.element as FiveElement;
  return acc;
}, {} as Record<Stem, FiveElement>);

// Create branch-element mapping
const BRANCH_ELEMENTS: Record<Branch, FiveElement> = EARTHLY_BRANCHES.reduce((acc, branch) => {
  acc[branch.name as Branch] = branch.element as FiveElement;
  return acc;
}, {} as Record<Branch, FiveElement>);

// Solar term months - each month starts from a specific solar term (節)
const MONTH_STARTING_SOLAR_TERMS = [
  '立春', // 寅月
  '惊蛰', // 卯月
  '清明', // 辰月
  '立夏', // 巳月
  '芒种', // 午月
  '小暑', // 未月
  '立秋', // 申月
  '白露', // 酉月
  '寒露', // 戌月
  '立冬', // 亥月
  '大雪', // 子月
  '小寒'  // 丑月
];

/**
 * Calculator for Liu Yue (流月) - Monthly Fortune Cycles
 * Provides month-by-month analysis within a Liu Nian year
 */
// 命局/大運/流年 上下文（用於流月跨柱分析），全部可選以保持向後相容
export interface LiuYueContext {
  dayMaster?: string; // 日主天干，用於十神計算
  natalPillars?: Array<{ stem: string; branch: string; position: string }>; // 四柱命局
  currentDaYun?: { stem: string; branch: string };
  currentLiuNian?: { stem: string; branch: string };
}

export class LiuYueCalculator {
  private luckCalculator: LuckCycleCalculator;
  private tenGodsAnalyzer: TenGodsAnalyzer;

  constructor() {
    this.luckCalculator = new LuckCycleCalculator();
    this.tenGodsAnalyzer = new TenGodsAnalyzer();
  }

  /**
   * Calculate all Liu Yue for a specific year
   */
  calculateLiuYue(
    yearStem: Stem,
    yearBranch: Branch,
    dayMasterElement: FiveElement,
    yongShen: FiveElement[],
    birthDate: ChineseDate,
    currentYear: number,
    context: LiuYueContext = {}
  ): LiuYueInfo[] {
    const months: LiuYueInfo[] = [];
    
    // Get all solar terms for the year
    const yearSolarTerms = PreciseSolarTermCalculator.calculateYearSolarTerms(currentYear);
    const nextYearSolarTerms = PreciseSolarTermCalculator.calculateYearSolarTerms(currentYear + 1);
    
    // Calculate the stem for the first month (寅月)
    const firstMonthStem = this.calculateFirstMonthStem(yearStem);
    
    for (let i = 0; i < 12; i++) {
      const monthBranch = BRANCHES[(i + 2) % 12] as Branch; // Start from 寅
      const monthStemIndex = (STEMS.indexOf(firstMonthStem) + i) % 10;
      const monthStem = STEMS[monthStemIndex] as Stem;
      const monthElement = STEM_ELEMENTS[monthStem];

      // Calculate month dates based on solar terms
      const { startDate, endDate, solarTermInfo } = this.getMonthDates(
        currentYear, 
        i, 
        yearSolarTerms, 
        nextYearSolarTerms
      );
      
      // 十神（月干對日主 / 月支本氣對日主）
      const tenGods = this.calculateMonthTenGods(monthStem, monthBranch, context.dayMaster);

      // 流月與命局/大運/流年 之跨柱互動（僅涉及流月柱者）
      const interactions = this.calculateInteractions(monthStem, monthBranch, context);

      // 分析月運（含評分理由累積）
      const analysis = this.analyzeMonth(
        monthStem,
        monthBranch,
        yearStem,
        yearBranch,
        dayMasterElement,
        yongShen,
        tenGods,
        interactions
      );

      // 領域指引（依十神類型 + 互動調節）
      const domainGuidance = this.buildDomainGuidance(tenGods, interactions, monthElement, yongShen);

      // 分析完整度與可信度
      const { confidence, warnings } = this.assessConfidence(context, tenGods);

      months.push({
        month: i + 1,
        stem: monthStem,
        branch: monthBranch,
        ganZhi: `${monthStem}${monthBranch}`,
        startDate,
        endDate,
        fortune: analysis.fortune,
        rating: analysis.rating,
        mainInfluences: analysis.mainInfluences,
        opportunities: analysis.opportunities,
        challenges: analysis.challenges,
        recommendations: analysis.recommendations,
        healthFocus: analysis.healthFocus,
        luckyDays: this.calculateLuckyDays(monthStem, monthBranch, dayMasterElement),
        solarTerm: solarTermInfo, // Store solar term info for display
        tenGods,
        interactions,
        ratingReasoning: analysis.ratingReasoning,
        domainGuidance,
        confidence,
        warnings
      });
    }

    return months;
  }

  /**
   * 月柱十神：月干 vs 日主、月支本氣 vs 日主
   */
  private calculateMonthTenGods(
    monthStem: Stem,
    monthBranch: Branch,
    dayMaster?: string
  ): LiuYueTenGods | undefined {
    if (!dayMaster) return undefined;

    const stemGod = this.tenGodsAnalyzer.calculateTenGod(dayMaster, monthStem);

    // 取月支本氣（第一藏干）對日主之十神
    const hidden = HIDDEN_STEMS[monthBranch];
    const mainHiddenStem = hidden && hidden.length > 0 ? hidden[0].stem : undefined;
    const branchGod = mainHiddenStem
      ? this.tenGodsAnalyzer.calculateTenGod(dayMaster, mainHiddenStem)
      : '';

    return { stem: stemGod, branch: branchGod };
  }

  /**
   * 計算流月與命局/大運/流年之跨柱互動
   * 對每個目標集合，將流月柱併入後跑 RelationsAnalyzer.analyzePillarSet，
   * 再過濾出「涉及流月柱」的關係，避免混入目標集合內部的關係。
   */
  private calculateInteractions(
    monthStem: Stem,
    monthBranch: Branch,
    context: LiuYueContext
  ): LiuYueInteractions {
    const monthPillar = { stem: monthStem, branch: monthBranch, position: LIUYUE_POSITION };

    const withNatal = context.natalPillars && context.natalPillars.length > 0
      ? this.detectAgainst(monthPillar, context.natalPillars)
      : [];

    const withDaYun = context.currentDaYun
      ? this.detectAgainst(monthPillar, [{ ...context.currentDaYun, position: '大運' }])
      : [];

    const withLiuNian = context.currentLiuNian
      ? this.detectAgainst(monthPillar, [{ ...context.currentLiuNian, position: '流年' }])
      : [];

    return { withNatal, withDaYun, withLiuNian };
  }

  /**
   * 偵測流月柱與一組目標柱之間的關係。
   * 對每個目標柱與流月柱組成「兩柱一組」跑 RelationsAnalyzer.analyzePillarSet，
   * 逐一偵測可保證 .find() 選中正確的配對（避免命局內同支被優先選走），
   * 每個關係必然涉及流月柱。最後去重（同一 description×positions 只保留一次）。
   */
  private detectAgainst(
    monthPillar: { stem: string; branch: string; position: string },
    targets: Array<{ stem: string; branch: string; position: string }>
  ): LiuYueInteraction[] {
    const interactions: LiuYueInteraction[] = [];
    const seen = new Set<string>();

    const collect = (result: ReturnType<typeof RelationsAnalyzer.analyzePillarSet>) => {
      const branchGroups: BranchRelation[] = [
        ...result.sixHarmonies,
        ...result.sixConflicts,
        ...result.sixHarms,
        ...result.threePunishments,
        ...result.threeHarmonies,
        ...result.sixDestructions,
        ...result.threeMeetings
      ];

      for (const rel of branchGroups) {
        if (!rel.positions.includes(LIUYUE_POSITION)) continue;
        const key = `${rel.description}|${[...rel.positions].sort().join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        interactions.push({
          type: RELATION_TYPE_LABELS[rel.type] || rel.type,
          description: rel.description,
          branches: rel.branches,
          positions: rel.positions,
          impact: rel.impact,
          strength: rel.strength
        });
      }

      for (const rel of result.stemCombinations as StemRelation[]) {
        if (!rel.positions.includes(LIUYUE_POSITION)) continue;
        const key = `${rel.description}|${[...rel.positions].sort().join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        interactions.push({
          type: RELATION_TYPE_LABELS[rel.type] || rel.type,
          description: rel.description,
          branches: rel.stems, // 天干合：以天干填入 branches 欄位保持結構一致
          positions: rel.positions,
          impact: rel.impact,
          strength: rel.strength
        });
      }
    };

    for (const target of targets) {
      collect(RelationsAnalyzer.analyzePillarSet([target, monthPillar]));
    }

    return interactions;
  }

  /**
   * Calculate the stem for the first month based on year stem
   */
  private calculateFirstMonthStem(yearStem: Stem): Stem {
    const yearStemIndex = STEMS.indexOf(yearStem);
    const rules: Record<number, Stem> = {
      0: '丙', // 甲年
      1: '戊', // 乙年
      2: '庚', // 丙年
      3: '壬', // 丁年
      4: '甲', // 戊年
      5: '丙', // 己年
      6: '戊', // 庚年
      7: '庚', // 辛年
      8: '壬', // 壬年
      9: '甲'  // 癸年
    };
    return rules[yearStemIndex] as Stem;
  }

  /**
   * Get solar calendar dates for a Chinese month based on solar terms
   */
  private getMonthDates(
    year: number, 
    monthIndex: number,
    yearSolarTerms: Array<{name: string; date: Date}>,
    nextYearSolarTerms: Array<{name: string; date: Date}>
  ): { 
    startDate: Date; 
    endDate: Date; 
    solarTermInfo?: { name: string; date: Date } 
  } {
    // Each Chinese month starts from a specific solar term (節)
    const startingSolarTerm = MONTH_STARTING_SOLAR_TERMS[monthIndex];
    const nextSolarTerm = MONTH_STARTING_SOLAR_TERMS[(monthIndex + 1) % 12];
    
    // Find the starting solar term
    // 注意：八字年从立春开始到次年立春前结束
    // 丑月（monthIndex=11）的开始节气"小寒"在公历次年1月初，需要从下一年节气表查找
    let startDate: Date | null = null;
    let solarTermInfo: { name: string; date: Date } | undefined;
    
    if (monthIndex === 11) {
      // 丑月（小寒~立春）开始于公历次年1月
      for (const term of nextYearSolarTerms) {
        if (term.name === startingSolarTerm) {
          startDate = term.date;
          solarTermInfo = term;
          break;
        }
      }
    } else {
      for (const term of yearSolarTerms) {
        if (term.name === startingSolarTerm) {
          startDate = term.date;
          solarTermInfo = term;
          break;
        }
      }
      
      // If not found in current year (e.g., 立春 might be in previous year)
      if (!startDate && monthIndex === 0) {
        const prevYearTerms = PreciseSolarTermCalculator.calculateYearSolarTerms(year - 1);
        for (const term of prevYearTerms) {
          if (term.name === startingSolarTerm) {
            startDate = term.date;
            solarTermInfo = term;
            break;
          }
        }
      }
    }
    
    // Find the ending solar term
    let endDate: Date | null = null;
    
    // First check current year
    for (const term of yearSolarTerms) {
      if (term.name === nextSolarTerm) {
        // End date should be the moment before the next solar term starts
        endDate = new Date(term.date.getTime() - 1);
        break;
      }
    }
    
    // If not found, or if endDate is before startDate (cross-year case like 子月 or 丑月),
    // check next year
    // 例如：子月从大雪(12/7)到小寒(次年1/5)，当年1月的小寒比大雪早，需要用次年的小寒
    if (!endDate || (startDate && endDate.getTime() <= startDate.getTime())) {
      for (const term of nextYearSolarTerms) {
        if (term.name === nextSolarTerm) {
          // End date should be the moment before the next solar term starts
          endDate = new Date(term.date.getTime() - 1);
          break;
        }
      }
    }
    
    // Fallback to approximate dates if solar terms not found
    if (!startDate) {
      startDate = new Date(year, monthIndex + 1, 1);
    }
    if (!endDate) {
      endDate = new Date(year, monthIndex + 2, 0);
    }
    
    return { startDate, endDate, solarTermInfo };
  }


  /**
   * Analyze month fortune
   * 重構：以「理由標記」方式累積各項評分貢獻，並輸出繁體中文評分理由，
   * 確保任何評分都附帶可解釋的緣由（ratingReasoning 永不為空）。
   */
  private analyzeMonth(
    monthStem: Stem,
    monthBranch: Branch,
    yearStem: Stem,
    yearBranch: Branch,
    dayMasterElement: FiveElement,
    yongShen: FiveElement[],
    tenGods?: LiuYueTenGods,
    interactions?: LiuYueInteractions
  ): {
    fortune: string;
    rating: number;
    mainInfluences: string[];
    opportunities: string[];
    challenges: string[];
    recommendations: string[];
    healthFocus: string[];
    ratingReasoning: string[];
  } {
    const monthElement = STEM_ELEMENTS[monthStem];

    // 累積器：每項貢獻同時記錄分數與繁體中文理由
    let rating = 50; // 基礎分
    const ratingReasoning: string[] = ['基礎分 50 分。'];

    // 用神加分
    if (yongShen.includes(monthElement)) {
      rating += 30;
      ratingReasoning.push(`月干五行為${monthElement}，屬命局用神，得力扶助（+30）。`);
    } else if (this.isUnfavorable(monthElement, yongShen)) {
      ratingReasoning.push(`月干五行為${monthElement}，剋洩用神，助力有限。`);
    }

    // 五行生剋
    const elementCycle: Record<FiveElement, FiveElement> = {
      '木': '火', '火': '土', '土': '金', '金': '水', '水': '木'
    };
    const elementControl: Record<FiveElement, FiveElement> = {
      '木': '土', '土': '水', '水': '火', '火': '金', '金': '木'
    };

    if (elementCycle[dayMasterElement] === monthElement) {
      rating += 10;
      ratingReasoning.push(`日主${dayMasterElement}生月令${monthElement}，順洩生氣（+10）。`);
    } else if (elementCycle[monthElement] === dayMasterElement) {
      rating += 15;
      ratingReasoning.push(`月令${monthElement}生日主${dayMasterElement}，得印綬生扶（+15）。`);
    } else if (elementControl[monthElement] === dayMasterElement) {
      rating -= 20;
      ratingReasoning.push(`月令${monthElement}剋日主${dayMasterElement}，受制承壓（-20）。`);
    } else if (elementControl[dayMasterElement] === monthElement) {
      rating += 5;
      ratingReasoning.push(`日主${dayMasterElement}剋月令${monthElement}，主導有利（+5）。`);
    } else {
      ratingReasoning.push(`日主${dayMasterElement}與月令${monthElement}同氣比和。`);
    }

    // 十神性質微調
    if (tenGods) {
      const godNature = this.getTenGodNature(tenGods.stem);
      if (godNature === '吉') {
        rating += 5;
        ratingReasoning.push(`月干十神為${tenGods.stem}，性質偏吉（+5）。`);
      } else if (godNature === '凶') {
        rating -= 5;
        ratingReasoning.push(`月干十神為${tenGods.stem}，性質偏忌，宜謹慎（-5）。`);
      }
    }

    // 跨柱互動對評分之影響
    const allInteractions: LiuYueInteraction[] = interactions
      ? [...interactions.withNatal, ...interactions.withDaYun, ...interactions.withLiuNian]
      : [];
    for (const it of allInteractions) {
      const scope = this.interactionScopeLabel(it, interactions);
      if (it.impact === '正面') {
        rating += 3;
        ratingReasoning.push(`流月與${scope}構成${it.description}（${it.type}），和諧助力（+3）。`);
      } else if (it.impact === '负面') {
        rating -= 5;
        ratingReasoning.push(`流月與${scope}構成${it.description}（${it.type}），張力波動（-5）。`);
      }
    }

    rating = Math.max(0, Math.min(100, rating));
    ratingReasoning.push(`綜合評定：${rating} 分（${this.getFortuneDescription(rating)}）。`);

    // 保留既有 enum 陣列欄位（不改動語意）
    const mainInfluences: string[] = [];
    const opportunities: string[] = [];
    const challenges: string[] = [];
    const recommendations: string[] = [];
    const healthFocus: string[] = [];

    if (this.isHarmony(monthStem, yearStem)) {
      mainInfluences.push('month_year_harmony');
      opportunities.push('smooth_progress');
    }
    if (this.isClash(monthBranch, yearBranch)) {
      mainInfluences.push('month_year_clash');
      challenges.push('potential_conflicts');
    }
    if (yongShen.includes(monthElement)) {
      opportunities.push('yongshen_support');
      recommendations.push('seize_opportunities');
    } else if (this.isUnfavorable(monthElement, yongShen)) {
      challenges.push('unfavorable_element');
      recommendations.push('stay_cautious');
    }
    healthFocus.push(...this.getHealthFocus(monthElement));

    const fortune = this.getFortuneDescription(rating);

    return {
      fortune,
      rating,
      mainInfluences,
      opportunities,
      challenges,
      recommendations,
      healthFocus,
      ratingReasoning
    };
  }

  /**
   * 判斷互動所屬層（命局/大運/流年），用於理由描述
   */
  private interactionScopeLabel(
    it: LiuYueInteraction,
    interactions?: LiuYueInteractions
  ): string {
    if (!interactions) return '命局';
    if (interactions.withDaYun.includes(it)) return '大運';
    if (interactions.withLiuNian.includes(it)) return '流年';
    return '命局';
  }

  /**
   * 取十神吉凶性質（吉/凶/中性）
   */
  private getTenGodNature(god: string): '吉' | '凶' | '中性' {
    const nature: Record<string, '吉' | '凶' | '中性'> = {
      '正官': '吉', '正財': '吉', '偏財': '吉', '正印': '吉', '食神': '吉',
      '七殺': '凶', '傷官': '凶', '劫財': '凶', '偏印': '中性',
      '比肩': '中性'
    };
    return nature[god] || '中性';
  }

  /**
   * 領域指引：依月度十神類型建立事業/財富/感情/健康四領域繁體中文提示，
   * 再依跨柱互動（沖/合/刑害）調節張力或助力。屬引導而非斷語。
   */
  private buildDomainGuidance(
    tenGods: LiuYueTenGods | undefined,
    interactions: LiuYueInteractions,
    monthElement: FiveElement,
    yongShen: FiveElement[]
  ): LiuYueDomainGuidance {
    const godType = tenGods ? this.getTenGodCategory(tenGods.stem) : 'unknown';

    // 各十神類型之基礎領域內容
    const base = this.getDomainBaseByGod(godType);

    // 互動調節
    const all: LiuYueInteraction[] = [
      ...interactions.withNatal,
      ...interactions.withDaYun,
      ...interactions.withLiuNian
    ];
    const hasClash = all.some(i => i.type === '六沖');
    const hasHarmony = all.some(i => i.type === '六合' || i.type === '三合' || i.type === '三會' || i.type === '天干五合');
    const hasFriction = all.some(i => i.type === '三刑' || i.type === '六害' || i.type === '六破');

    if (hasClash) {
      base.career.risks!.push('本月見沖，事務易生變動，宜預留調整空間。');
      base.relationship.risks!.push('沖動之月，人際關係張力升高，避免衝突升級。');
      base.health.risks!.push('沖主動盪，注意作息與情緒波動。');
    }
    if (hasHarmony) {
      base.career.opportunities!.push('本月見合，得助力與合作機緣，宜把握。');
      base.relationship.opportunities!.push('合主和諧，感情與人脈易進展。');
    }
    if (hasFriction) {
      base.career.risks!.push('刑害破主摩擦是非，處事宜低調圓融。');
      base.relationship.risks!.push('易生口舌摩擦，溝通宜留餘地。');
    }

    // 用神呼應：月令為用神時強化正向
    if (yongShen.includes(monthElement)) {
      base.wealth.summary += '（月令合用神，財氣受激發，宜順勢而為。）';
    }

    return base;
  }

  /**
   * 十神歸類（財/官殺/印/食傷/比劫）
   */
  private getTenGodCategory(god: string): string {
    if (god === '正財' || god === '偏財') return 'wealth';
    if (god === '正官' || god === '七殺') return 'power';
    if (god === '正印' || god === '偏印') return 'resource';
    if (god === '食神' || god === '傷官') return 'output';
    if (god === '比肩' || god === '劫財') return 'companion';
    return 'unknown';
  }

  /**
   * 各十神類型之基礎領域指引（繁體中文，引導性質）
   */
  private getDomainBaseByGod(category: string): LiuYueDomainGuidance {
    const templates: Record<string, LiuYueDomainGuidance> = {
      wealth: {
        career: { summary: '財星當令，利於務實經營與業務拓展。', opportunities: ['把握商機與收入來源'], risks: [], recommendations: ['聚焦可量化的成果'] },
        wealth: { summary: '財氣旺相，正偏財皆有機會，理財投資可積極評估。', opportunities: ['開源與資產配置'], risks: ['避免過度投機'], recommendations: ['量入為出，分散風險'] },
        relationship: { summary: '財主情緣，男命尤易有感情或人際機會。', opportunities: ['社交拓展'], risks: [], recommendations: ['真誠以待'] },
        health: { summary: '財旺耗身，注意勿因忙碌而透支體力。', risks: ['過勞'], recommendations: ['規律作息'] }
      },
      power: {
        career: { summary: '官殺主事業與責任，宜承擔要務、建立權威。', opportunities: ['升遷與承擔重任'], risks: ['壓力偏大'], recommendations: ['穩健應對，量力而為'] },
        wealth: { summary: '因事業帶動財源，收入與職務相關。', opportunities: ['因職得財'], risks: [], recommendations: ['以事業為本'] },
        relationship: { summary: '官星主約束與名分，女命尤主感情正緣。', opportunities: ['關係趨於穩定'], risks: [], recommendations: ['守分守禮'] },
        health: { summary: '壓力偏重，注意情緒與睡眠。', risks: ['壓力、失眠'], recommendations: ['適度紓壓'] }
      },
      resource: {
        career: { summary: '印星主學習與貴人，利於進修、獲取支持。', opportunities: ['貴人相助、學習成長'], risks: [], recommendations: ['把握進修機會'] },
        wealth: { summary: '印重財緩，本月重積累而非速財。', opportunities: [], risks: ['財來較緩'], recommendations: ['穩健儲備'] },
        relationship: { summary: '印主庇護與長輩緣，人際趨於溫和。', opportunities: ['得長輩貴人扶持'], risks: [], recommendations: ['珍惜善緣'] },
        health: { summary: '印主休養，適合調理身心。', risks: [], recommendations: ['靜養與規律作息'] }
      },
      output: {
        career: { summary: '食傷主表達與才華，利於創作、企劃、展現能力。', opportunities: ['創意發揮、洩秀展才'], risks: ['傷官易衝動'], recommendations: ['以作品說話'] },
        wealth: { summary: '食傷生財，靠才藝技能開拓財源。', opportunities: ['技能變現'], risks: [], recommendations: ['將才華轉為價值'] },
        relationship: { summary: '表達力強，人際活躍；傷官月需留意言辭。', opportunities: ['魅力提升'], risks: ['口舌'], recommendations: ['言語留有分寸'] },
        health: { summary: '洩秀耗氣，注意勿過度消耗。', risks: ['精力透支'], recommendations: ['勞逸結合'] }
      },
      companion: {
        career: { summary: '比劫主競爭與合作，利於團隊協作，亦需防同儕競爭。', opportunities: ['合夥與人脈'], risks: ['競爭加劇'], recommendations: ['明確分工與界線'] },
        wealth: { summary: '比劫奪財，本月宜守財，慎防破耗與借貸。', opportunities: [], risks: ['破財、代人受過'], recommendations: ['謹慎財務往來'] },
        relationship: { summary: '朋友緣旺，社交增多；亦防因財因人生摩擦。', opportunities: ['擴展人脈'], risks: ['爭執'], recommendations: ['以和為貴'] },
        health: { summary: '活動量增，注意運動傷害與過勞。', risks: ['運動勞損'], recommendations: ['量力而行'] }
      },
      unknown: {
        career: { summary: '本月事業平順，宜按部就班推進。', opportunities: [], risks: [], recommendations: ['穩定為主'] },
        wealth: { summary: '財務平穩，宜維持既有節奏。', opportunities: [], risks: [], recommendations: ['理性理財'] },
        relationship: { summary: '人際關係平和，順其自然。', opportunities: [], risks: [], recommendations: ['真誠相待'] },
        health: { summary: '身心平穩，維持規律作息即可。', risks: [], recommendations: ['保持健康習慣'] }
      }
    };

    // 深拷貝以免跨月共用同一物件
    return JSON.parse(JSON.stringify(templates[category] || templates.unknown));
  }

  /**
   * 評估分析完整度與可信度；資料不足時給出警告，避免靜默空值。
   */
  private assessConfidence(
    context: LiuYueContext,
    tenGods?: LiuYueTenGods
  ): { confidence: 'high' | 'medium' | 'low'; warnings: string[] } {
    const warnings: string[] = [];
    let missing = 0;

    if (!tenGods) {
      warnings.push('缺少日主資訊，未能計算月度十神。');
      missing++;
    }
    if (!context.natalPillars || context.natalPillars.length < 4) {
      warnings.push('命局四柱不完整，命中互動分析可能缺失。');
      missing++;
    }
    if (!context.currentDaYun) {
      warnings.push('未提供當前大運，未納入大運互動。');
      missing++;
    }
    if (!context.currentLiuNian) {
      warnings.push('未提供當前流年，未納入流年互動。');
      missing++;
    }

    const confidence: 'high' | 'medium' | 'low' =
      missing === 0 ? 'high' : missing <= 2 ? 'medium' : 'low';

    return { confidence, warnings };
  }

  /**
   * Calculate lucky days within a month
   */
  private calculateLuckyDays(
    monthStem: Stem,
    monthBranch: Branch,
    dayMasterElement: FiveElement
  ): number[] {
    const luckyDays: number[] = [];
    const monthElement = STEM_ELEMENTS[monthStem];
    
    // Simplified lucky day calculation
    // In production, calculate based on daily stems and branches
    for (let day = 1; day <= 30; day++) {
      if ((day % 6) === (STEMS.indexOf(monthStem) % 6)) {
        luckyDays.push(day);
      }
    }
    
    return luckyDays.slice(0, 5); // Return top 5 lucky days
  }

  /**
   * Check if two stems are in harmony
   */
  private isHarmony(stem1: Stem, stem2: Stem): boolean {
    const harmonies: Record<Stem, Stem> = {
      '甲': '己', '己': '甲',
      '乙': '庚', '庚': '乙',
      '丙': '辛', '辛': '丙',
      '丁': '壬', '壬': '丁',
      '戊': '癸', '癸': '戊'
    };
    return harmonies[stem1] === stem2;
  }

  /**
   * Check if two branches clash
   */
  private isClash(branch1: Branch, branch2: Branch): boolean {
    const clashes: Record<Branch, Branch> = {
      '子': '午', '午': '子',
      '丑': '未', '未': '丑',
      '寅': '申', '申': '寅',
      '卯': '酉', '酉': '卯',
      '辰': '戌', '戌': '辰',
      '巳': '亥', '亥': '巳'
    };
    return clashes[branch1] === branch2;
  }

  /**
   * Check if element is unfavorable
   */
  private isUnfavorable(element: FiveElement, yongShen: FiveElement[]): boolean {
    const unfavorableMap: Record<FiveElement, FiveElement[]> = {
      '木': ['金'],
      '火': ['水'],
      '土': ['木'],
      '金': ['火'],
      '水': ['土']
    };
    
    return yongShen.some(ys => unfavorableMap[ys]?.includes(element));
  }

  /**
   * Get health focus areas based on element
   */
  private getHealthFocus(element: FiveElement): string[] {
    const healthMap: Record<FiveElement, string[]> = {
      '木': ['liver_health', 'eye_care', 'emotional_balance'],
      '火': ['heart_health', 'blood_circulation', 'sleep_quality'],
      '土': ['digestive_health', 'immune_system', 'grounding'],
      '金': ['respiratory_health', 'skin_care', 'detoxification'],
      '水': ['kidney_health', 'bone_strength', 'hydration']
    };
    
    return healthMap[element] || [];
  }

  /**
   * Get fortune description based on rating
   */
  private getFortuneDescription(rating: number): string {
    if (rating >= 85) return '优秀';
    if (rating >= 70) return 'very_good';
    if (rating >= 55) return '良好';
    if (rating >= 40) return '一般';
    if (rating >= 25) return '挑战';
    return '困难';
  }
}