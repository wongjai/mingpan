/**
 * Pattern Analyzer
 * Implements taro-bazi's getSituation pattern recognition system
 * Analyzes BaZi chart patterns and overall structure
 * Returns Chinese text data for UI translation
 */

import { BaziChart } from '../types';
import { HEAVENLY_STEMS, EARTHLY_BRANCHES, TEN_GODS } from '../../../core/constants/bazi';
import { RelationsAnalyzer, RelationsResult } from './RelationsAnalyzer';

export interface PatternAnalysisResult {
  primaryPattern: {
    type: string;           // Chinese name: '正格', '從強格', etc.
    subtype?: string;       // Chinese subtype name if applicable
    strength: number;       // 1-10 confidence in pattern identification
    description: string;    // Chinese description
    priority: number;       // Pattern priority (1-10, higher = more priority)
    characteristics: string[];  // Array of Chinese characteristics
  };
  secondaryPatterns: Array<{
    type: string;
    strength: number;
    description: string;
  }>;
  chartStructure: {
    dayMasterType: string;     // Chinese: '身強', '身弱', '平衡'
    usefulGods: string[];      // Array of Chinese useful gods
    avoidGods: string[];       // Array of Chinese avoid gods
    structureScore: number;    // 0-100 overall structure quality
    balanceType: string;       // Translation key: balanced, unbalanced, extreme
  };
  specialFeatures: Array<{
    type: string;              // Chinese feature type
    description: string;       // Chinese description
    impact: '正面' | '负面' | '中性';
  }>;
  recommendations: {
    favorableElements: string[];     // Array of Chinese element names
    unfavorableElements: string[];   // Array of Chinese element names
    careerSuggestions: string[];     // Array of Chinese suggestions
    lifestyleSuggestions: string[];  // Array of Chinese suggestions
  };
}

export class PatternAnalyzer {
  
  /**
   * Main pattern analysis method - implements taro-bazi's getSituation
   */
  static analyze(chart: BaziChart, relationsResult?: RelationsResult, strengthAnalysis?: any): PatternAnalysisResult {
    // Input validation
    if (!chart || !chart.day || !chart.day.stem) {
      throw new Error('Invalid chart data: missing day master');
    }
    
    // If relations not provided, calculate them
    if (!relationsResult) {
      relationsResult = RelationsAnalyzer.analyze(chart);
    }

    // Step 1: Analyze day master strength
    const dayMasterAnalysis = strengthAnalysis
      ? this.convertStrengthAnalysis(strengthAnalysis, chart)
      : this.analyzeDayMasterStrength(chart, relationsResult);
    
    // Validate day master analysis
    if (!dayMasterAnalysis || dayMasterAnalysis.strength === undefined) {
      throw new Error('Day master analysis failed: invalid strength data');
    }
    
    // Step 2: Identify primary pattern
    const primaryPattern = this.identifyPrimaryPattern(chart, dayMasterAnalysis, relationsResult);
    
    // Critical validation: ensure primaryPattern is never null
    if (!primaryPattern) {
      throw new Error('Failed to identify primary pattern - this should never happen');
    }
    
    // Step 3: Find secondary patterns
    const secondaryPatterns = this.findSecondaryPatterns(chart, relationsResult);
    
    // Step 4: Analyze chart structure
    const chartStructure = this.analyzeChartStructure(chart, dayMasterAnalysis, primaryPattern);
    
    // Step 5: Identify special features
    const specialFeatures = this.identifySpecialFeatures(chart, relationsResult);
    
    // Step 6: Generate recommendations
    const recommendations = this.generateRecommendations(primaryPattern, chartStructure);

    return {
      primaryPattern,
      secondaryPatterns,
      chartStructure,
      specialFeatures,
      recommendations
    };
  }

  /**
   * Analyze day master strength using taro-bazi method
   */
  private static analyzeDayMasterStrength(
    chart: BaziChart, 
    relationsResult: RelationsResult
  ): {
    strength: number;
    type: '身强' | '身弱' | '平衡' | '极端';
    supportingElements: string[];
    drainingElements: string[];
  } {
    let strength = 0;
    const dayMaster = chart.day.stem;
    const dayMasterElement = this.getStemElement(dayMaster);
    
    const supportingElements: string[] = [];
    const drainingElements: string[] = [];

    // Count same element stems (比劫)
    const allStems = [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem];
    const sameElementCount = allStems.filter(stem => 
      this.getStemElement(stem) === dayMasterElement
    ).length;
    strength += sameElementCount * 8;

    // Count generating element stems (印星)
    const generatingElement = this.getGeneratingElement(dayMasterElement);
    const generatingCount = allStems.filter(stem => 
      this.getStemElement(stem) === generatingElement
    ).length;
    strength += generatingCount * 6;
    if (generatingCount > 0) supportingElements.push(generatingElement);

    // Count branches that support day master
    const allBranches = [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch];
    allBranches.forEach(branch => {
      const branchElement = this.getBranchElement(branch);
      if (branchElement === dayMasterElement || branchElement === generatingElement) {
        strength += 4;
        if (!supportingElements.includes(branchElement)) {
          supportingElements.push(branchElement);
        }
      }
    });

    // Subtract draining elements
    const controlledElement = this.getControlledElement(dayMasterElement);
    const controllingElement = this.getControllingElement(dayMasterElement);
    
    const drainingCount = allStems.filter(stem => {
      const element = this.getStemElement(stem);
      return element === controlledElement || element === controllingElement;
    }).length;
    strength -= drainingCount * 4;
    
    if (drainingCount > 0) {
      if (!drainingElements.includes(controlledElement)) drainingElements.push(controlledElement);
      if (!drainingElements.includes(controllingElement)) drainingElements.push(controllingElement);
    }

    // Factor in relationships
    const relationshipModifier = RelationsAnalyzer.getRelationshipModifier(relationsResult);
    strength += relationshipModifier * 10;

    // Determine strength type
    let type: '身强' | '身弱' | '平衡' | '极端';
    if (strength >= 80) type = '极端';
    else if (strength >= 60) type = '身强';
    else if (strength >= 40) type = '平衡';
    else type = '身弱';

    return { strength, type, supportingElements, drainingElements };
  }

