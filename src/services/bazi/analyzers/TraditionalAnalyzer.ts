/**
 * Traditional BaZi Analyzer
 * Analyzes Yong Shen (用神) and Ge Ju (格局)
 */

import { 
  BaziChart, 
  YongShenAnalysis, 
  GeJuAnalysis, 
  FiveElementsAnalysis,
  DayMasterStrength 
} from '../types';
import { 
  HEAVENLY_STEMS, 
  EARTHLY_BRANCHES,
  FIVE_ELEMENTS_ARRAY,
  FIVE_ELEMENTS_RELATIONS,
  BRANCH_RELATIONS
} from '../../../core/constants/bazi';
import { StrengthAnalyzer } from './StrengthAnalyzer';

export class TraditionalAnalyzer {
  /**
   * Perform traditional BaZi analysis
   */
  static analyze(
    chart: BaziChart, 
    fiveElements: FiveElementsAnalysis,
    dayMasterElement: string
  ): {
    yongShen: YongShenAnalysis;
    geJu: GeJuAnalysis;
    strength: DayMasterStrength;
  } {
    // Use StrengthAnalyzer for consistent strength calculation
    const strengthAnalysis = StrengthAnalyzer.analyzeDayMasterStrength(chart);
    const strength = strengthAnalysis.strength;
    
    // Analyze Yong Shen based on strength
    const yongShen = this.analyzeYongShen(chart, fiveElements, dayMasterElement, strength);
    
    // Analyze Ge Ju (pattern)
    const geJu = this.analyzeGeJu(chart, dayMasterElement);
    
    return {
      yongShen,
      geJu,
      strength
    };
  }
  
  /**
   * Analyze day master strength based on five elements distribution
   */
  private static analyzeDayMasterStrength(
    fiveElements: FiveElementsAnalysis,
    dayMasterElement: string
  ): DayMasterStrength {
    // Create element map using constants
    const elementMap: Record<string, number> = {
      [FIVE_ELEMENTS_ARRAY[0]]: fiveElements.木,   // 木
      [FIVE_ELEMENTS_ARRAY[1]]: fiveElements.火,   // 火
      [FIVE_ELEMENTS_ARRAY[2]]: fiveElements.土,  // 土
      [FIVE_ELEMENTS_ARRAY[3]]: fiveElements.金,  // 金
      [FIVE_ELEMENTS_ARRAY[4]]: fiveElements.水   // 水
    };
    
    const dayMasterCount = elementMap[dayMasterElement] || 0;
    const total = fiveElements.total;
    const percentage = (dayMasterCount / total) * 100;
    
    // Consider supporting elements
    const supportingElement = this.getGeneratingElement(dayMasterElement);
    const supportCount = elementMap[supportingElement] || 0;
    const totalSupport = dayMasterCount + supportCount * 0.7;
    const supportPercentage = (totalSupport / total) * 100;
    
    if (supportPercentage < 15) return '衰极';
    if (supportPercentage < 25) return '偏弱';
    if (supportPercentage < 35) return '中和';
    if (supportPercentage < 45) return '身旺';
    return '旺极';
  }
  
