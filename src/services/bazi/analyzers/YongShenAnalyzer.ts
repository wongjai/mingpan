/**
 * YongShen Analyzer (用神分析器)
 * Implements taro-bazi's comprehensive YongShen (Useful God) analysis system
 * Determines the most beneficial elements based on chart balance and patterns
 * Returns language-agnostic data with translation keys
 */

import { 
  BaziChart, 
  YongShenAnalysis, 
  YongShenRecommendations,
  CareerRecommendations,
  LifestyleRecommendations,
  RelationshipRecommendations,
  HealthRecommendations,
  LuckEnhancers,
  FengShuiSuggestions
} from '../types';
import { StrengthAnalyzer } from './StrengthAnalyzer';
import { PatternAnalyzer } from './PatternAnalyzer';
import { ClimateAnalyzer } from './ClimateAnalyzer';
import { FIVE_ELEMENTS_ARRAY, FIVE_ELEMENTS_RELATIONS, FiveElement } from '../../../core/constants/bazi';

export class YongShenAnalyzer {
  /**
   * Main analysis method - determines useful and harmful gods
   */
  static analyze(
    chart: BaziChart,
    strengthAnalysis: any,
    patternAnalysis: any,
    climateAnalysis: any
  ): YongShenAnalysis {
    const dayMasterElement = this.getDayMasterElement(chart.day.stem);
    
    // Use the enhanced pattern analysis to determine YongShen
    const pattern = patternAnalysis?.primaryPattern?.type || '正格';
    const patternPriority = patternAnalysis?.primaryPattern?.priority || 0;
    let analysis: YongShenAnalysis;
    
    // High priority patterns (8-10) have specific YongShen rules
    if (patternPriority >= 8) {
      analysis = this.analyzeByPatternRecommendations(chart, dayMasterElement, patternAnalysis, strengthAnalysis);
    } else if (pattern.includes('從')) {
      // Follow patterns
      analysis = this.analyzeSpecialPattern(chart, dayMasterElement, pattern, strengthAnalysis, patternAnalysis);
    } else if (climateAnalysis?.adjustment === 'urgent') {
      // Climate takes priority when extreme
      analysis = this.analyzeClimateFirst(chart, dayMasterElement, climateAnalysis, strengthAnalysis);
    } else {
      // Normal pattern analysis based on strength
      analysis = this.analyzeNormalPattern(chart, dayMasterElement, strengthAnalysis, patternAnalysis, climateAnalysis);
    }
    
    // Add explanation based on the analysis method.
    // Preserve a specific explanation already set by the analyzer (e.g. 中和 調候/通關 fallback).
    if (!analysis.explanation) {
      analysis.explanation = this.generateExplanation(analysis, pattern, strengthAnalysis.dayMasterStrength);
    }
    
    return analysis;
  }
  