  /**
   * Identify primary chart pattern
   */
  private static identifyPrimaryPattern(
    chart: BaziChart,
    dayMasterAnalysis: any,
    relationsResult: RelationsResult
  ): PatternAnalysisResult['primaryPattern'] {
    const { strength, type } = dayMasterAnalysis;
    
    // Priority order of pattern detection (highest to lowest)
    const patterns: Array<PatternAnalysisResult['primaryPattern']> = [];
    
    // 1. Check for transformation patterns (化氣格) - highest priority
    const transformationPattern = this.checkTransformationPattern(chart, relationsResult);
    if (transformationPattern) {
      patterns.push({ ...transformationPattern, priority: 10 });
    }
    
    // 2. Check for follow patterns (從格)
    const followPattern = this.checkFollowPatterns(chart, dayMasterAnalysis, relationsResult);
    if (followPattern) {
      patterns.push({ ...followPattern, priority: 9 });
    }
    
    // 3. Check for dominant element patterns (專旺格)
    const dominantPattern = this.checkDominantElementPattern(chart, relationsResult);
    if (dominantPattern) {
      patterns.push({ ...dominantPattern, priority: 8 });
    }
    
    // 4. Check for special structures
    const specialPattern = this.checkSpecialPatterns(chart, relationsResult);
    if (specialPattern) {
      patterns.push({ ...specialPattern, priority: 7 });
    }
    
    // 5. Check for traditional patterns (建祿格, 羊刃格, etc.)
    const traditionalPattern = this.checkTraditionalPatterns(chart);
    if (traditionalPattern) {
      patterns.push({ ...traditionalPattern, priority: 6 });
    }
    
    // 6. Regular patterns based on day master strength
    if (type === '身強' || type === '身强') {
      patterns.push({
        type: '身旺格',
        strength: 7,
        description: '日主強旺，精力充沛，適合主動發展',
        priority: 5,
        characteristics: ['精力充沛', '領導能力強']
      });
    } else if (type === '身弱') {
      patterns.push({
        type: '身弱格',
        strength: 7,
        description: '日主較弱，需要扶助，適合穩健發展',
        priority: 5,
        characteristics: ['深思熟慮', '善於合作']
      });
    } else if (type === '极端' || type === '極端') {
      patterns.push({
        type: '太旺格',
        strength: 6,
        description: '日主過旺，需要宣洩，注意平衡',
        priority: 4,
        characteristics: ['能量強烈', '需要平衡']
      });
    }
    
    // 7. Default to regular pattern - ALWAYS ensure we have at least one pattern
    if (patterns.length === 0) {
      patterns.push({
        type: '正格',
        strength: 5,
        description: '標準格局，五行較為平衡',
        priority: 3,
        characteristics: ['平衡穩定', '發展均衡']
      });
    }
    
    // Return the highest priority pattern - guaranteed to exist
    const selectedPattern = patterns.sort((a, b) => b.priority - a.priority)[0];
    
    // Final safety check
    if (!selectedPattern) {
      // Emergency fallback - should never reach here
      return {
        type: '正格',
        strength: 5,
        description: '標準格局，五行較為平衡',
        priority: 3,
        characteristics: ['平衡穩定', '發展均衡']
      };
    }
    
    return selectedPattern;
  }

  /**
   * Check for follow-strong pattern (從強格)
   */
  private static isFollowStrongPattern(chart: BaziChart, relationsResult: RelationsResult): boolean {
    // Day master must be extremely strong with overwhelming support
    const dayMaster = chart.day.stem;
    const dayMasterElement = this.getStemElement(dayMaster);
    
    const allStems = [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem];
    const supportCount = allStems.filter(stem => {
      const element = this.getStemElement(stem);
      return element === dayMasterElement || element === this.getGeneratingElement(dayMasterElement);
    }).length;

    // Must have strong relationship support
    const hasStrongSupport = relationsResult.threeHarmonies.length > 0 || 
                           relationsResult.sixHarmonies.length >= 2;

    return supportCount >= 3 && hasStrongSupport;
  }

  /**
   * Check for follow-weak pattern (從弱格)
   */
  private static isFollowWeakPattern(chart: BaziChart): boolean {
    const dayMaster = chart.day.stem;
    const dayMasterElement = this.getStemElement(dayMaster);
    
    const allStems = [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem];
    const supportCount = allStems.filter(stem => {
      const element = this.getStemElement(stem);
      return element === dayMasterElement || element === this.getGeneratingElement(dayMasterElement);
    }).length;

    // Day master has minimal support (only itself)
    return supportCount <= 1;
  }

  /**
   * Check for special structure patterns
   */
  private static isSpecialStructurePattern(chart: BaziChart, relationsResult: RelationsResult): boolean {
    // Check for pure element combinations
    return relationsResult.threeHarmonies.length > 0 || 
           relationsResult.threeMeetings.length > 0 ||
           this.hasDominantElement(chart);
  }

  /**
   * Get special structure subtype
   */
  private static getSpecialStructureSubtype(chart: BaziChart, relationsResult: RelationsResult): string {
    if (relationsResult.threeHarmonies.length > 0) {
      const harmony = relationsResult.threeHarmonies[0];
      return `sanHe${harmony.element}`;
    }
    
    if (relationsResult.threeMeetings.length > 0) {
      const meeting = relationsResult.threeMeetings[0];
      return `sanHui${meeting.element}`;
    }
    
    return 'qita';
  }

