/**
 * Liu Nian Calculator
 * Enhanced with taro-bazi's precise fleeting year calculations
 * Calculates yearly luck (流年)
 */

import { BaziChart, LiuNian, LiuNianAnalysis } from '../types';
import { HEAVENLY_STEMS, EARTHLY_BRANCHES, TEN_GODS } from '../../../core/constants/bazi';
import { LuckCycleCalculator, LiuNianYear } from './LuckCycleCalculator';
import { DaYunCalculator } from './DaYunCalculator';

export class LiuNianCalculator {
  /**
   * Calculate Liu Nian for a range of years using taro-bazi method
   */
  static calculate(
    chart: BaziChart,
    birthYear: number,
    startYear: number,
    endYear: number,
    birthInfo?: any,
    gender?: 'male' | 'female'
  ): LiuNian[] {
    const liuNians: LiuNian[] = [];
    
    // Get Liu Nian data from LuckCycleCalculator
    const years = Array.from(
      { length: endYear - startYear + 1 }, 
      (_, i) => startYear + i
    );
    const liuNianYears = LuckCycleCalculator.calFleetingYearList(birthYear, years);
    
    // Get DaYun periods if birth info and gender provided
    let daYunPeriods: any[] = [];
    if (birthInfo && gender) {
      daYunPeriods = DaYunCalculator.calculate(
        chart,
        birthInfo,
        gender,
        { startYear, endYear }
      );
    }
    
    for (const liuNianYear of liuNianYears) {
      const { year, age, stemBranch, element, yinYang } = liuNianYear;
      
      // Get zodiac animal
      const zodiac = this.getZodiac(stemBranch.branch);
      
      // Calculate ten god for this year
      const tenGod = this.getTenGod(chart.day.stem, stemBranch.stem);
      
      // Find current DaYun
      const currentDaYun = daYunPeriods.find(
        dy => year >= dy.startYear && year <= dy.endYear
      );
      
      // Analyze this Liu Nian with DaYun interaction
      const analysis = this.analyzeLiuNian(
        stemBranch,
        chart,
        tenGod,
        age,
        currentDaYun
      );
      
      liuNians.push({
        year,
        age,
        stem: stemBranch.stem,
        branch: stemBranch.branch,
        zodiac,
        tenGod,
        analysis
      });
    }
    
    return liuNians;
  }
  
  /**
   * Get zodiac animal
   */
  private static getZodiac(branch: string): string {
    const branchData = EARTHLY_BRANCHES.find(b => b.name === branch);
    return branchData?.zodiac || branch;
  }
  
  /**
   * Get ten god relationship
   */
  private static getTenGod(dayMaster: string, stem: string): string {
    return TEN_GODS[dayMaster]?.[stem] || '';
  }
  
  /**
   * Enhanced Liu Nian analysis with DaYun interaction
   */
  private static analyzeLiuNian(
    liuNian: { stem: string; branch: string },
    chart: BaziChart,
    tenGod: string,
    age: number,
    currentDaYun?: any
  ): LiuNianAnalysis {
    // Evaluate overall fortune with more factors
    const overall = this.evaluateOverall(liuNian, chart, tenGod, currentDaYun);
    
    // Predict events
    const events = this.predictEvents(liuNian, chart, tenGod, age, currentDaYun);
    
    // Generate warnings
    const warnings = this.generateWarnings(liuNian, chart, tenGod, currentDaYun);
    
    // Identify opportunities
    const opportunities = this.identifyOpportunities(liuNian, chart, tenGod, age, currentDaYun);
    
    return {
      overall,
      events,
      warnings,
      opportunities
    };
  }
  