  /**
   * Analyze normal patterns (正格)
   */
  private static analyzeNormalPattern(
    chart: BaziChart,
    dayMasterElement: string,
    strengthAnalysis: any,
    patternAnalysis?: any,
    climateAnalysis?: any
  ): YongShenAnalysis {
    const strength = strengthAnalysis.dayMasterStrength;
    const yongShen: string[] = [];
    const xiShen: string[] = [];
    const jiShen: string[] = [];
    const xianShen: string[] = [];
    let explanation = '';

    if (strength === '身弱' || strength === '衰极' || strength === '偏弱') {
      // Weak day master needs support
      // YongShen: Elements that generate or same as day master
      const generatingElement = FIVE_ELEMENTS_RELATIONS.generateBy[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generateBy];
      yongShen.push(generatingElement);
      yongShen.push(dayMasterElement);
      
      // XiShen: Elements that support YongShen
      xiShen.push(FIVE_ELEMENTS_RELATIONS.generateBy[generatingElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generateBy]);
      
      // JiShen: Elements that control or drain day master
      jiShen.push(FIVE_ELEMENTS_RELATIONS.controlling[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.controlling]);
      jiShen.push(FIVE_ELEMENTS_RELATIONS.generating[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generating]);
      jiShen.push(FIVE_ELEMENTS_RELATIONS.restrictBy[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.restrictBy]);
      
    } else if (strength === '身旺' || strength === '旺极' || strength === '偏强') {
      // Strong day master needs draining or control
      // YongShen: Elements that drain or control day master
      const drainingElement = FIVE_ELEMENTS_RELATIONS.generating[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generating];
      const controllingElement = FIVE_ELEMENTS_RELATIONS.restrictBy[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.restrictBy];
      
      yongShen.push(drainingElement);
      yongShen.push(controllingElement);
      
      // XiShen: Wealth element (controlled by day master)
      xiShen.push(FIVE_ELEMENTS_RELATIONS.controlling[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.controlling]);
      
      // JiShen: Elements that strengthen day master
      jiShen.push(FIVE_ELEMENTS_RELATIONS.generateBy[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generateBy]);
      jiShen.push(dayMasterElement);
      
    } else {
      // Normal/balanced strength
      // Analyze based on what's missing or excessive in the chart
      const elementCounts = this.count(chart);
      const missingElements = FIVE_ELEMENTS_ARRAY.filter(elem => elementCounts[elem] === 0);
      const excessiveElements = FIVE_ELEMENTS_ARRAY.filter(elem => elementCounts[elem] > 3);
      
      // YongShen: Missing elements or elements that balance excess
      yongShen.push(...missingElements);
      excessiveElements.forEach((elem: string) => {
        const controller = FIVE_ELEMENTS_RELATIONS.restrictBy[elem as keyof typeof FIVE_ELEMENTS_RELATIONS.restrictBy];
        if (!yongShen.includes(controller)) {
          yongShen.push(controller);
        }
      });
      
      // XiShen: Elements that support YongShen
      yongShen.forEach((elem: string) => {
        const supporter = FIVE_ELEMENTS_RELATIONS.generateBy[elem as keyof typeof FIVE_ELEMENTS_RELATIONS.generateBy];
        if (!xiShen.includes(supporter) && !yongShen.includes(supporter)) {
          xiShen.push(supporter);
        }
      });
      
      // JiShen: Excessive elements
      jiShen.push(...excessiveElements);

      // Fallback: nothing missing/excessive (e.g. 五行俱全) → 中和 chart with empty YongShen.
      // Determine YongShen via 調候 (climate) first, then 通關 (circulation) when climate is neutral.
      if (missingElements.length === 0 && excessiveElements.length === 0) {
        const climate = this.getClimateYongShen(climateAnalysis);
        if (climate) {
          yongShen.push(climate.yongShen);
          xiShen.push(climate.xiShen);
          jiShen.push(climate.jiShen);
          explanation = climate.explanation;
        } else {
          // 通關/circulation: drain then control the day master, keeping it flowing.
          const drainingElement = FIVE_ELEMENTS_RELATIONS.generating[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generating];
          const controllingElement = FIVE_ELEMENTS_RELATIONS.restrictBy[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.restrictBy];
          const wealthElement = FIVE_ELEMENTS_RELATIONS.controlling[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.controlling];
          yongShen.push(controllingElement);
          xiShen.push(wealthElement, drainingElement);
          explanation = `日主中和，五行流通，取${controllingElement}為用神調節其勢，以${wealthElement}、${drainingElement}為喜通關流轉。`;
        }
      }
    }

    // XianShen: Remaining neutral elements (computed AFTER yong/xi/ji populated)
    FIVE_ELEMENTS_ARRAY.forEach((elem) => {
      if (!yongShen.includes(elem) && !xiShen.includes(elem) && !jiShen.includes(elem)) {
        xianShen.push(elem);
      }
    });

    const analysis: YongShenAnalysis = {
      yongShen,
      xiShen,
      jiShen,
      xianShen,
      explanation
    };

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(
      analysis,
      dayMasterElement,
      strengthAnalysis,
      patternAnalysis,
      climateAnalysis
    );

    return analysis;
  }

  /**
   * Shared 調候 (climate) YongShen mapping.
   * Reuses the exact element choices from analyzeClimateFirst.
   * Note: ClimateAnalyzer emits Chinese temperature values (寒/凉/中性/暖/热),
   * so match those here. Returns null when temperature is neutral/unknown.
   */
  private static getClimateYongShen(
    climateAnalysis?: any
  ): { yongShen: string; xiShen: string; jiShen: string; explanation: string } | null {
    const temperature = climateAnalysis?.temperature;
    if (temperature === '热' || temperature === '暖') {
      // Too hot - Water regulates, Metal generates Water, Fire aggravates
      return {
        yongShen: '水',
        xiShen: '金',
        jiShen: '火',
        explanation: '日主中和，取調候用神：命局炎燥，以水潤之、金生水為喜，忌火助熱。'
      };
    }
    if (temperature === '寒' || temperature === '凉') {
      // Too cold - Fire warms, Wood feeds Fire, Water aggravates
      return {
        yongShen: '火',
        xiShen: '木',
        jiShen: '水',
        explanation: '日主中和，取調候用神：命局寒凝，以火暖之、木生火為喜，忌水助寒。'
      };
    }
    return null;
  }

  /**
   * Analyze based on pattern recommendations from PatternAnalyzer
   */
  private static analyzeByPatternRecommendations(
    chart: BaziChart,
    dayMasterElement: string,
    patternAnalysis: any,
    strengthAnalysis: any
  ): YongShenAnalysis {
    const yongShen: string[] = [];
    const xiShen: string[] = [];
    const jiShen: string[] = [];
    const xianShen: string[] = [];
    
    // Extract elements from pattern-based useful/avoid gods
    const chartStructure = patternAnalysis?.chartStructure;
    if (chartStructure) {
      // Convert translation keys back to elements
      chartStructure.usefulGods.forEach((god: string) => {
        const element = god.replace('elements.', '');
        if (FIVE_ELEMENTS_ARRAY.includes(element as FiveElement)) {
          yongShen.push(element);
        }
      });
      
      chartStructure.avoidGods.forEach((god: string) => {
        const element = god.replace('elements.', '');
        if (FIVE_ELEMENTS_ARRAY.includes(element as FiveElement)) {
          jiShen.push(element);
        }
      });
    }
    
    // Determine XiShen based on YongShen
    yongShen.forEach((elem: string) => {
      if (elem in FIVE_ELEMENTS_RELATIONS.generateBy) {
        const supporter = FIVE_ELEMENTS_RELATIONS.generateBy[elem as keyof typeof FIVE_ELEMENTS_RELATIONS.generateBy];
        if (!yongShen.includes(supporter) && !jiShen.includes(supporter) && !xiShen.includes(supporter)) {
          xiShen.push(supporter);
        }
      }
    });
    
    // Fill remaining elements as XianShen
    FIVE_ELEMENTS_ARRAY.forEach((elem) => {
      if (!yongShen.includes(elem) && !xiShen.includes(elem) && !jiShen.includes(elem)) {
        xianShen.push(elem);
      }
    });
    
    const analysis: YongShenAnalysis = {
      yongShen,
      xiShen,
      jiShen,
      xianShen,
      explanation: ''
    };
    
    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(
      analysis,
      dayMasterElement,
      strengthAnalysis,
      patternAnalysis,
      null
    );
    
    return analysis;
  }
  