  /**
   * Check if chart has dominant element
   */
  private static hasDominantElement(chart: BaziChart): boolean {
    const allStems = [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem];
    const elementCounts: Record<string, number> = {};
    
    allStems.forEach(stem => {
      const element = this.getStemElement(stem);
      elementCounts[element] = (elementCounts[element] || 0) + 1;
    });
    
    return Object.values(elementCounts).some(count => count >= 3);
  }

  /**
   * Find secondary patterns
   */
  private static findSecondaryPatterns(chart: BaziChart, relationsResult: RelationsResult): Array<{
    type: string;
    strength: number;
    description: string;
  }> {
    const patterns = [];

    // Check for noble person patterns
    if (this.hasNoblePersonPattern(chart)) {
      patterns.push({
        type: '天乙貴人',
        strength: 6,
        description: '天乙貴人星入命，有貴人相助'
      });
    }

    // Check for wealth patterns
    if (this.hasWealthPattern(chart)) {
      patterns.push({
        type: '財星格',
        strength: 5,
        description: '財星旺盛，適合經商或理財'
      });
    }

    // Check for officer patterns
    if (this.hasOfficerPattern(chart)) {
      patterns.push({
        type: '官星格',
        strength: 5,
        description: '官星有力，適合公職或管理'
      });
    }

    return patterns;
  }

  /**
   * Analyze overall chart structure
   */
  private static analyzeChartStructure(
    chart: BaziChart,
    dayMasterAnalysis: any,
    primaryPattern: any
  ): PatternAnalysisResult['chartStructure'] {
    const { type: dayMasterType } = dayMasterAnalysis;
    
    // Determine useful and avoid gods based on pattern
    const { usefulGods, avoidGods } = this.determineUsefulGods(chart, primaryPattern, dayMasterAnalysis);
    
    // Calculate structure score
    let structureScore = 50;
    if (primaryPattern.strength >= 8) structureScore += 20;
    if (dayMasterType === '平衡') structureScore += 15;
    if (usefulGods.length > 0) structureScore += 10;
    
    // Determine balance type
    let balanceType = '平衡';
    if (dayMasterAnalysis.strength >= 80) balanceType = '極端';
    else if (dayMasterAnalysis.strength <= 20) balanceType = '極端';
    else if (Math.abs(dayMasterAnalysis.strength - 50) > 20) balanceType = '不平衡';

    return {
      dayMasterType: dayMasterAnalysis.originalStrength 
        ? this.mapDetailedStrengthToType(dayMasterAnalysis.originalStrength)
        : this.mapStrengthToType(dayMasterAnalysis.type, dayMasterAnalysis.strength),
      usefulGods,
      avoidGods,
      structureScore: Math.min(100, structureScore),
      balanceType
    };
  }

  /**
   * Convert StrengthAnalyzer result to internal format
   */
  private static convertStrengthAnalysis(strengthAnalysis: any, chart: BaziChart): any {
    // Map detailed strength to basic type
    let type: '身強' | '身弱' | '平衡' | '極端';
    const dayMasterStrength = strengthAnalysis.dayMasterStrength;
    
    switch(dayMasterStrength) {
      case '衰極':
      case '身弱':
      case '偏弱':
        type = '身弱';
        break;
      case '中和':
        type = '平衡';
        break;
      case '偏強':
      case '身旺':
      case '旺極':
        type = '身強';
        break;
      default:
        type = '平衡';
    }
    
    return {
      // 🟠-6 修正：用 percentage（日主力量佔比 0-100）對齊 checkFollowPatterns 的 80/20 閾值；
      // 原用 totalScore（±360）量綱不符，令中和偏弱命盤被誤判從格。
      strength: strengthAnalysis.percentage ?? 50,
      type,
      originalStrength: dayMasterStrength,
      // 🟠-6 修正：由命盤計算生扶日主的五行（印星＋地支根），原硬編碼 [] 令從旺格永不成立。
      supportingElements: this.computeSupportingElements(chart),
      drainingElements: []
    };
  }

  /**
   * 計算生扶日主的五行（印星出現於天干 + 地支藏日主或印之根）
   * 與 analyzeDayMasterStrength 的 supportingElements 邏輯一致，供 convertStrengthAnalysis 共用
   */
  private static computeSupportingElements(chart: BaziChart): string[] {
    const dayMasterElement = this.getStemElement(chart.day.stem);
    const generatingElement = this.getGeneratingElement(dayMasterElement);
    const supporting: string[] = [];
    const allStems = [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem];
    if (allStems.some(s => this.getStemElement(s) === generatingElement)) {
      supporting.push(generatingElement);
    }
    const allBranches = [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch];
    allBranches.forEach(b => {
      const be = this.getBranchElement(b);
      if ((be === dayMasterElement || be === generatingElement) && !supporting.includes(be)) {
        supporting.push(be);
      }
    });
    return supporting;
  }
  
  /**
   * Map strength analysis type to display type
   */
  private static mapStrengthToType(type: string, strength: number): string {
    // For extreme cases, determine if it's extremely weak or strong
    if (type === '極端') {
      return strength <= 20 ? '身弱' : '身強';
    }
    
    // Map type to simplified categories
    switch(type) {
      case '身强':  // 身强
        return '身強';
      case '身弱':  // 身弱
        return '身弱';
      case '平衡':  // 平衡
        return '平衡';
      default:
        // For any other case, determine based on strength value
        if (strength <= 40) return '身弱';
        if (strength >= 60) return '身強';
        return '平衡';
    }
  }
  