  /**
   * Enhanced overall fortune evaluation
   */
  private static evaluateOverall(
    liuNian: { stem: string; branch: string },
    chart: BaziChart,
    tenGod: string,
    currentDaYun?: any
  ): '优秀' | '良好' | '一般' | '挑战' {
    let score = 50; // Base score
    
    // Check for Tai Sui (太歲) relationships
    const taiSuiRelation = this.analyzeTaiSuiRelation(liuNian.branch, chart);
    switch (taiSuiRelation) {
      case '冲': score -= 20; break;
      case '害': score -= 15; break;
      case '刑': score -= 10; break;
      case '六合': score += 15; break;
      case '三合': score += 20; break;
    }
    
    // Ten god influence
    const tenGodScores: Record<string, number> = {
      '正官': 10, '正印': 10, '正財': 10, '食神': 8,
      '比肩': 0, '偏印': 0, '偏財': 5,
      '七殺': -8, '傷官': -8, '劫財': -10
    };
    score += tenGodScores[tenGod] || 0;
    
    // Check stem relationships
    if (this.hasStemCombination(liuNian.stem, chart)) score += 10;
    if (this.hasStemClash(liuNian.stem, chart)) score -= 10;
    
    // 註：流年支 vs 命盤地支的沖/合/害/刑 已由上方 analyzeTaiSuiRelation 處理，
    // 不再重複計（原 evaluateBranchRelations 為未實現空殼，回 0，移除以免日後 double count）。

    // DaYun interaction (if provided)
    if (currentDaYun && currentDaYun.stemBranch && currentDaYun.stemBranch.stem && currentDaYun.stemBranch.branch) {
      const interaction = LuckCycleCalculator.analyzeDaYunLiuNian(
        currentDaYun,
        { 
          year: 0, // Not used in analysis
          age: 0,  // Not used in analysis
          stemBranch: liuNian,
          element: '',
          yinYang: 'yang' as const
        }
      );
      
      if (interaction.stemRelation === 'combine') score += 8;
      if (interaction.stemRelation === 'clash') score -= 8;
      if (interaction.branchRelation === 'harmony') score += 10;
      if (interaction.branchRelation === 'clash') score -= 10;
      if (interaction.elementalBalance === 'reinforced') score += 5;
      if (interaction.elementalBalance === 'controlling') score -= 5;
    }
    
    // Convert score to rating
    if (score >= 75) return '优秀';
    if (score >= 60) return '良好';
    if (score >= 40) return '一般';
    return '挑战';
  }
  
  /**
   * Analyze Tai Sui relationship
   */
  private static analyzeTaiSuiRelation(
    yearBranch: string,
    chart: BaziChart
  ): '冲' | '害' | '刑' | '六合' | '三合' | '中性' {
    const branches = [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch];
    
    // Check clashes (沖)
    const clashes: Record<string, string> = {
      '子': '午', '午': '子',
      '丑': '未', '未': '丑',
      '寅': '申', '申': '寅',
      '卯': '酉', '酉': '卯',
      '辰': '戌', '戌': '辰',
      '巳': '亥', '亥': '巳'
    };
    if (branches.includes(clashes[yearBranch])) return '冲';
    
    // Check harmonies (合)
    const harmonies: Record<string, string> = {
      '子': '丑', '丑': '子',
      '寅': '亥', '亥': '寅',
      '卯': '戌', '戌': '卯',
      '辰': '酉', '酉': '辰',
      '巳': '申', '申': '巳',
      '午': '未', '未': '午'
    };
    if (branches.includes(harmonies[yearBranch])) return '六合';
    
    // Check harms (害)
    const harms: Record<string, string> = {
      '子': '未', '未': '子',
      '丑': '午', '午': '丑',
      '寅': '巳', '巳': '寅',
      '卯': '辰', '辰': '卯',
      '申': '亥', '亥': '申',
      '酉': '戌', '戌': '酉'
    };
    if (branches.includes(harms[yearBranch])) return '害';
    
    // Check triple combines (三合)
    const tripleCombines = [
      ['申', '子', '辰'],
      ['亥', '卯', '未'],
      ['寅', '午', '戌'],
      ['巳', '酉', '丑']
    ];
    for (const triple of tripleCombines) {
      if (triple.includes(yearBranch)) {
        const otherTwo = triple.filter(b => b !== yearBranch);
        if (otherTwo.every(b => branches.includes(b))) {
          return '三合';
        }
      }
    }
    
    // Check punishments (刑)
    if (this.hasPunishment(yearBranch, chart)) return '刑';
    
    return '中性';
  }
  