  /**
   * Analyze special patterns (從格)
   */
  private static analyzeSpecialPattern(
    chart: BaziChart,
    dayMasterElement: string,
    pattern: string,
    strengthAnalysis: any,
    patternAnalysis: any
  ): YongShenAnalysis {
    const yongShen: string[] = [];
    const xiShen: string[] = [];
    const jiShen: string[] = [];
    const xianShen: string[] = [];
    
    // Use pattern analysis recommendations if available
    if (patternAnalysis?.chartStructure) {
      return this.analyzeByPatternRecommendations(chart, dayMasterElement, patternAnalysis, null);
    }
    
    // Fallback to basic pattern analysis
    if (pattern.includes('從強格') || pattern.includes('從旺格')) {
      // 從強格/從旺格 - Follow strong pattern
      // Support the dominant element group
      const dominantElements = strengthAnalysis.supportingElements || [dayMasterElement];
      yongShen.push(...dominantElements);
      
      // XiShen: Elements that generate dominant elements
      dominantElements.forEach((elem: string) => {
        if (elem in FIVE_ELEMENTS_RELATIONS.generateBy) {
          const generator = FIVE_ELEMENTS_RELATIONS.generateBy[elem as keyof typeof FIVE_ELEMENTS_RELATIONS.generateBy];
          if (!yongShen.includes(generator)) {
            xiShen.push(generator);
          }
        }
      });
      
      // JiShen: Elements that oppose the flow
      dominantElements.forEach((elem: string) => {
        if (elem in FIVE_ELEMENTS_RELATIONS.restrictBy) {
          const opposer = FIVE_ELEMENTS_RELATIONS.restrictBy[elem as keyof typeof FIVE_ELEMENTS_RELATIONS.restrictBy];
          if (!jiShen.includes(opposer)) {
            jiShen.push(opposer);
          }
        }
      });
      
    } else if (pattern.includes('從弱格') || pattern.includes('從勢格')) {
      // 從弱格/從勢格 - Follow weak/trend pattern
      // Support elements that drain or control day master
      const drainingElement = FIVE_ELEMENTS_RELATIONS.generating[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generating];
      const controllingElement = FIVE_ELEMENTS_RELATIONS.restrictBy[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.restrictBy];
      const wealthElement = FIVE_ELEMENTS_RELATIONS.controlling[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.controlling];
      
      yongShen.push(drainingElement, controllingElement, wealthElement);
      
      // JiShen: Elements that support day master
      jiShen.push(dayMasterElement);
      jiShen.push(FIVE_ELEMENTS_RELATIONS.generateBy[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generateBy]);
      
    } else if (pattern.includes('從兒格')) {
      // 從兒格 - Follow output pattern
      const outputElement = FIVE_ELEMENTS_RELATIONS.generating[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generating];
      yongShen.push(outputElement);
      
      // Also support wealth (generated by output)
      const wealthElement = FIVE_ELEMENTS_RELATIONS.generating[outputElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generating];
      yongShen.push(wealthElement);
      
      // JiShen: Elements that support day master or control output
      jiShen.push(dayMasterElement);
      jiShen.push(FIVE_ELEMENTS_RELATIONS.generateBy[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generateBy]);
      jiShen.push(FIVE_ELEMENTS_RELATIONS.restrictBy[outputElement as keyof typeof FIVE_ELEMENTS_RELATIONS.restrictBy]);
      
    } else if (pattern.includes('從財格')) {
      // 從財格 - Follow wealth pattern
      const wealthElement = FIVE_ELEMENTS_RELATIONS.controlling[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.controlling];
      yongShen.push(wealthElement);
      
      // Also support output (feeds wealth)
      const outputElement = FIVE_ELEMENTS_RELATIONS.generating[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generating];
      xiShen.push(outputElement);
      
      // JiShen: Elements that support day master
      jiShen.push(dayMasterElement);
      jiShen.push(FIVE_ELEMENTS_RELATIONS.generateBy[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generateBy]);
      
    } else if (pattern.includes('從官格')) {
      // 從官格 - Follow officer pattern
      const officerElement = FIVE_ELEMENTS_RELATIONS.restrictBy[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.restrictBy];
      yongShen.push(officerElement);
      
      // Also support wealth (feeds officer)
      const wealthElement = FIVE_ELEMENTS_RELATIONS.controlling[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.controlling];
      xiShen.push(wealthElement);
      
      // JiShen: Elements that support day master or control officer
      jiShen.push(dayMasterElement);
      jiShen.push(FIVE_ELEMENTS_RELATIONS.generating[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generating]);
    }
    
    // Fill remaining elements as XianShen
    FIVE_ELEMENTS_ARRAY.forEach((elem) => {
      if (!yongShen.includes(elem) && !xiShen.includes(elem) && !jiShen.includes(elem)) {
        xianShen.push(elem);
      }
    });
    
    const analysis: YongShenAnalysis = {
      yongShen,
      xiShen,
      jiShen,
      xianShen,
      explanation: ''
    };
    
    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(
      analysis,
      dayMasterElement,
      strengthAnalysis,
      patternAnalysis || { primary: { type: pattern } },
      null
    );
    
    return analysis;
  }
  