  /**
   * Map detailed strength levels to display type
   */
  private static mapDetailedStrengthToType(strength: string): string {
    switch(strength) {
      case '衰极':
      case '身弱':
      case '偏弱':
        return '身弱';
      case '中和':
        return '平衡';
      case '偏强':
      case '身旺':
      case '旺极':
        return '身強';
      default:
        return '平衡'; // Default to balanced for unknown values
    }
  }
  
  /**
   * Determine useful and avoid gods based on pattern type
   * This affects YongShen determination
   */
  private static determineUsefulGods(chart: BaziChart, primaryPattern: any, dayMasterAnalysis: any): {
    usefulGods: string[];
    avoidGods: string[];
  } {
    const usefulGods: string[] = [];
    const avoidGods: string[] = [];
    
    const dayMasterElement = this.getStemElement(chart.day.stem);
    const patternType = primaryPattern.type;
    
    // Pattern-specific god determination
    switch (patternType) {
      // Follow patterns - go with the flow
      case '從旺格':
      case '從強格':
        // Support the strong trend
        usefulGods.push(dayMasterElement);
        usefulGods.push(this.getGeneratingElement(dayMasterElement));
        avoidGods.push(this.getControllingElement(dayMasterElement));
        avoidGods.push(this.getControlledElement(dayMasterElement));
        break;
        
      case '從兒格':
        // Support output elements
        const outputElement = this.getControlledElement(dayMasterElement);
        usefulGods.push(outputElement);
        usefulGods.push(this.getControlledElement(outputElement));
        avoidGods.push(this.getControllingElement(dayMasterElement));
        avoidGods.push(this.getGeneratingElement(dayMasterElement));
        break;
        
      case '從財格':
        // Support wealth elements
        const wealthElement = this.getControllingElement(this.getControlledElement(dayMasterElement));
        usefulGods.push(wealthElement);
        usefulGods.push(this.getControlledElement(dayMasterElement));
        avoidGods.push(dayMasterElement);
        avoidGods.push(this.getGeneratingElement(dayMasterElement));
        break;
        
      case '從官格':
        // Support officer elements
        const officerElement = this.getControllingElement(dayMasterElement);
        usefulGods.push(officerElement);
        usefulGods.push(this.getGeneratingElement(officerElement));
        avoidGods.push(dayMasterElement);
        avoidGods.push(this.getControlledElement(dayMasterElement));
        break;
        
      case '從勢格':
      case '從弱格':
        // Support the dominant elements in the chart
        const elementCounts = this.countElements(chart);
        const sortedElements = Object.entries(elementCounts)
          .filter(([elem, ]) => elem !== dayMasterElement)
          .sort(([, a], [, b]) => b - a);
        
        if (sortedElements.length > 0) {
          usefulGods.push(sortedElements[0][0]);
          if (sortedElements.length > 1) {
            usefulGods.push(sortedElements[1][0]);
          }
        }
        avoidGods.push(dayMasterElement);
        avoidGods.push(this.getGeneratingElement(dayMasterElement));
        break;
        
      // Transformation patterns
      case '化氣格':
        // Support the transformed element
        const transformedElement = primaryPattern.subtype?.split('化氣')[1];
        if (transformedElement) {
          usefulGods.push(transformedElement);
          usefulGods.push(this.getGeneratingElement(transformedElement));
          // Avoid elements that conflict with transformation
          avoidGods.push(this.getControllingElement(transformedElement));
        }
        break;
        
      // Dominant element patterns
      case '曲直格': // Wood
        usefulGods.push('木', '水');
        avoidGods.push('金');
        break;
      case '炎上格': // Fire
        usefulGods.push('火', '木');
        avoidGods.push('水');
        break;
      case '稼穡格': // Earth
        usefulGods.push('土', '火');
        avoidGods.push('木');
        break;
      case '從革格': // Metal
        usefulGods.push('金', '土');
        avoidGods.push('火');
        break;
      case '潤下格': // Water
        usefulGods.push('水', '金');
        avoidGods.push('土');
        break;
        
      // Traditional patterns
      case '建祿格':
      case '羊刃格':
        // These patterns indicate strong day master
        usefulGods.push(this.getControlledElement(dayMasterElement));
        usefulGods.push(this.getControllingElement(this.getControlledElement(dayMasterElement)));
        avoidGods.push(dayMasterElement);
        avoidGods.push(this.getGeneratingElement(dayMasterElement));
        break;
        
      // Regular strength-based patterns
      case '身弱格':
        // Weak day master needs support
        usefulGods.push(this.getGeneratingElement(dayMasterElement));
        usefulGods.push(dayMasterElement);
        avoidGods.push(this.getControlledElement(dayMasterElement));
        avoidGods.push(this.getControllingElement(dayMasterElement));
        break;
        
      case '身旺格':
      case '太旺格':
        // Strong day master needs draining
        usefulGods.push(this.getControlledElement(dayMasterElement));
        usefulGods.push(this.getControllingElement(this.getControlledElement(dayMasterElement)));
        avoidGods.push(this.getGeneratingElement(dayMasterElement));
        avoidGods.push(dayMasterElement);
        break;
        
      default:
        // Balanced pattern - flexible approach
        if (dayMasterAnalysis.strength > 50) {
          usefulGods.push(this.getControlledElement(dayMasterElement));
          avoidGods.push(this.getGeneratingElement(dayMasterElement));
        } else {
          usefulGods.push(this.getGeneratingElement(dayMasterElement));
          avoidGods.push(this.getControlledElement(dayMasterElement));
        }
        break;
    }
    
    // Remove duplicates
    return {
      usefulGods: [...new Set(usefulGods)],
      avoidGods: [...new Set(avoidGods)]
    };
  }