  /**
   * Check stem combination
   */
  private static hasStemCombination(stem: string, chart: BaziChart): boolean {
    const combinations: Record<string, string> = {
      '甲': '己', '己': '甲',
      '乙': '庚', '庚': '乙',
      '丙': '辛', '辛': '丙',
      '丁': '壬', '壬': '丁',
      '戊': '癸', '癸': '戊'
    };
    
    const chartStems = [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem];
    return chartStems.includes(combinations[stem]);
  }
  
  /**
   * Check stem clash
   */
  private static hasStemClash(stem: string, chart: BaziChart): boolean {
    const clashes: Record<string, string> = {
      '甲': '庚', '庚': '甲',
      '乙': '辛', '辛': '乙',
      '丙': '壬', '壬': '丙',
      '丁': '癸', '癸': '丁'
    };
    
    const chartStems = [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem];
    return chartStems.includes(clashes[stem]);
  }
  
  // （原 evaluateBranchRelations / getBranchRelations 為未實現空殼，回 0，已移除：
  //   流年支 vs 命盤地支關係統一由 analyzeTaiSuiRelation 處理，避免 double count）
  
  /**
   * Enhanced event prediction
   */
  private static predictEvents(
    liuNian: { stem: string; branch: string },
    chart: BaziChart,
    tenGod: string,
    age: number,
    currentDaYun?: any
  ): string[] {
    const events: string[] = [];
    
    // Age-based events
    if ((age - 1) % 12 === 0) {
      events.push('本命年，宜穩重行事');
    }
    
    // Ten god based events
    switch (tenGod) {
      case '正官':
        events.push('工作升遷機會');
        if (age >= 25 && age <= 35) {
          events.push('適合結婚成家');
        }
        break;
      case '七殺':
        events.push('事業變動可能');
        events.push('競爭壓力增大');
        break;
      case '正財':
        events.push('財運提升');
        events.push('投資獲利機會');
        break;
      case '偏財':
        events.push('意外之財可能');
        events.push('適合投資創業');
        break;
      case '正印':
        events.push('學習進修機會');
        events.push('貴人相助');
        break;
      case '偏印':
        events.push('適合學習專業技能');
        events.push('思想轉變');
        break;
      case '食神':
        events.push('創意靈感豐富');
        events.push('人際關係和諧');
        break;
      case '傷官':
        events.push('口舌是非可能');
        events.push('創業想法萌生');
        break;
      case '比肩':
        events.push('朋友相助');
        events.push('合作機會出現');
        break;
      case '劫財':
        events.push('錢財競爭');
        events.push('需防小人');
        break;
    }
    
    // Special stars
    if (this.hasMovingStar(liuNian.branch, chart)) {
      events.push('有搬遷或出差機會');
    }
    
    if (this.hasPeachBlossom(liuNian.branch, chart)) {
      events.push('桃花運旺，異性緣佳');
    }
    
    if (this.hasAcademicStar(liuNian, chart)) {
      events.push('考試運佳，學業順利');
    }
    
    // DaYun interaction events
    if (currentDaYun && currentDaYun.analysis.fortune === '优秀') {
      events.push('大運流年相輔，機遇難得');
    }
    
    return events;
  }
  