  /**
   * Analyze when climate adjustment is urgent
   */
  private static analyzeClimateFirst(
    chart: BaziChart,
    dayMasterElement: string,
    climateAnalysis: any,
    strengthAnalysis: any
  ): YongShenAnalysis {
    const yongShen: string[] = [];
    const xiShen: string[] = [];
    const jiShen: string[] = [];
    const xianShen: string[] = [];
    
    // Climate is too hot - need Water first
    if (climateAnalysis.temperature === 'hot') {
      yongShen.push('水');
      xiShen.push('金'); // Metal generates Water
      jiShen.push('火'); // Fire makes it hotter
      
      // Secondary consideration based on day master
      if (dayMasterElement === '木' || dayMasterElement === '火') {
        xiShen.push('土'); // Earth can absorb some heat
      }
      
    } else if (climateAnalysis.temperature === 'cold') {
      // Climate is too cold - need Fire first
      yongShen.push('火');
      xiShen.push('木'); // Wood feeds Fire
      jiShen.push('水'); // Water makes it colder
      
      // Secondary consideration
      if (dayMasterElement === '金' || dayMasterElement === '水') {
        xiShen.push('土'); // Earth can provide stability
      }
    }
    
    // After climate adjustment, consider day master strength
    const strength = strengthAnalysis.dayMasterStrength;
    if (strength === '身弱' && !jiShen.includes(dayMasterElement)) {
      const supporter = FIVE_ELEMENTS_RELATIONS.generateBy[dayMasterElement as keyof typeof FIVE_ELEMENTS_RELATIONS.generateBy];
      if (!yongShen.includes(supporter) && !jiShen.includes(supporter)) {
        xiShen.push(supporter);
      }
    }
    
    // Fill remaining elements
    FIVE_ELEMENTS_ARRAY.forEach((elem) => {
      if (!yongShen.includes(elem) && !xiShen.includes(elem) && !jiShen.includes(elem)) {
        xianShen.push(elem);
      }
    });
    
    const analysis: YongShenAnalysis = {
      yongShen,
      xiShen,
      jiShen,
      xianShen,
      explanation: ''
    };
    
    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(
      analysis,
      dayMasterElement,
      strengthAnalysis,
      null,
      climateAnalysis
    );
    
    return analysis;
  }
  
  /**
   * Generate explanation for the YongShen analysis
   */
  private static generateExplanation(
    analysis: YongShenAnalysis,
    pattern: string,
    dayMasterStrength: string
  ): string {
    // Return translation key based on the analysis type
    if (pattern.includes('從強格') || pattern.includes('從旺格')) {
      return '從強格或從旺格，順其勢而為，以增強其力量為吉';
    } else if (pattern.includes('從弱格') || pattern.includes('從勢格')) {
      return '從弱格或從勢格，順其勢而洩，以消耗其力量為吉';
    } else if (pattern.includes('從兒格')) {
      return '從兒格，日主洩秀於食傷，以食傷財星為用';
    } else if (pattern.includes('從財格')) {
      return '從財格，日主消耗於財星，以財星食傷為用';
    } else if (pattern.includes('從官格')) {
      return '從官格，日主服從於官殺，以官殺財星為用';
    } else if (pattern.includes('化氣格')) {
      return '化氣格，五行流通有情，順其流通之勢為用';
    } else if (pattern.includes('曲直格') || pattern.includes('炎上格') || pattern.includes('稼穡格') || pattern.includes('從革格') || pattern.includes('潤下格')) {
      return '特殊格局，以主導元素為用，增強其勢力';
    } else if (analysis.yongShen.includes('水') && (analysis.jiShen.includes('火') || analysis.jiShen.includes('土'))) {
      return '命局過熱，急需水來調候，以水金為用';
    } else if (analysis.yongShen.includes('火') && analysis.jiShen.includes('水')) {
      return '命局過寒，急需火來調候，以火木為用';
    } else if (dayMasterStrength === '身弱' || dayMasterStrength === '衰极') {
      return '日主弱，需要生扶，以印比為用神';
    } else if (dayMasterStrength === '身旺' || dayMasterStrength === '旺极') {
      return '日主強旺，需要消耗，以財官食傷為用神';
    } else {
      return '日主中和，五行平衡，以補缺抑過為用神';
    }
  }
  