  /**
   * Identify special features
   */
  private static identifySpecialFeatures(chart: BaziChart, relationsResult: RelationsResult): Array<{
    type: string;
    description: string;
    impact: '正面' | '负面' | '中性';
  }> {
    const features: Array<{
      type: string;
      description: string;
      impact: '正面' | '负面' | '中性';
    }> = [];

    // Check for major relationship patterns
    if (relationsResult.threeHarmonies.length > 0) {
      features.push({
        type: '三合',
        description: '出現三合局，力量集中',
        impact: '正面'
      });
    }

    if (relationsResult.sixConflicts.length >= 2) {
      features.push({
        type: '多衝',
        description: '出現多個衝克關係，易有動盪',
        impact: '负面'
      });
    }

    // Check for empty pillars
    if (this.hasEmptyPillars(chart)) {
      features.push({
        type: '空亡',
        description: '命中有空亡，需特別注意',
        impact: '中性' as const
      });
    }

    return features;
  }

  /**
   * Generate pattern-based recommendations
   */
  private static generateRecommendations(primaryPattern: any, chartStructure: any): PatternAnalysisResult['recommendations'] {
    const favorableElements: string[] = [];
    const unfavorableElements: string[] = [];
    const careerSuggestions: string[] = [];
    const lifestyleSuggestions: string[] = [];

    // Extract elements from useful/avoid gods
    chartStructure.usefulGods.forEach((god: string) => {
      const element = god.replace('elements.', '');
      favorableElements.push(element);
    });

    chartStructure.avoidGods.forEach((god: string) => {
      const element = god.replace('elements.', '');
      unfavorableElements.push(element);
    });

    // Pattern-specific career and lifestyle suggestions
    const patternType = primaryPattern.type;
    
    switch (patternType) {
      // Follow patterns
      case '從旺格':
      case '從強格':
        careerSuggestions.push('適合領導職位');
        careerSuggestions.push('獨立創業');
        careerSuggestions.push('管理經營');
        lifestyleSuggestions.push('果斷決策');
        lifestyleSuggestions.push('保持自信');
        break;
        
      case '從兒格':
        careerSuggestions.push('創意產業');
        careerSuggestions.push('藝術表演');
        careerSuggestions.push('媒體傳播');
        lifestyleSuggestions.push('充分表達自我');
        lifestyleSuggestions.push('保持創新思維');
        break;
        
      case '從財格':
        careerSuggestions.push('商業經營');
        careerSuggestions.push('金融理財');
        careerSuggestions.push('投資管理');
        lifestyleSuggestions.push('講求實際');
        lifestyleSuggestions.push('重視物質基礎');
        break;
        
      case '從官格':
        careerSuggestions.push('公職人員');
        careerSuggestions.push('管理階層');
        careerSuggestions.push('法律相關');
        lifestyleSuggestions.push('紀律嚴明');
        lifestyleSuggestions.push('組織有序');
        break;
        
      case '從勢格':
      case '從弱格':
        careerSuggestions.push('支援服務');
        careerSuggestions.push('服務業');
        careerSuggestions.push('團隊合作');
        lifestyleSuggestions.push('靈活適應');
        lifestyleSuggestions.push('合作共贏');
        break;
        
      // Transformation patterns
      case '化氣格':
        careerSuggestions.push('專業技術');
        careerSuggestions.push('技術研發');
        lifestyleSuggestions.push('專注目標');
        lifestyleSuggestions.push('不斷轉型');
        break;
        
      // Dominant element patterns
      case '曲直格': // Wood
        careerSuggestions.push('教育培訓');
        careerSuggestions.push('成長發展');
        careerSuggestions.push('環保產業');
        lifestyleSuggestions.push('持續成長');
        lifestyleSuggestions.push('不斷學習');
        break;
        
      case '炎上格': // Fire
        careerSuggestions.push('娛樂表演');
        careerSuggestions.push('科技產業');
        careerSuggestions.push('能源產業');
        lifestyleSuggestions.push('熱情奔放');
        lifestyleSuggestions.push('充滿活力');
        break;
        
      case '稼穡格': // Earth
        careerSuggestions.push('房地產業');
        careerSuggestions.push('農業發展');
        careerSuggestions.push('諮詢服務');
        lifestyleSuggestions.push('穩定踏實');
        lifestyleSuggestions.push('養育關懷');
        break;
        
      case '從革格': // Metal
        careerSuggestions.push('工程技術');
        careerSuggestions.push('軍事國防');
        careerSuggestions.push('精密製造');
        lifestyleSuggestions.push('結構嚴謹');
        lifestyleSuggestions.push('精緷優雅');
        break;
        
      case '潤下格': // Water
        careerSuggestions.push('傳播媒體');
        careerSuggestions.push('物流運輸');
        careerSuggestions.push('研究開發');
        lifestyleSuggestions.push('靈活變通');
        lifestyleSuggestions.push('智慧思考');
        break;
        
      // Special patterns
      case '五行俱全格':
        careerSuggestions.push('多元發展');
        careerSuggestions.push('全能型人才');
        lifestyleSuggestions.push('平衡發展');
        lifestyleSuggestions.push('多元興趣');
        break;
        
      case '魁罡格':
        careerSuggestions.push('領導管理');
        careerSuggestions.push('軍警法務');
        careerSuggestions.push('執法部門');
        lifestyleSuggestions.push('威嚴果斷');
        lifestyleSuggestions.push('決策果敢');
        break;
        
      // Traditional patterns
      case '建祿格':
        careerSuggestions.push('自主創業');
        careerSuggestions.push('專業技能');
        lifestyleSuggestions.push('獨立自主');
        lifestyleSuggestions.push('自力更生');
        break;
        
      case '羊刃格':
        careerSuggestions.push('競爭激烈行業');
        careerSuggestions.push('體育運動');
        careerSuggestions.push('業務銷售');
        lifestyleSuggestions.push('積極主動');
        lifestyleSuggestions.push('喜歡競爭');
        break;
        
      // Regular patterns
      case '身旺格':
        careerSuggestions.push('領導管理');
        careerSuggestions.push('積極開拓');
        lifestyleSuggestions.push('充滿活力');
        lifestyleSuggestions.push('主動出擊');
        break;
        
      case '身弱格':
        careerSuggestions.push('支援服務');
        careerSuggestions.push('分析研究');
        lifestyleSuggestions.push('深思熟慮');
        lifestyleSuggestions.push('謹慎小心');
        break;
        
      default:
        careerSuggestions.push('穩定職業');
        careerSuggestions.push('傳統行業');
        lifestyleSuggestions.push('平衡生活');
        lifestyleSuggestions.push('中庸之道');
        break;
    }

    // Add general suggestions based on structure score
    if (chartStructure.structureScore < 50) {
      lifestyleSuggestions.push('持續改善');
      lifestyleSuggestions.push('尋求指導');
    }

    return {
      favorableElements: [...new Set(favorableElements)],
      unfavorableElements: [...new Set(unfavorableElements)],
      careerSuggestions: [...new Set(careerSuggestions)],
      lifestyleSuggestions: [...new Set(lifestyleSuggestions)]
    };
  }