  /**
   * Analyze Yong Shen (用神)
   */
  private static analyzeYongShen(
    chart: BaziChart,
    fiveElements: FiveElementsAnalysis,
    dayMasterElement: string,
    strength: DayMasterStrength
  ): YongShenAnalysis {
    const yongShen: string[] = [];
    const xiShen: string[] = [];
    const jiShen: string[] = [];
    const xianShen: string[] = [];
    
    // Determine Yong Shen based on day master strength
    if (strength === '衰极') {
      // Too weak - use same element and generating element
      yongShen.push(dayMasterElement);
      const generating = this.getGeneratingElement(dayMasterElement);
      yongShen.push(generating);
      xiShen.push(generating);
      
      // Ji Shen - controlling and draining elements
      jiShen.push(this.getControllingElement(dayMasterElement));
      jiShen.push(this.getDrainingElement(dayMasterElement));
      jiShen.push(this.getControlledElement(dayMasterElement));
    } else if (strength === '偏弱' || strength === '身弱') {
      // Weak - primarily use generating element
      const generating = this.getGeneratingElement(dayMasterElement);
      yongShen.push(generating);
      xiShen.push(dayMasterElement);
      
      // Ji Shen - controlling element
      jiShen.push(this.getControllingElement(dayMasterElement));
      
      // Xian Shen - neutral elements
      xianShen.push(this.getDrainingElement(dayMasterElement));
      xianShen.push(this.getControlledElement(dayMasterElement));
    } else if (strength === '中和') {
      // Normal - need balance based on what's missing
      if (fiveElements.balance.missing.length > 0) {
        yongShen.push(...fiveElements.balance.missing);
      } else {
        // Use elements that create circulation
        const controlled = this.getControlledElement(dayMasterElement);
        yongShen.push(controlled);
        xiShen.push(this.getDrainingElement(dayMasterElement));
      }
    } else if (strength === '偏强' || strength === '身旺') {
      // Strong - use draining and controlled elements
      yongShen.push(this.getDrainingElement(dayMasterElement));
      xiShen.push(this.getControlledElement(dayMasterElement));
      
      // Ji Shen - same and generating elements
      jiShen.push(dayMasterElement);
      jiShen.push(this.getGeneratingElement(dayMasterElement));
    } else {
      // Too strong - follow the strength
      yongShen.push(dayMasterElement);
      xiShen.push(this.getGeneratingElement(dayMasterElement));
      
      // Ji Shen - controlling element
      jiShen.push(this.getControllingElement(dayMasterElement));
    }
    
    // Generate explanation
    const explanation = this.generateYongShenExplanation(strength, dayMasterElement, yongShen);
    
    return {
      yongShen: [...new Set(yongShen)],
      xiShen: [...new Set(xiShen)],
      jiShen: [...new Set(jiShen)],
      xianShen: [...new Set(xianShen)],
      explanation
    };
  }
  
  /**
   * Analyze Ge Ju (格局)
   */
  private static analyzeGeJu(chart: BaziChart, dayMasterElement: string): GeJuAnalysis {
    // Check for special patterns first
    const specialPattern = this.checkSpecialPatterns(chart);
    if (specialPattern) {
      return specialPattern;
    }
    
    // Check regular patterns based on month branch
    const monthBranch = chart.month.branch;
    const monthElement = this.getBranchElement(monthBranch);
    
    // Determine pattern based on relationship between day master and month branch
    let pattern = '';
    let type = '';
    let quality: '优秀' | '良好' | '一般' | '较差' = '一般';
    
    if (monthElement === dayMasterElement) {
      pattern = 'jianlu';
      type = 'strong_body';
      quality = '良好';
    } else if (this.isGenerating(monthElement, dayMasterElement)) {
      pattern = 'seal';
      type = 'seal';
      quality = '良好';
    } else if (this.isControlling(dayMasterElement, monthElement)) {
      pattern = 'wealth';
      type = 'wealth';
      quality = '良好';
    } else if (this.isControlling(monthElement, dayMasterElement)) {
      pattern = 'officer';
      type = 'officer';
      quality = '良好';
    } else if (this.isGenerating(dayMasterElement, monthElement)) {
      pattern = 'output';
      type = 'output';
      quality = '一般';
    }
    
    // Check pattern quality
    if (this.hasGoodCombination(chart)) {
      quality = quality === '良好' ? '优秀' : '良好';
    }
    
    const description = this.generateGeJuDescription(pattern, type, quality);
    
    return {
      pattern,
      type,
      quality,
      description
    };
  }
  
  /**
   * Check for special patterns
   */
  private static checkSpecialPatterns(chart: BaziChart): GeJuAnalysis | null {
    // Check for Cong Ge (從格) - following pattern
    const stems = [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem];
    const elements = stems.map(s => this.getStemElement(s));
    const uniqueElements = new Set(elements);
    
    if (uniqueElements.size === 2) {
      // Possible Cong Ge
      const dayElement = this.getStemElement(chart.day.stem);
      const otherElements = elements.filter(e => e !== dayElement);
      
      if (otherElements.length >= 3) {
        const dominantElement = otherElements[0];
        if (otherElements.every(e => e === dominantElement)) {
          return {
            pattern: `follow_${dominantElement}`,
            type: '从格',
            quality: '优秀',
            description: this.generateGeJuDescription(`follow_${dominantElement}`, '从格', '优秀')
          };
        }
      }
    }
    
    // Check for Zhuan Wang Ge (專旺格)
    if (elements.filter(e => e === elements[2]).length >= 3) {
      return {
        pattern: 'specialized_strong',
        type: 'specialized_strong',
        quality: '优秀',
        description: this.generateGeJuDescription('specialized_strong', 'specialized_strong', '优秀')
      };
    }
    
    return null;
  }
  