  /**
   * Generate comprehensive actionable recommendations based on YongShen analysis
   */
  static generateRecommendations(
    analysis: YongShenAnalysis,
    dayMasterElement: string,
    strengthAnalysis: any,
    patternAnalysis: any,
    climateAnalysis: any
  ): YongShenRecommendations {
    const recommendations: YongShenRecommendations = {
      career: this.generateCareerRecommendations(analysis, dayMasterElement, patternAnalysis),
      lifestyle: this.generateLifestyleRecommendations(analysis, dayMasterElement, climateAnalysis),
      relationships: this.generateRelationshipRecommendations(analysis, dayMasterElement),
      health: this.generateHealthRecommendations(analysis, dayMasterElement, strengthAnalysis),
      luck: this.generateLuckEnhancers(analysis, dayMasterElement),
      fengShui: this.generateFengShuiSuggestions(analysis, dayMasterElement)
    };
    
    return recommendations;
  }
  
  /**
   * Generate career recommendations based on favorable elements
   */
  private static generateCareerRecommendations(
    analysis: YongShenAnalysis,
    dayMasterElement: string,
    patternAnalysis: any
  ): CareerRecommendations {
    const career: CareerRecommendations = {
      favorableIndustries: [],
      avoidIndustries: [],
      idealRoles: [],
      workEnvironment: [],
      businessPartners: [...analysis.yongShen, ...analysis.xiShen],
      timing: '循序漸進'
    };
    
    // Map favorable elements to industries
    analysis.yongShen.forEach(element => {
      switch (element) {
        case '木':
          career.favorableIndustries.push(
            '教育培訓',
            '出版印刷',
            '醫療保健',
            '時尚服飾',
            '農林業'
          );
          career.idealRoles.push(
            '教師',
            '設計師',
            '治療師'
          );
          career.workEnvironment.push('綠化環境');
          break;
          
        case '火':
          career.favorableIndustries.push(
            '高科技產業',
            '娛樂傳媒',
            '能源電力',
            '餐飲業',
            '市場營銷'
          );
          career.idealRoles.push(
            '領導者',
            '表演者',
            '創新開發者'
          );
          career.workEnvironment.push('明亮環境');
          break;
          
        case '土':
          career.favorableIndustries.push(
            '房地產',
            '建築工程',
            '農業種植',
            '保險業',
            '管理諮詢'
          );
          career.idealRoles.push(
            '行政管理者',
            '顧問',
            '調解者'
          );
          career.workEnvironment.push('穩定環境');
          break;
          
        case '金':
          career.favorableIndustries.push(
            '金融銀行',
            '法律司法',
            '精密科技',
            '珠寶首飾',
            '汽車機械'
          );
          career.idealRoles.push(
            '分析師',
            '工程師',
            '執行決策者'
          );
          career.workEnvironment.push('結構化環境');
          break;
          
        case '水':
          career.favorableIndustries.push(
            '貿易物流',
            '運輸航運',
            '通訊傳播',
            '旅遊觀光',
            '飲料酒水'
          );
          career.idealRoles.push(
            '談判協商者',
            '策略規劃師',
            '人脈經營者'
          );
          career.workEnvironment.push('靈活環境');
          break;
      }
    });
    
    // Map unfavorable elements to industries to avoid
    analysis.jiShen.forEach(element => {
      switch (element) {
        case '木':
          career.avoidIndustries.push('木屬性行業');
          break;
        case '火':
          career.avoidIndustries.push('火屬性行業');
          break;
        case '土':
          career.avoidIndustries.push('土屬性行業');
          break;
        case '金':
          career.avoidIndustries.push('金屬性行業');
          break;
        case '水':
          career.avoidIndustries.push('水屬性行業');
          break;
      }
    });
    
    // Adjust timing based on pattern
    if (patternAnalysis?.primaryPattern?.type?.includes('從')) {
      career.timing = '果斷決策';
    } else if (analysis.yongShen.length > 2) {
      career.timing = '靈活變通';
    }
    
    return career;
  }
  