  /**
   * Check for transformation patterns (化氣格)
   * Based on stem combinations with monthly branch support
   */
  private static checkTransformationPattern(
    chart: BaziChart,
    relationsResult: RelationsResult
  ): PatternAnalysisResult['primaryPattern'] | null {
    const dayMaster = chart.day.stem;
    const allStems = [chart.year.stem, chart.month.stem, chart.hour.stem];
    const monthBranch = chart.month.branch;
    
    // Transformation combinations: [stem1, stem2, supportBranches, element]
    const transformations: Array<[string, string, string[], string]> = [
      ['甲', '己', ['辰', '戌', '丑', '未'], '土'],
      ['乙', '庚', ['申', '酉', '戌'], '金'],
      ['丙', '辛', ['亥', '子', '丑'], '水'],
      ['丁', '壬', ['寅', '卯', '辰'], '木'],
      ['戊', '癸', ['巳', '午', '未'], '火']
    ];
    
    for (const [stem1, stem2, supportBranches, element] of transformations) {
      if (dayMaster === stem1 && allStems.includes(stem2)) {
        if (supportBranches.includes(monthBranch)) {
          return {
            type: '化氣格',
            subtype: `化氣${element}格`,
            strength: 9,
            description: `化為${element}氣，特殊轉化格局`,
            priority: 10,
            characteristics: ['轉化特質', `${element}行屬性`]
          };
        }
      } else if (dayMaster === stem2 && allStems.includes(stem1 as string)) {
        if ((supportBranches as string[]).includes(monthBranch)) {
          return {
            type: '化氣格',
            subtype: `化氣${element}格`,
            strength: 9,
            description: `化為${element}氣，特殊轉化格局`,
            priority: 10,
            characteristics: ['轉化特質', `${element}行屬性`]
          };
        }
      }
    }
    
    return null;
  }
  
  /**
   * Check for follow patterns (從格)
   * Including 從兒格, 從財格, 從官格, 從勢格, 從旺格
   */
  private static checkFollowPatterns(
    chart: BaziChart,
    dayMasterAnalysis: any,
    relationsResult: RelationsResult
  ): PatternAnalysisResult['primaryPattern'] | null {
    const dayMaster = chart.day.stem;
    const dayMasterElement = this.getStemElement(dayMaster);
    const { strength, supportingElements, drainingElements } = dayMasterAnalysis;
    
    // Count ten gods appearances
    const tenGodCounts = this.countTenGods(chart);
    
    // 從旺格 - Follow strong pattern
    if (strength >= 80 && supportingElements.length >= 2) {
      return {
        type: '從旺格',
        strength: 9,
        description: '日主極強，順勢而為',
        priority: 9,
        characteristics: ['極度強旺', '獨立自主']
      };
    }
    
    // 從弱格 - Follow weak pattern (day master has minimal support)
    if (strength <= 20 && supportingElements.length === 0) {
      // Check which element is dominant to determine subtype
      
      // 從兒格 - Follow output pattern
      if (tenGodCounts['食神'] + tenGodCounts['傷官'] >= 3) {
        return {
          type: '從兒格',
          strength: 9,
          description: '食傷旺盛，從兒之格',
          priority: 9,
          characteristics: ['創意豐富', '表達能力強']
        };
      }
      
      // 從財格 - Follow wealth pattern
      if (tenGodCounts['正財'] + tenGodCounts['偏財'] >= 3) {
        return {
          type: '從財格',
          strength: 9,
          description: '財星旺盛，從財之格',
          priority: 9,
          characteristics: ['財運亨通', '實際務實']
        };
      }
      
      // 從官格 - Follow officer pattern
      if (tenGodCounts['正官'] + tenGodCounts['七殺'] >= 3) {
        return {
          type: '從官格',
          strength: 9,
          description: '官星旺盛，從官之格',
          priority: 9,
          characteristics: ['權威影響力', '紀律嚴明']
        };
      }
      
      // 從勢格 - Follow trend pattern (general weak follow)
      return {
        type: '從勢格',
        strength: 8,
        description: '順從大勢，從勢之格',
        priority: 8,
        characteristics: ['適應力強', '善於合作']
      };
    }
    
    return null;
  }
  