  /**
   * Check if chart has good combinations
   */
  private static hasGoodCombination(chart: BaziChart): boolean {
    // Simplified check - in reality would check for specific combinations
    const branches = [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch];
    
    // Check for three harmony
    return BRANCH_RELATIONS.threeHarmony.some((harmony: string[]) => 
      harmony.filter(h => branches.includes(h)).length >= 2
    );
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
  
  private static getGeneratingElement(element: string): string {
    return FIVE_ELEMENTS_RELATIONS.generateBy[element as keyof typeof FIVE_ELEMENTS_RELATIONS.generateBy] || '';
  }
  
  private static getControllingElement(element: string): string {
    return FIVE_ELEMENTS_RELATIONS.restrictBy[element as keyof typeof FIVE_ELEMENTS_RELATIONS.restrictBy] || '';
  }
  
  private static getControlledElement(element: string): string {
    return FIVE_ELEMENTS_RELATIONS.controlling[element as keyof typeof FIVE_ELEMENTS_RELATIONS.controlling] || '';
  }
  
  private static getDrainingElement(element: string): string {
    return FIVE_ELEMENTS_RELATIONS.generating[element as keyof typeof FIVE_ELEMENTS_RELATIONS.generating] || '';
  }
  
  private static isGenerating(from: string, to: string): boolean {
    return this.getGeneratingElement(to) === from;
  }
  
  private static isControlling(from: string, to: string): boolean {
    return this.getControlledElement(from) === to;
  }
  
  private static generateYongShenExplanation(
    strength: DayMasterStrength,
    dayMasterElement: string,
    yongShen: string[]
  ): string {
    // Map day master strength (身強/身弱) to a concise Traditional description
    const strengthDesc: Record<string, string> = {
      '衰极': '日主衰極，極弱無氣',
      '身弱': '日主身弱',
      '偏弱': '日主偏弱',
      '中和': '日主中和',
      '偏强': '日主偏強',
      '身旺': '日主身旺',
      '旺极': '日主旺極，強盛之至'
    };
    const strengthText = strengthDesc[strength] || `日主${strength}`;
    const yongShenText = yongShen.length > 0 ? yongShen.join('、') : '無';
    return `${strengthText}，${dayMasterElement}命，宜取${yongShenText}為用神以調候扶抑。`;
  }

  private static generateGeJuDescription(pattern: string, type: string, quality: string): string {
    // Map pattern code → 格局名（Traditional Chinese）
    const patternNames: Record<string, string> = {
      'jianlu': '建祿格',
      'seal': '印綬格',
      'wealth': '財格',
      'officer': '官殺格',
      'output': '食傷格',
      'specialized_strong': '專旺格'
    };
    // follow_木/火/土/金/水 → 從X格（從格）
    let patternName = patternNames[pattern];
    if (!patternName) {
      if (pattern.startsWith('follow_')) {
        const element = pattern.slice('follow_'.length);
        patternName = `從${element}格`;
      } else {
        patternName = '正格';
      }
    }

    // Map type code → 身強/身弱/格局屬性（Traditional Chinese）
    const typeNames: Record<string, string> = {
      'strong_body': '身強',
      'weak_body': '身弱',
      'seal': '印綬',
      'wealth': '財星',
      'officer': '官殺',
      'output': '食傷',
      'specialized_strong': '一氣專旺',
      '从格': '順從旺神'
    };
    const typeText = typeNames[type] || (type ? type : '格局平常');

    // Map quality (may be Simplified from producer) → Traditional
    const qualityNames: Record<string, string> = {
      '优秀': '優秀',
      '良好': '良好',
      '一般': '一般',
      '较差': '較差'
    };
    const qualityText = qualityNames[quality] || quality || '一般';

    return `${patternName}，${typeText}，格局${qualityText}。`;
  }
}