  /**
   * Enhanced warning generation
   */
  private static generateWarnings(
    liuNian: { stem: string; branch: string },
    chart: BaziChart,
    tenGod: string,
    currentDaYun?: any
  ): string[] {
    const warnings: string[] = [];
    
    // Tai Sui warnings
    const taiSuiRelation = this.analyzeTaiSuiRelation(liuNian.branch, chart);
    switch (taiSuiRelation) {
      case '冲':
        warnings.push('沖太歲，諸事需謹慎');
        warnings.push('避免重大決策');
        break;
      case '害':
        warnings.push('害太歲，防小人暗害');
        break;
      case '刑':
        warnings.push('刑太歲，注意法律糾紛');
        break;
    }
    
    // Ten god based warnings
    switch (tenGod) {
      case '七殺':
        warnings.push('防小人陷害');
        warnings.push('注意身體健康');
        break;
      case '傷官':
        warnings.push('言語需謹慎');
        warnings.push('避免與上司衝突');
        break;
      case '劫財':
        warnings.push('防破財損失');
        warnings.push('不宜合夥投資');
        break;
    }
    
    // Element clash warnings
    const liuNianElement = this.getBranchElement(liuNian.branch);
    const dayElement = this.getStemElement(chart.day.stem);
    
    if (this.isControlling(liuNianElement, dayElement)) {
      warnings.push('流年克日主，壓力較大');
    }
    
    // DaYun conflict warnings
    if (currentDaYun && currentDaYun.analysis.fortune === '困难') {
      warnings.push('大運不利，需格外謹慎');
    }
    
    return warnings;
  }
  
  /**
   * Enhanced opportunity identification
   */
  private static identifyOpportunities(
    liuNian: { stem: string; branch: string },
    chart: BaziChart,
    tenGod: string,
    age: number,
    currentDaYun?: any
  ): string[] {
    const opportunities: string[] = [];
    
    // Ten god based opportunities
    switch (tenGod) {
      case '正官':
        opportunities.push('升職加薪良機');
        opportunities.push('考試順利');
        break;
      case '正財':
        opportunities.push('正財收入增加');
        opportunities.push('投資理財獲利');
        break;
      case '正印':
        opportunities.push('學業進修順利');
        opportunities.push('獲得長輩支持');
        break;
      case '食神':
        opportunities.push('才華得以展現');
        opportunities.push('創業時機成熟');
        break;
    }
    
    // Age-based opportunities
    if (age >= 25 && age <= 35) {
      if (['正官', '正財'].includes(tenGod)) {
        opportunities.push('適合結婚生子');
      }
    }
    
    if (age >= 35 && age <= 45) {
      if (['正財', '偏財'].includes(tenGod)) {
        opportunities.push('事業發展黃金期');
      }
    }
    
    // Special star opportunities
    if (this.hasNoblePersonStar(liuNian, chart)) {
      opportunities.push('貴人運強，把握機會');
    }
    
    if (this.hasWealthStar(liuNian, chart)) {
      opportunities.push('財運亨通，適合投資');
    }
    
    // Favorable DaYun combination
    if (currentDaYun && ['优秀', '良好'].includes(currentDaYun.analysis.fortune)) {
      opportunities.push('運勢配合，事半功倍');
    }
    
    return opportunities;
  }
  
  /**
   * Check for punishment
   */
  private static hasPunishment(yearBranch: string, chart: BaziChart): boolean {
    const branches = [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch];
    
    // Self punishment (自刑)
    const selfPunishments = ['辰', '午', '酉', '亥'];
    if (selfPunishments.includes(yearBranch) && branches.includes(yearBranch)) {
      return true;
    }
    
    // Ungrateful punishment (無恩之刑)
    const ungratefulPairs = [['子', '卯'], ['卯', '子']];
    
    // Bullying punishment (恃勢之刑)
    const bullyingTriples = [
      ['寅', '巳'], ['巳', '申'], ['申', '寅']
    ];
    
    // Uncivilized punishment (無禮之刑)
    const uncivilizedTriples = [
      ['丑', '戌'], ['戌', '未'], ['未', '丑']
    ];
    
    // Check all punishment types
    const allPunishments = [
      ...ungratefulPairs,
      ...bullyingTriples,
      ...uncivilizedTriples
    ];
    
    return allPunishments.some(group => {
      if (group.includes(yearBranch)) {
        return group.some(b => b !== yearBranch && branches.includes(b));
      }
      return false;
    });
  }
  