  /**
   * Check for dominant element patterns (專旺格)
   * Including 曲直格, 炎上格, 稼穡格, 從革格, 潤下格
   */
  private static checkDominantElementPattern(
    chart: BaziChart,
    relationsResult: RelationsResult
  ): PatternAnalysisResult['primaryPattern'] | null {
    const elementCounts = this.countElements(chart);
    const dominantElement = Object.entries(elementCounts)
      .sort(([, a], [, b]) => b - a)[0];
    
    // Need at least 5 out of 8 positions to be the same element
    if (dominantElement[1] >= 5) {
      const element = dominantElement[0];
      const patterns: Record<string, any> = {
        '木': {
          type: '曲直格',
          description: '木氣純粹，曲直之格',
          characteristics: ['生長發展', '靈活變通']
        },
        '火': {
          type: '炎上格',
          description: '火氣純粹，炎上之格',
          characteristics: ['熱情奔放', '光明磊落']
        },
        '土': {
          type: '稼穡格',
          description: '土氣純粹，稼穡之格',
          characteristics: ['穩定實在', '調和養育']
        },
        '金': {
          type: '從革格',
          description: '金氣純粹，從革之格',
          characteristics: ['果敢決斷', '精緷完美']
        },
        '水': {
          type: '潤下格',
          description: '水氣純粹，潤下之格',
          characteristics: ['流動變化', '智慧深沉']
        }
      };
      
      if (patterns[element]) {
        return {
          ...patterns[element],
          strength: 9,
          priority: 8
        };
      }
    }
    
    return null;
  }
  
  /**
   * Check for special patterns
   * Including 兩神成象格, 五行俱全格, 天元一氣格, 地支一氣格, 魁罡格, 金神格
   */
  private static checkSpecialPatterns(
    chart: BaziChart,
    relationsResult: RelationsResult
  ): PatternAnalysisResult['primaryPattern'] | null {
    // 五行俱全格 - All five elements present
    const elementCounts = this.countElements(chart);
    if (Object.keys(elementCounts).length === 5 && Object.values(elementCounts).every(count => count > 0)) {
      return {
        type: '五行俱全格',
        strength: 8,
        description: '五行俱全，各元素皆備',
        priority: 7,
        characteristics: ['完整無缺', '多才多藝']
      };
    }
    
    // 兩神成象格 - Two elements dominate
    const sortedElements = Object.entries(elementCounts)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a);
    
    if (sortedElements.length === 2 && sortedElements[0][1] + sortedElements[1][1] >= 7) {
      return {
        type: '兩神成象格',
        strength: 8,
        description: '兩神成象，專精特化',
        priority: 7,
        characteristics: ['專注集中', '特化發展']
      };
    }
    
    // 天元一氣格 - All heavenly stems are the same
    const stems = [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem];
    if (new Set(stems).size === 1) {
      return {
        type: '天元一氣格',
        strength: 9,
        description: '天元一氣，純粹集中',
        priority: 8,
        characteristics: ['純粹無雜', '高度集中']
      };
    }
    
    // 地支一氣格 - All earthly branches are the same element
    const branches = [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch];
    const branchElements = branches.map(b => this.getBranchElement(b));
    if (new Set(branchElements).size === 1) {
      return {
        type: '地支一氣格',
        strength: 8,
        description: '地支一氣，統一協調',
        priority: 7,
        characteristics: ['根基穩固', '統一協調']
      };
    }
    
    // 魁罡格 - Day pillar is 庚辰, 庚戌, 戊辰, or 戊戌
    const kuiGangPillars = ['庚辰', '庚戌', '戊辰', '戊戌'];
    const dayPillar = chart.day.stem + chart.day.branch;
    if (kuiGangPillars.includes(dayPillar)) {
      return {
        type: '魁罡格',
        strength: 8,
        description: '魁罡入命，威權顯赫',
        priority: 7,
        characteristics: ['權威強大', '威嚴統御']
      };
    }
    
    // 金神格 - Specific combinations with metal elements
    if (this.checkJinShenPattern(chart)) {
      return {
        type: '金神格',
        strength: 8,
        description: '金神入命，銳利精明',
        priority: 7,
        characteristics: ['銳利果敢', '策略精明']
      };
    }
    