  /**
   * Generate lifestyle recommendations
   */
  private static generateLifestyleRecommendations(
    analysis: YongShenAnalysis,
    dayMasterElement: string,
    climateAnalysis: any
  ): LifestyleRecommendations {
    const lifestyle: LifestyleRecommendations = {
      dailyHabits: [],
      exercises: [],
      hobbies: [],
      environment: [],
      diet: [],
      schedule: '平衡作息'
    };
    
    // Recommendations based on favorable elements
    analysis.yongShen.forEach(element => {
      switch (element) {
        case '木':
          lifestyle.dailyHabits.push(
            '早起晨練',
            '親近自然',
            '持續學習成長'
          );
          lifestyle.exercises.push(
            '瑜伽',
            '太極拳',
            '散步健走'
          );
          lifestyle.hobbies.push(
            '園藝種植',
            '閱讀學習',
            '手工藝'
          );
          lifestyle.environment.push('綠色植物環境');
          lifestyle.diet.push(
            '綠色蔬菜',
            '酸味食物'
          );
          break;
          
        case '火':
          lifestyle.dailyHabits.push(
            '適度曬太陽',
            '社交活動',
            '創意表達'
          );
          lifestyle.exercises.push(
            '有氧運動',
            '舞蹈',
            '球類運動'
          );
          lifestyle.hobbies.push(
            '表演藝術',
            '烹飪',
            '藝術創作'
          );
          lifestyle.environment.push('明亮溫暖環境');
          lifestyle.diet.push(
            '辛辣食物',
            '苦味食物'
          );
          break;
          
        case '土':
          lifestyle.dailyHabits.push(
            '規律作息',
            '接地氣',
            '保持穩定'
          );
          lifestyle.exercises.push(
            '登山健行',
            '重量訓練',
            '皮拉提斯'
          );
          lifestyle.hobbies.push(
            '陶藝',
            '收藏',
            '廚藝'
          );
          lifestyle.environment.push('自然材質環境');
          lifestyle.diet.push(
            '五穀雜糧',
            '甘甜食物'
          );
          break;
          
        case '金':
          lifestyle.dailyHabits.push(
            '整理收納',
            '自律守時',
            '簡約生活'
          );
          lifestyle.exercises.push(
            '武術格鬥',
            '呼吸練習',
            '精準運動'
          );
          lifestyle.hobbies.push(
            '音樂',
            '科技玩物',
            '精品收藏'
          );
          lifestyle.environment.push('整潔有序環境');
          lifestyle.diet.push(
            '白色食物',
            '辛味食物'
          );
          break;
          
        case '水':
          lifestyle.dailyHabits.push(
            '保持彈性',
            '冥想靜心',
            '順其自然'
          );
          lifestyle.exercises.push(
            '游泳',
            '流動瑜伽',
            '伸展運動'
          );
          lifestyle.hobbies.push(
            '旅行',
            '哲學思考',
            '音樂欣賞'
          );
          lifestyle.environment.push('流水元素環境');
          lifestyle.diet.push(
            '海鮮水產',
            '鹹味食物'
          );
          break;
      }
    });
    
    // Adjust schedule based on day master and climate
    if (climateAnalysis?.temperature === 'hot') {
      lifestyle.schedule = '早晨作息';
    } else if (climateAnalysis?.temperature === 'cold') {
      lifestyle.schedule = '日中作息';
    }
    
    return lifestyle;
  }
  
  /**
   * Generate relationship recommendations
   */
  private static generateRelationshipRecommendations(
    analysis: YongShenAnalysis,
    dayMasterElement: string
  ): RelationshipRecommendations {
    const relationships: RelationshipRecommendations = {
      compatibleElements: [...analysis.yongShen, ...analysis.xiShen],
      communicationStyle: [],
      socialActivities: [],
      partnerQualities: [],
      conflictResolution: [],
      familyDynamics: '家庭和諧'
    };
    
    // Communication style based on day master element
    switch (dayMasterElement) {
      case '木':
        relationships.communicationStyle.push(
          '直接溝通',
          '成長導向溝通'
        );
        relationships.conflictResolution.push('尋求妥協');
        break;
      case '火':
        relationships.communicationStyle.push(
          '熱情表達',
          '激勵型溝通'
        );
        relationships.conflictResolution.push('表達釋放');
        break;
      case '土':
        relationships.communicationStyle.push(
          '穩重踏實',
          '務實具體'
        );
        relationships.conflictResolution.push('耐心等待');
        break;
      case '金':
        relationships.communicationStyle.push(
          '精確清晰',
          '公正客觀'
        );
        relationships.conflictResolution.push('理性分析');
        break;
      case '水':
        relationships.communicationStyle.push(
          '直覺感性',
          '適應調整'
        );
        relationships.conflictResolution.push('順勢化解');
        break;
    }
    
    // Social activities based on favorable elements
    analysis.yongShen.forEach(element => {
      switch (element) {
        case '木':
          relationships.socialActivities.push(
            '戶外活動',
            '學習成長'
          );
          relationships.partnerQualities.push(
            '成長導向',
            '支持鼓勵'
          );
          break;
        case '火':
          relationships.socialActivities.push(
            '社交聚會',
            '創意活動'
          );
          relationships.partnerQualities.push(
            '熱情積極',
            '充滿活力'
          );
          break;
        case '土':
          relationships.socialActivities.push(
            '社區活動',
            '傳統聚會'
          );
          relationships.partnerQualities.push(
            '可靠穩定',
            '關懷照顧'
          );
          break;
        case '金':
          relationships.socialActivities.push(
            '精緻活動',
            '專業交流'
          );
          relationships.partnerQualities.push(
            '自律嚴謹',
            '忠誠專一'
          );
          break;
        case '水':
          relationships.socialActivities.push(
            '多元體驗',
            '知性交流'
          );
          relationships.partnerQualities.push(
            '理解包容',
            '靈活變通'
          );
          break;
      }
    });
    
    // Family dynamics based on pattern
    if (analysis.jiShen.includes(dayMasterElement)) {
      relationships.familyDynamics = '獨立自主';
    }
    
    return relationships;
  }
  