  /**
   * Check for moving star (驛馬星)
   */
  private static hasMovingStar(yearBranch: string, chart: BaziChart): boolean {
    const movingStars: Record<string, string[]> = {
      '申': ['寅'], '子': ['寅'], '辰': ['寅'],
      '巳': ['亥'], '酉': ['亥'], '丑': ['亥'],
      '寅': ['申'], '午': ['申'], '戌': ['申'],
      '亥': ['巳'], '卯': ['巳'], '未': ['巳']
    };
    
    const dayBranch = chart.day.branch;
    const movingBranches = movingStars[dayBranch] || [];
    return movingBranches.includes(yearBranch);
  }
  
  /**
   * Check for peach blossom (桃花)
   */
  private static hasPeachBlossom(yearBranch: string, chart: BaziChart): boolean {
    const peachBlossoms: Record<string, string[]> = {
      '申': ['酉'], '子': ['酉'], '辰': ['酉'],
      '巳': ['午'], '酉': ['午'], '丑': ['午'],
      '寅': ['卯'], '午': ['卯'], '戌': ['卯'],
      '亥': ['子'], '卯': ['子'], '未': ['子']
    };
    
    const dayBranch = chart.day.branch;
    const peachBranches = peachBlossoms[dayBranch] || [];
    return peachBranches.includes(yearBranch);
  }
  
  /**
   * Check for academic star (文昌星)
   */
  private static hasAcademicStar(
    liuNian: { stem: string; branch: string },
    chart: BaziChart
  ): boolean {
    const academicMap: Record<string, string> = {
      '甲': '巳', '乙': '午', '丙': '申', '丁': '酉',
      '戊': '申', '己': '酉', '庚': '亥', '辛': '子',
      '壬': '寅', '癸': '卯'
    };
    
    const academicBranch = academicMap[chart.day.stem];
    return academicBranch === liuNian.branch;
  }
  
  /**
   * Check for noble person star (天乙貴人)
   */
  private static hasNoblePersonStar(
    liuNian: { stem: string; branch: string },
    chart: BaziChart
  ): boolean {
    const tianYiMap: Record<string, string[]> = {
      '甲': ['丑', '未'], '戊': ['丑', '未'],
      '乙': ['子', '申'], '己': ['子', '申'],
      '丙': ['亥', '酉'], '丁': ['亥', '酉'],
      '庚': ['丑', '未'],
      '辛': ['寅', '午'],
      '壬': ['卯', '巳'],
      '癸': ['卯', '巳']
    };
    
    const tianYiBranches = tianYiMap[chart.day.stem] || [];
    return tianYiBranches.includes(liuNian.branch);
  }
  
  /**
   * Check for wealth star
   */
  private static hasWealthStar(
    liuNian: { stem: string; branch: string },
    chart: BaziChart
  ): boolean {
    const tenGod = this.getTenGod(chart.day.stem, liuNian.stem);
    return ['正財', '偏財'].includes(tenGod);
  }
  
  // Helper methods
  private static getStemElement(stem: string): string {
    const stemData = HEAVENLY_STEMS.find(s => s.name === stem);
    return stemData?.element || '';
  }
  
  private static getBranchElement(branch: string): string {
    const branchData = EARTHLY_BRANCHES.find(b => b.name === branch);
    return branchData?.element || '';
  }
  
  private static isControlling(from: string, to: string): boolean {
    const controlling: Record<string, string> = {
      '木': '土',
      '土': '水',
      '水': '火',
      '火': '金',
      '金': '木'
    };
    return controlling[from] === to;
  }
}