    return null;
  }
  
  /**
   * Check for traditional patterns from taro-bazi
   * Including 建祿格, 羊刃格, etc.
   */
  private static checkTraditionalPatterns(
    chart: BaziChart
  ): PatternAnalysisResult['primaryPattern'] | null {
    const dayMaster = chart.day.stem;
    const monthBranch = chart.month.branch;
    const monthHiddenStems = this.getHiddenStems(monthBranch);
    
    // 建祿格 - Day master at prosperous position
    if (monthHiddenStems[0] === dayMaster) {
      return {
        type: '建祿格',
        strength: 8,
        description: '月支帶祿，自力更生',
        priority: 6,
        characteristics: ['自力更生', '能力出眾']
      };
    }
    
    // 羊刃格 - Yang blade pattern
    const yangBladeMap: Record<string, string> = {
      '甲': '卯', '丙': '午', '戊': '午', '庚': '酉', '壬': '子'
    };
    
    if (yangBladeMap[dayMaster] === monthBranch) {
      return {
        type: '羊刃格',
        strength: 8,
        description: '月支為刃，剛強威猛',
        priority: 6,
        characteristics: ['剛強進取', '競爭力強']
      };
    }
    
    return null;
  }
  
  /**
   * Count ten gods appearances in the chart
   */
  private static countTenGods(chart: BaziChart): Record<string, number> {
    const counts: Record<string, number> = {
      '比肩': 0, '劫財': 0, '食神': 0, '傷官': 0,
      '正財': 0, '偏財': 0, '正官': 0, '七殺': 0,
      '正印': 0, '偏印': 0
    };
    
    const dayMaster = chart.day.stem;
    const allStems = [chart.year.stem, chart.month.stem, chart.hour.stem];
    const allBranches = [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch];
    
    // Count stems
    allStems.forEach(stem => {
      const tenGod = TEN_GODS[dayMaster]?.[stem];
      if (tenGod && counts[tenGod] !== undefined) {
        counts[tenGod]++;
      }
    });
    
    // Count hidden stems in branches
    allBranches.forEach(branch => {
      const hiddenStems = this.getHiddenStems(branch);
      hiddenStems.forEach(stem => {
        const tenGod = TEN_GODS[dayMaster]?.[stem];
        if (tenGod && counts[tenGod] !== undefined) {
          counts[tenGod]++;
        }
      });
    });
    
    return counts;
  }
  
  /**
   * Count elements in the chart
   */
  private static countElements(chart: BaziChart): Record<string, number> {
    const counts: Record<string, number> = {
      '木': 0, '火': 0, '土': 0, '金': 0, '水': 0
    };
    
    // Count stem elements
    const allStems = [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem];
    allStems.forEach(stem => {
      const element = this.getStemElement(stem);
      if (element) counts[element]++;
    });
    
    // Count branch elements
    const allBranches = [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch];
    allBranches.forEach(branch => {
      const element = this.getBranchElement(branch);
      if (element) counts[element]++;
    });
    
    return counts;
  }
  
  /**
   * Check for Jin Shen pattern
   */
  private static checkJinShenPattern(chart: BaziChart): boolean {
    // Jin Shen pattern requires specific day pillars with metal dominance
    const jinShenDays = ['乙丑', '己巳', '癸酉'];
    const dayPillar = chart.day.stem + chart.day.branch;
    
    if (!jinShenDays.includes(dayPillar)) return false;
    
    // Count metal elements
    const elementCounts = this.countElements(chart);
    return elementCounts['金'] >= 3;
  }
  
  /**
   * Get hidden stems for a branch
   */
  private static getHiddenStems(branch: string): string[] {
    const hiddenStemsMap: Record<string, string[]> = {
      '子': ['癸'],
      '丑': ['己', '癸', '辛'],
      '寅': ['甲', '丙', '戊'],
      '卯': ['乙'],
      '辰': ['戊', '乙', '癸'],
      '巳': ['丙', '戊', '庚'],
      '午': ['丁', '己'],
      '未': ['己', '丁', '乙'],
      '申': ['庚', '壬', '戊'],
      '酉': ['辛'],
      '戌': ['戊', '辛', '丁'],
      '亥': ['壬', '甲']
    };
    
    return hiddenStemsMap[branch] || [];
  }
  
  // Helper methods
  private static hasNoblePersonPattern(chart: BaziChart): boolean {
    // Implementation for noble person star detection
    // This would check for specific combinations that indicate noble person stars
    const dayMaster = chart.day.stem;
    const dayBranch = chart.day.branch;
    
    // Simplified noble person detection based on day master
    const noblePersonMap: Record<string, string[]> = {
      '甲': ['丑', '未'], '戊': ['丑', '未'],
      '乙': ['子', '申'], '己': ['子', '申'],
      '丙': ['亥', '酉'], '丁': ['亥', '酉'],
      '庚': ['寅', '午'], '辛': ['寅', '午'],
      '壬': ['卯', '巳'], '癸': ['卯', '巳']
    };
    
    const nobleBranches = noblePersonMap[dayMaster] || [];
    const allBranches = [chart.year.branch, chart.month.branch, chart.hour.branch];
    
    return allBranches.some(branch => nobleBranches.includes(branch));
  }

  private static hasWealthPattern(chart: BaziChart): boolean {
    const dayMaster = chart.day.stem;
    const allStems = [chart.year.stem, chart.month.stem, chart.hour.stem];
    return allStems.some(stem => {
      const tenGod = TEN_GODS[dayMaster]?.[stem];
      return tenGod === '正財' || tenGod === '偏財';
    });
  }

  private static hasOfficerPattern(chart: BaziChart): boolean {
    const dayMaster = chart.day.stem;
    const allStems = [chart.year.stem, chart.month.stem, chart.hour.stem];
    return allStems.some(stem => {
      const tenGod = TEN_GODS[dayMaster]?.[stem];
      return tenGod === '正官' || tenGod === '七殺';
    });
  }

  private static hasEmptyPillars(chart: BaziChart): boolean {
    // Check for missing elements or weak pillars
    return false; // Simplified
  }

  // Element relationship helpers
  private static getStemElement(stem: string): string {
    const stemData = HEAVENLY_STEMS.find(s => s.name === stem);
    return stemData?.element || '';
  }

  private static getBranchElement(branch: string): string {
    const branchData = EARTHLY_BRANCHES.find(b => b.name === branch);
    return branchData?.element || '';
  }

  private static getGeneratingElement(element: string): string {
    const cycle: Record<string, string> = {
      '水': '金', '木': '水', '火': '木', '土': '火', '金': '土'
    };
    return cycle[element] || '';
  }

  private static getControlledElement(element: string): string {
    const cycle: Record<string, string> = {
      '木': '火', '火': '土', '土': '金', '金': '水', '水': '木'
    };
    return cycle[element] || '';
  }

  private static getControllingElement(element: string): string {
    const cycle: Record<string, string> = {
      '木': '金', '火': '水', '土': '木', '金': '火', '水': '土'
    };
    return cycle[element] || '';
  }
}