  /**
   * Generate health recommendations
   */
  private static generateHealthRecommendations(
    analysis: YongShenAnalysis,
    dayMasterElement: string,
    strengthAnalysis: any
  ): HealthRecommendations {
    const health: HealthRecommendations = {
      preventiveMeasures: [],
      vulnerableAreas: [],
      exercises: [],
      dietaryGuidelines: [],
      seasonalCare: [],
      stressManagement: []
    };
    
    // Vulnerable areas based on weak/excessive elements
    analysis.jiShen.forEach(element => {
      switch (element) {
        case '木':
          health.vulnerableAreas.push(
            '肝臟',
            '眼睛',
            '神經系統'
          );
          break;
        case '火':
          health.vulnerableAreas.push(
            '心臟',
            '血液循環',
            '舌頭'
          );
          break;
        case '土':
          health.vulnerableAreas.push(
            '脾臟',
            '胃部',
            '消化系統'
          );
          break;
        case '金':
          health.vulnerableAreas.push(
            '肺部',
            '皮膚',
            '呼吸系統'
          );
          break;
        case '水':
          health.vulnerableAreas.push(
            '腎臟',
            '膀胱',
            '骨骼'
          );
          break;
      }
    });
    
    // Preventive measures based on favorable elements
    analysis.yongShen.forEach(element => {
      switch (element) {
        case '木':
          health.preventiveMeasures.push(
            '伸展運動',
            '護眼保健'
          );
          health.exercises.push('瑜伽');
          health.dietaryGuidelines.push('綠色蔬菜');
          break;
        case '火':
          health.preventiveMeasures.push(
            '心血管保健',
            '促進循環'
          );
          health.exercises.push('有氧運動');
          health.dietaryGuidelines.push('抗氧化食物');
          break;
        case '土':
          health.preventiveMeasures.push(
            '消化保健',
            '接地養生'
          );
          health.exercises.push('核心訓練');
          health.dietaryGuidelines.push('全食物');
          break;
        case '金':
          health.preventiveMeasures.push(
            '呼吸保健',
            '增強免疫'
          );
          health.exercises.push('呼吸練習');
          health.dietaryGuidelines.push('礦物質食物');
          break;
        case '水':
          health.preventiveMeasures.push(
            '充足水分',
            '腎臟保健'
          );
          health.exercises.push('游泳');
          health.dietaryGuidelines.push('補水食物');
          break;
      }
    });
    
    // Seasonal care
    if (analysis.yongShen.includes('木')) {
      health.seasonalCare.push('春季養生');
    }
    if (analysis.yongShen.includes('火')) {
      health.seasonalCare.push('夏季養生');
    }
    if (analysis.yongShen.includes('土')) {
      health.seasonalCare.push('季節轉換養生');
    }
    if (analysis.yongShen.includes('金')) {
      health.seasonalCare.push('秋季養生');
    }
    if (analysis.yongShen.includes('水')) {
      health.seasonalCare.push('冬季養生');
    }
    
    // Stress management based on day master strength
    if (strengthAnalysis && (strengthAnalysis.dayMasterStrength === '身弱' || strengthAnalysis.dayMasterStrength === '衰極')) {
      health.stressManagement.push(
        '充分休息',
        '尋求支援',
        '滋養身心'
      );
    } else if (strengthAnalysis && (strengthAnalysis.dayMasterStrength === '身旺' || strengthAnalysis.dayMasterStrength === '旺極')) {
      health.stressManagement.push(
        '釋放壓力',
        '疏導能量',
        '平衡調節'
      );
    } else {
      health.stressManagement.push(
        '維持平衡',
        '預防失衡'
      );
    }
    
    return health;
  }
  
  /**
   * Generate luck enhancers
   */
  private static generateLuckEnhancers(
    analysis: YongShenAnalysis,
    dayMasterElement: string
  ): LuckEnhancers {
    const luck: LuckEnhancers = {
      colors: [],
      numbers: [],
      directions: [],
      seasons: [],
      timeOfDay: [],
      materials: []
    };
    
    // Map elements to luck enhancers
    analysis.yongShen.forEach(element => {
      switch (element) {
        case '木':
          luck.colors.push('綠色', '青色');
          luck.numbers.push(3, 8);
          luck.directions.push('東方', '東南');
          luck.seasons.push('春季');
          luck.timeOfDay.push('清晨');
          luck.materials.push('木質材料', '竹製品');
          break;
          
        case '火':
          luck.colors.push('紅色', '紫色');
          luck.numbers.push(2, 7);
          luck.directions.push('南方');
          luck.seasons.push('夏季');
          luck.timeOfDay.push('中午');
          luck.materials.push('火屬性材料', '皮革');
          break;
          
        case '土':
          luck.colors.push('黃色', '棕色');
          luck.numbers.push(5, 0);
          luck.directions.push('中央', '東北', '西南');
          luck.seasons.push('季節交替');
          luck.timeOfDay.push('下午');
          luck.materials.push('土質材料', '陶瓷');
          break;
          
        case '金':
          luck.colors.push('白色', '金色');
          luck.numbers.push(4, 9);
          luck.directions.push('西方', '西北');
          luck.seasons.push('秋季');
          luck.timeOfDay.push('傍晚');
          luck.materials.push('金屬材料', '水晶');
          break;
          
        case '水':
          luck.colors.push('黑色', '藍色');
          luck.numbers.push(1, 6);
          luck.directions.push('北方');
          luck.seasons.push('冬季');
          luck.timeOfDay.push('夜晚');
          luck.materials.push('水屬性材料', '玻璃');
          break;
      }
    });
    
    // Remove duplicates
    luck.numbers = [...new Set(luck.numbers)];
    
    return luck;
  }
  
  /**
   * Generate Feng Shui suggestions
   */
  private static generateFengShuiSuggestions(
    analysis: YongShenAnalysis,
    dayMasterElement: string
  ): FengShuiSuggestions {
    const fengShui: FengShuiSuggestions = {
      homeLayout: [],
      officeSetup: [],
      sleepDirection: '',
      decorElements: [],
      plants: [],
      avoidPlacements: []
    };
    
    // Sleep direction based on favorable elements
    const primaryYongShen = analysis.yongShen[0];
    switch (primaryYongShen) {
      case '木':
        fengShui.sleepDirection = '頭向東方';
        break;
      case '火':
        fengShui.sleepDirection = '頭向南方';
        break;
      case '土':
        fengShui.sleepDirection = '中央位置';
        break;
      case '金':
        fengShui.sleepDirection = '頭向西方';
        break;
      case '水':
        fengShui.sleepDirection = '頭向北方';
        break;
      default:
        fengShui.sleepDirection = '吉利方向';
    }
    
    // Home and office suggestions based on favorable elements
    analysis.yongShen.forEach(element => {
      switch (element) {
        case '木':
          fengShui.homeLayout.push(
            '通風採光',
            '室內植物'
          );
          fengShui.officeSetup.push(
            '辦公桌面向東方',
            '生長元素'
          );
          fengShui.decorElements.push(
            '高大物品',
            '長方形裝飾'
          );
          fengShui.plants.push(
            '竹子',
            '榕樹'
          );
          break;
          
        case '火':
          fengShui.homeLayout.push(
            '明亮燈光',
            '南方區域'
          );
          fengShui.officeSetup.push(
            '明亮照明',
            '三角元素'
          );
          fengShui.decorElements.push(
            '蠟燭',
            '三角形裝飾'
          );
          fengShui.plants.push(
            '開花植物',
            '紅色花卉'
          );
          break;
          
        case '土':
          fengShui.homeLayout.push(
            '中央穩定',
            '穩固佈局'
          );
          fengShui.officeSetup.push(
            '接地元素',
            '方形佈局'
          );
          fengShui.decorElements.push(
            '石頭擺設',
            '方形裝飾'
          );
          fengShui.plants.push(
            '多肉植物',
            '低矮植物'
          );
          break;
          
        case '金':
          fengShui.homeLayout.push(
            '整齊有序',
            '西方區域'
          );
          fengShui.officeSetup.push(
            '極簡設計',
            '圓形元素'
          );
          fengShui.decorElements.push(
            '金屬物品',
            '圓形裝飾'
          );
          fengShui.plants.push(
            '白色花卉',
            '圓葉植物'
          );
          break;
          
        case '水':
          fengShui.homeLayout.push(
            '流水裝飾',
            '北方區域'
          );
          fengShui.officeSetup.push(
            '流水擺設',
            '曲線設計'
          );
          fengShui.decorElements.push(
            '水族箱',
            '波浪形裝飾'
          );
          fengShui.plants.push(
            '蓮花',
            '水生植物'
          );
          break;
      }
    });
    
    // Avoid placements based on JiShen
    analysis.jiShen.forEach(element => {
      switch (element) {
        case '木':
          fengShui.avoidPlacements.push('避免木元素過多');
          break;
        case '火':
          fengShui.avoidPlacements.push('避免火元素過多');
          break;
        case '土':
          fengShui.avoidPlacements.push('避免土元素過多');
          break;
        case '金':
          fengShui.avoidPlacements.push('避免金元素過多');
          break;
        case '水':
          fengShui.avoidPlacements.push('避免水元素過多');
          break;
      }
    });
    
    return fengShui;
  }
  
  /**
   * Helper: Get day master element
   */
  private static getDayMasterElement(dayMasterStem: string): string {
    const elementMap: Record<string, string> = {
      '甲': '木', '乙': '木',
      '丙': '火', '丁': '火',
      '戊': '土', '己': '土',
      '庚': '金', '辛': '金',
      '壬': '水', '癸': '水'
    };
    return elementMap[dayMasterStem] || '';
  }
  
  /**
   * Helper: Count elements in the chart
   */
  private static count(chart: BaziChart): Record<string, number> {
    const counts: Record<string, number> = {
      '木': 0, '火': 0, '土': 0, '金': 0, '水': 0
    };
    
    // Count stems
    const stems = [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem];
    stems.forEach((stem: string) => {
      const element = this.getDayMasterElement(stem);
      if (element) counts[element]++;
    });
    
    // Count branches (simplified - main qi only)
    const branchElements: Record<string, string> = {
      '子': '水', '丑': '土', '寅': '木', '卯': '木',
      '辰': '土', '巳': '火', '午': '火', '未': '土',
      '申': '金', '酉': '金', '戌': '土', '亥': '水'
    };
    
    const branches = [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch];
    branches.forEach((branch: string) => {
      const element = branchElements[branch];
      if (element) counts[element]++;
    });
    
    return counts;
  }
}