/**
 * Relations Analyzer
 * Comprehensive stem and branch relation system from taro-bazi
 * Implements complete Heavenly Stem Combinations and Earthly Branch Relations
 * Returns language-agnostic data with translation keys for internationalization
 */

import { POSITION_INDICES, getPositionKeyByName } from '../../../core/constants/positions';
import { BaziChart } from '../types';
import { EARTHLY_BRANCHES, HEAVENLY_STEMS } from '../../../core/constants/bazi';

export interface StemRelation {
  stems: string[];
  positions: string[];
  type: 'fiveCombination';
  element: string; // The resulting element from combination
  impact: '正面';
  strength: number; // 1-10 scale
  description: string; // Translation key
  meaning: string; // Translation key for symbolic meaning
}

export interface BranchRelation {
  branches: string[];
  positions: string[];
  type: string;
  subtype?: string;
  impact: '正面' | '负面' | '中性';
  strength: number; // 1-10 scale
  element?: string;
  description: string; // Translation key
  positionType?: '相' | '隔' | '遥' | '争' | '双'; // Adjacent | Separated | Distant | Competing | Double
  spacing?: number; // Distance between positions
}

export interface RelationsResult {
  // Heavenly Stem Relations
  stemCombinations: StemRelation[];
  
  // Earthly Branch Relations
  sixHarmonies: BranchRelation[];
  sixConflicts: BranchRelation[];
  sixHarms: BranchRelation[];
  threePunishments: BranchRelation[];
  threeHarmonies: BranchRelation[];
  sixDestructions: BranchRelation[];
  threeMeetings: BranchRelation[];
  
  overview: {
    totalRelations: number;
    positiveCount: number;
    negativeCount: number;
    dominantPattern: string;
    harmonyScore: number;
    hasStemCombinations: boolean;
  };
}

export class RelationsAnalyzer {
  
  // Position indices for distance calculation
  private static readonly POSITION_INDEX = POSITION_INDICES;

  /**
   * Calculate relation type based on positions
   * Returns positional relationship (相/隔/遥/争/双) and spacing
   */
  private static getRelationByPosition(
    positions1: string[],
    positions2: string[]
  ): { positionType: '相' | '隔' | '遥' | '争' | '双'; spacing: number } {
    // 转换中文位置名称为内部键
    const convertedPositions1 = positions1.map(pos => {
      const key = getPositionKeyByName(pos as any);
      return key || pos; // 如果已经是英文键则保持不变
    });
    const convertedPositions2 = positions2.map(pos => {
      const key = getPositionKeyByName(pos as any);
      return key || pos;
    });
    
    const totalCount = convertedPositions1.length + convertedPositions2.length;
    
    if (totalCount === 2) {
      const idx1 = this.POSITION_INDEX[convertedPositions1[0] as keyof typeof this.POSITION_INDEX];
      const idx2 = this.POSITION_INDEX[convertedPositions2[0] as keyof typeof this.POSITION_INDEX];
      const spacing = Math.abs(idx1 - idx2);
      
      if (spacing === 1) return { positionType: '相', spacing }; // Adjacent
      if (spacing === 2) return { positionType: '隔', spacing }; // Separated
      if (spacing === 3) return { positionType: '遥', spacing }; // Distant
    } else if (totalCount === 3) {
      // One side has 2, other has 1
      const multiPositions = convertedPositions1.length > 1 ? convertedPositions1 : convertedPositions2;
      const singlePosition = convertedPositions1.length === 1 ? convertedPositions1[0] : convertedPositions2[0];
      
      const idx1 = this.POSITION_INDEX[multiPositions[0] as keyof typeof this.POSITION_INDEX];
      const idx2 = this.POSITION_INDEX[multiPositions[1] as keyof typeof this.POSITION_INDEX];
      const idx3 = this.POSITION_INDEX[singlePosition as keyof typeof this.POSITION_INDEX];
      
      const spacing1 = Math.abs(idx1 - idx3);
      const spacing2 = Math.abs(idx2 - idx3);
      
      if (spacing1 === 1 && spacing2 === 1) {
        return { positionType: '争', spacing: 1 }; // Competing
      } else if (spacing1 === 1 || spacing2 === 1) {
        return { positionType: '相', spacing: 1 }; // Adjacent
      } else {
        return { positionType: '遥', spacing: Math.min(spacing1, spacing2) };
      }
    } else if (totalCount === 4) {
      if (convertedPositions1.length === convertedPositions2.length) {
        const idx1 = this.POSITION_INDEX[convertedPositions1[0] as keyof typeof this.POSITION_INDEX];
        const idx2 = this.POSITION_INDEX[convertedPositions1[1] as keyof typeof this.POSITION_INDEX];
        const spacing = Math.abs(idx1 - idx2);
        
        if (spacing === 1) return { positionType: '相', spacing };
        return { positionType: '双', spacing }; // Double
      } else {
        const singlePosition = convertedPositions1.length === 1 ? convertedPositions1[0] : convertedPositions2[0];
        const idx = this.POSITION_INDEX[singlePosition as keyof typeof this.POSITION_INDEX];
        
        if (idx === 1 || idx === 2) { // Month or Day position
          return { positionType: '相', spacing: 1 };
        }
        return { positionType: '争', spacing: 1 };
      }
    }
    
    return { positionType: '遥', spacing: 3 };
  }

  /**
   * Apply position strength modifier based on position type
   * Adjacent relations are stronger, distant ones are weaker
   */
  private static applyPositionModifier(baseStrength: number, positionType: '相' | '隔' | '遥' | '争' | '双'): number {
    switch (positionType) {
      case '相': // Adjacent - full strength
        return baseStrength;
      case '争': // Competing - slightly reduced (multiple branches competing)
        return Math.round(baseStrength * 0.9);
      case '双': // Double - slightly enhanced (reinforced relationship)
        return Math.min(10, Math.round(baseStrength * 1.1));
      case '隔': // Separated - moderately reduced
        return Math.round(baseStrength * 0.8);
      case '遥': // Distant - more reduced but still significant
        return Math.round(baseStrength * 0.6);
      default:
        return baseStrength;
    }
  }
  
  /**
   * Comprehensive analysis of all stem and branch relationships using taro-bazi system
   */
  static analyze(chart: BaziChart): RelationsResult {
    const stems = [
      { stem: chart.year.stem, position: '年柱' },
      { stem: chart.month.stem, position: '月柱' },
      { stem: chart.day.stem, position: '日柱' },
      { stem: chart.hour.stem, position: '時柱' }
    ];

    const branches = [
      { branch: chart.year.branch, position: '年柱' },
      { branch: chart.month.branch, position: '月柱' },
      { branch: chart.day.branch, position: '日柱' },
      { branch: chart.hour.branch, position: '時柱' }
    ];

    return this.runDetections(stems, branches);
  }

  /**
   * Analyze an arbitrary labeled pillar set (e.g. natal + 流月, 大運 + 流月).
   * Reuses the exact same detection helpers as {@link analyze} but is not
   * locked to the four natal positions, so it can cross-analyze 流月 against
   * natal pillars / 大運 / 流年.
   *
   * Position labels may be any string (e.g. '流月', '大運', '流年'); unknown
   * labels degrade gracefully to a '遥' (distant) positional relationship.
   */
  static analyzePillarSet(
    pillars: Array<{ stem: string; branch: string; position: string }>
  ): RelationsResult {
    const stems = pillars.map(p => ({ stem: p.stem, position: p.position }));
    const branches = pillars.map(p => ({ branch: p.branch, position: p.position }));
    return this.runDetections(stems, branches);
  }

  /**
   * Shared detection pipeline over generic stem/branch position lists.
   * Detection logic is unchanged; only the entry point is generalized.
   */
  private static runDetections(
    stems: Array<{ stem: string; position: string }>,
    branches: Array<{ branch: string; position: string }>
  ): RelationsResult {
    const result: RelationsResult = {
      // Heavenly Stem Relations
      stemCombinations: this.findStemCombinations(stems),
      
      // Earthly Branch Relations
      sixHarmonies: this.findSixHarmonies(branches),
      sixConflicts: this.findSixConflicts(branches),
      sixHarms: this.findSixHarms(branches),
      threePunishments: this.findThreePunishments(branches),
      threeHarmonies: this.findThreeHarmonies(branches),
      sixDestructions: this.findSixDestructions(branches),
      threeMeetings: this.findThreeMeetings(branches),
      
      overview: {
        totalRelations: 0,
        positiveCount: 0,
        negativeCount: 0,
        dominantPattern: '',
        harmonyScore: 0,
        hasStemCombinations: false
      }
    };

    // Calculate overview statistics
    result.overview = this.calculateOverview(result);

    return result;
  }

  /**
   * Heavenly Stem Five Combinations (天干五合)
   * Based on the reference document 八字教程-冲合刑害会.md
   */
  private static findStemCombinations(
    stems: Array<{ stem: string; position: string }>
  ): StemRelation[] {
    const combinations: StemRelation[] = [];
    
    // Five combination pairs with their resulting elements and meanings
    const fiveCombinationPairs = [
      { 
        stems: ['甲', '己'], 
        element: '土', 
        strength: 8, 
        description: '甲己合化土',
        meaning: '中正之合' // 中正之合
      },
      { 
        stems: ['乙', '庚'], 
        element: '金', 
        strength: 8, 
        description: '乙庚合化金',
        meaning: '仁義之合' // 仁義之合
      },
      { 
        stems: ['丙', '辛'], 
        element: '水', 
        strength: 7, 
        description: '丙辛合化水',
        meaning: '威制之合' // 威制之合
      },
      { 
        stems: ['丁', '壬'], 
        element: '木', 
        strength: 6, 
        description: '丁壬合化木',
        meaning: '淫慝之合' // 淫慝之合
      },
      { 
        stems: ['戊', '癸'], 
        element: '火', 
        strength: 6, 
        description: '戊癸合化火',
        meaning: '無情之合' // 無情之合
      }
    ];

    for (const combination of fiveCombinationPairs) {
      const found1 = stems.find(s => s.stem === combination.stems[0]);
      const found2 = stems.find(s => s.stem === combination.stems[1]);
      
      if (found1 && found2) {
        combinations.push({
          stems: [found1.stem, found2.stem],
          positions: [found1.position, found2.position],
          type: 'fiveCombination',
          element: combination.element,
          impact: '正面',
          strength: combination.strength,
          description: combination.description,
          meaning: combination.meaning
        });
      }
    }

    return combinations;
  }

  /**
   * Six Harmonies (六合) - Most favorable relationships
   * Precise implementation from taro-bazi
   */
  private static findSixHarmonies(
    branches: Array<{ branch: string; position: string }>
  ): BranchRelation[] {
    const harmonies: BranchRelation[] = [];
    
    // Taro-bazi's exact six harmony pairs with their elements
    const sixHarmonyPairs = [
      { branches: ['子', '丑'], element: '土', strength: 8, description: '子丑合化土' },
      { branches: ['寅', '亥'], element: '木', strength: 9, description: '寅亥合化木' },
      { branches: ['卯', '戌'], element: '火', strength: 7, description: '卯戌合化火' },
      { branches: ['辰', '酉'], element: '金', strength: 8, description: '辰酉合化金' },
      { branches: ['巳', '申'], element: '水', strength: 6, description: '巳申合化水' },
      { branches: ['午', '未'], element: '火', strength: 9, description: '午未合化火' }
    ];

    for (const harmony of sixHarmonyPairs) {
      const found1 = branches.find(b => b.branch === harmony.branches[0]);
      const found2 = branches.find(b => b.branch === harmony.branches[1]);
      
      if (found1 && found2) {
        const { positionType, spacing } = this.getRelationByPosition(
          [found1.position],
          [found2.position]
        );
        
        harmonies.push({
          branches: [found1.branch, found2.branch],
          positions: [found1.position, found2.position],
          type: 'sixHarmony',
          impact: '正面',
          strength: this.applyPositionModifier(harmony.strength, positionType),
          element: harmony.element,
          description: harmony.description,
          positionType,
          spacing
        });
      }
    }

    return harmonies;
  }

  /**
   * Six Conflicts (六沖) - Direct opposition relationships
   */
  private static findSixConflicts(
    branches: Array<{ branch: string; position: string }>
  ): BranchRelation[] {
    const conflicts: BranchRelation[] = [];
    
    const sixConflictPairs = [
      { branches: ['子', '午'], strength: 10, description: '子午相沖' },
      { branches: ['丑', '未'], strength: 8, description: '丑未相沖' },
      { branches: ['寅', '申'], strength: 9, description: '寅申相沖' },
      { branches: ['卯', '酉'], strength: 9, description: '卯酉相沖' },
      { branches: ['辰', '戌'], strength: 7, description: '辰戌相沖' },
      { branches: ['巳', '亥'], strength: 8, description: '巳亥相沖' }
    ];

    for (const conflict of sixConflictPairs) {
      const found1 = branches.find(b => b.branch === conflict.branches[0]);
      const found2 = branches.find(b => b.branch === conflict.branches[1]);
      
      if (found1 && found2) {
        const { positionType, spacing } = this.getRelationByPosition(
          [found1.position],
          [found2.position]
        );
        
        conflicts.push({
          branches: [found1.branch, found2.branch],
          positions: [found1.position, found2.position],
          type: 'sixConflict',
          impact: '负面',
          strength: this.applyPositionModifier(conflict.strength, positionType),
          description: conflict.description,
          positionType,
          spacing
        });
      }
    }

    return conflicts;
  }

  /**
   * Six Harms (六害) - Mutual harm relationships
   */
  private static findSixHarms(
    branches: Array<{ branch: string; position: string }>
  ): BranchRelation[] {
    const harms: BranchRelation[] = [];
    
    const sixHarmPairs = [
      { branches: ['子', '未'], strength: 7, description: '子未相害' },
      { branches: ['丑', '午'], strength: 6, description: '丑午相害' },
      { branches: ['寅', '巳'], strength: 8, description: '寅巳相害' },
      { branches: ['卯', '辰'], strength: 5, description: '卯辰相害' },
      { branches: ['申', '亥'], strength: 7, description: '申亥相害' },
      { branches: ['酉', '戌'], strength: 6, description: '酉戌相害' }
    ];

    for (const harm of sixHarmPairs) {
      const found1 = branches.find(b => b.branch === harm.branches[0]);
      const found2 = branches.find(b => b.branch === harm.branches[1]);
      
      if (found1 && found2) {
        const { positionType, spacing } = this.getRelationByPosition(
          [found1.position],
          [found2.position]
        );
        
        harms.push({
          branches: [found1.branch, found2.branch],
          positions: [found1.position, found2.position],
          type: 'sixHarm',
          impact: '负面',
          strength: this.applyPositionModifier(harm.strength, positionType),
          description: harm.description,
          positionType,
          spacing
        });
      }
    }

    return harms;
  }

  /**
   * Three Punishments (三刑) - Complex punishment relationships
   * Implements taro-bazi's complete punishment system
   */
  private static findThreePunishments(
    branches: Array<{ branch: string; position: string }>
  ): BranchRelation[] {
    const punishments: BranchRelation[] = [];
    
    // Self punishments (自刑)
    const selfPunishments = ['辰', '午', '酉', '亥'];
    for (const selfBranch of selfPunishments) {
      const found = branches.filter(b => b.branch === selfBranch);
      if (found.length > 1) {
        // For self punishments, we analyze pairs
        for (let i = 0; i < found.length - 1; i++) {
          for (let j = i + 1; j < found.length; j++) {
            const { positionType, spacing } = this.getRelationByPosition(
              [found[i].position],
              [found[j].position]
            );
            
            punishments.push({
              branches: [found[i].branch, found[j].branch],
              positions: [found[i].position, found[j].position],
              type: 'threePunishment',
              subtype: 'selfPunishment',
              impact: '负面',
              strength: this.applyPositionModifier(6, positionType),
              description: `${selfBranch}${selfBranch}自刑`,
              positionType,
              spacing
            });
          }
        }
      }
    }

    // Ungrateful punishment (無恩之刑): 子-卯
    const zi = branches.find(b => b.branch === '子');
    const mao = branches.find(b => b.branch === '卯');
    if (zi && mao) {
      const { positionType, spacing } = this.getRelationByPosition(
        [zi.position],
        [mao.position]
      );
      
      punishments.push({
        branches: [zi.branch, mao.branch],
        positions: [zi.position, mao.position],
        type: 'threePunishment',
        subtype: 'ungratefulPunishment',
        impact: '负面',
        strength: this.applyPositionModifier(8, positionType),
        description: '子卯無恩之刑',
        positionType,
        spacing
      });
    }

    // Bullying punishment (恃勢之刑): 寅巳相刑, 巳申相刑, 申寅相刑
    const yin = branches.find(b => b.branch === '寅');
    const si = branches.find(b => b.branch === '巳');
    const shen = branches.find(b => b.branch === '申');
    
    // Check each punishment pair separately
    if (yin && si) {
      const { positionType, spacing } = this.getRelationByPosition(
        [yin.position],
        [si.position]
      );
      
      punishments.push({
        branches: [yin.branch, si.branch],
        positions: [yin.position, si.position],
        type: 'threePunishment',
        subtype: 'bullyingPunishment',
        impact: '负面',
        strength: this.applyPositionModifier(8, positionType),
        description: '寅巳恃勢之刑',
        positionType,
        spacing
      });
    }
    
    if (si && shen) {
      const { positionType, spacing } = this.getRelationByPosition(
        [si.position],
        [shen.position]
      );
      
      punishments.push({
        branches: [si.branch, shen.branch],
        positions: [si.position, shen.position],
        type: 'threePunishment',
        subtype: 'bullyingPunishment',
        impact: '负面',
        strength: this.applyPositionModifier(8, positionType),
        description: '巳申恃勢之刑',
        positionType,
        spacing
      });
    }
    
    if (shen && yin) {
      const { positionType, spacing } = this.getRelationByPosition(
        [shen.position],
        [yin.position]
      );
      
      punishments.push({
        branches: [shen.branch, yin.branch],
        positions: [shen.position, yin.position],
        type: 'threePunishment',
        subtype: 'bullyingPunishment',
        impact: '负面',
        strength: this.applyPositionModifier(8, positionType),
        description: '申寅恃勢之刑',
        positionType,
        spacing
      });
    }

    // Uncivilized punishment (無禮之刑): 丑戌相刑, 戌未相刑, 未丑相刑
    const chou = branches.find(b => b.branch === '丑');
    const xu = branches.find(b => b.branch === '戌');
    const wei = branches.find(b => b.branch === '未');
    
    // Check each punishment pair separately
    if (chou && xu) {
      const { positionType, spacing } = this.getRelationByPosition(
        [chou.position],
        [xu.position]
      );
      
      punishments.push({
        branches: [chou.branch, xu.branch],
        positions: [chou.position, xu.position],
        type: 'threePunishment',
        subtype: 'uncivilizedPunishment',
        impact: '负面',
        strength: this.applyPositionModifier(7, positionType),
        description: '丑戌無禮之刑',
        positionType,
        spacing
      });
    }
    
    if (xu && wei) {
      const { positionType, spacing } = this.getRelationByPosition(
        [xu.position],
        [wei.position]
      );
      
      punishments.push({
        branches: [xu.branch, wei.branch],
        positions: [xu.position, wei.position],
        type: 'threePunishment',
        subtype: 'uncivilizedPunishment',
        impact: '负面',
        strength: this.applyPositionModifier(7, positionType),
        description: '戌未無禮之刑',
        positionType,
        spacing
      });
    }
    
    if (wei && chou) {
      const { positionType, spacing } = this.getRelationByPosition(
        [wei.position],
        [chou.position]
      );
      
      punishments.push({
        branches: [wei.branch, chou.branch],
        positions: [wei.position, chou.position],
        type: 'threePunishment',
        subtype: 'uncivilizedPunishment',
        impact: '负面',
        strength: this.applyPositionModifier(7, positionType),
        description: '未丑無禮之刑',
        positionType,
        spacing
      });
    }

    return punishments;
  }

  /**
   * Three Harmonies (三合) - Elemental triangle harmonies
   */
  private static findThreeHarmonies(
    branches: Array<{ branch: string; position: string }>
  ): BranchRelation[] {
    const harmonies: BranchRelation[] = [];
    
    const threeHarmonyGroups = [
      { branches: ['申', '子', '辰'], element: '水', strength: 10, description: '申子辰三合水局' },
      { branches: ['亥', '卯', '未'], element: '木', strength: 10, description: '亥卯未三合木局' },
      { branches: ['寅', '午', '戌'], element: '火', strength: 10, description: '寅午戌三合火局' },
      { branches: ['巳', '酉', '丑'], element: '金', strength: 10, description: '巳酉丑三合金局' }
    ];

    for (const group of threeHarmonyGroups) {
      const foundBranches = branches.filter(b => group.branches.includes(b.branch));
      // Gate on DISTINCT trine members: duplicate identical branches (e.g. 酉+酉) are 自刑, not any 合
      const distinct = [...new Set(foundBranches.map(b => b.branch))];

      if (distinct.length >= 2) {
        // Even partial three harmonies are significant
        const baseStrength = distinct.length === 3 ? group.strength : group.strength - 2;
        
        // Calculate position analysis for multi-branch relations
        const positions = foundBranches.map(f => f.position);
        let positionType: '相' | '隔' | '遥' | '争' | '双' = '遥';
        let minSpacing = 3;
        
        // Check spacing between all pairs
        for (let i = 0; i < positions.length - 1; i++) {
          for (let j = i + 1; j < positions.length; j++) {
            // 转换中文位置名称为内部键
            const key_i = getPositionKeyByName(positions[i] as any) || positions[i];
            const key_j = getPositionKeyByName(positions[j] as any) || positions[j];
            const spacing = Math.abs(this.POSITION_INDEX[key_i as keyof typeof this.POSITION_INDEX] - this.POSITION_INDEX[key_j as keyof typeof this.POSITION_INDEX]);
            if (spacing < minSpacing) {
              minSpacing = spacing;
              if (spacing === 1) positionType = '相';
              else if (spacing === 2) positionType = '隔';
            }
          }
        }
        
        // Special case for three-way harmonies
        if (distinct.length === 3) {
          const indices = positions.map(p => {
            const key = getPositionKeyByName(p as any) || p;
            return this.POSITION_INDEX[key as keyof typeof this.POSITION_INDEX];
          }).sort((a, b) => a - b);
          if (indices[2] - indices[0] === 2) {
            positionType = '争'; // Concentrated three-way harmony
          }
        }
        
        harmonies.push({
          branches: foundBranches.map(f => f.branch),
          positions: foundBranches.map(f => f.position),
          type: 'threeHarmony',
          impact: '正面',
          strength: this.applyPositionModifier(baseStrength, positionType),
          element: group.element,
          description: group.description,
          positionType,
          spacing: minSpacing
        });
      }
    }

    return harmonies;
  }

  /**
   * Six Destructions (六破) - Destructive relationships
   */
  private static findSixDestructions(
    branches: Array<{ branch: string; position: string }>
  ): BranchRelation[] {
    const destructions: BranchRelation[] = [];
    
    // Correct six destruction pairs based on traditional BaZi
    const sixDestructionPairs = [
      { branches: ['子', '酉'], strength: 6, description: '子酉相破' },
      { branches: ['卯', '午'], strength: 6, description: '卯午相破' },
      { branches: ['辰', '丑'], strength: 5, description: '辰丑相破' },
      { branches: ['戌', '未'], strength: 5, description: '戌未相破' },
      { branches: ['巳', '寅'], strength: 7, description: '巳寅相破' },
      { branches: ['申', '亥'], strength: 7, description: '申亥相破' }
    ];

    for (const destruction of sixDestructionPairs) {
      const found1 = branches.find(b => b.branch === destruction.branches[0]);
      const found2 = branches.find(b => b.branch === destruction.branches[1]);
      
      if (found1 && found2) {
        const { positionType, spacing } = this.getRelationByPosition(
          [found1.position],
          [found2.position]
        );
        
        destructions.push({
          branches: [found1.branch, found2.branch],
          positions: [found1.position, found2.position],
          type: 'sixDestruction',
          impact: '负面',
          strength: this.applyPositionModifier(destruction.strength, positionType),
          description: destruction.description,
          positionType,
          spacing
        });
      }
    }

    return destructions;
  }

  /**
   * Three Meetings (三會) - Directional season gatherings
   */
  private static findThreeMeetings(
    branches: Array<{ branch: string; position: string }>
  ): BranchRelation[] {
    const meetings: BranchRelation[] = [];
    
    const threeMeetingGroups = [
      { branches: ['亥', '子', '丑'], element: '水', season: 'winter', strength: 8, description: '亥子丑三會水局' },
      { branches: ['寅', '卯', '辰'], element: '木', season: 'spring', strength: 8, description: '寅卯辰三會木局' },
      { branches: ['巳', '午', '未'], element: '火', season: 'summer', strength: 8, description: '巳午未三會火局' },
      { branches: ['申', '酉', '戌'], element: '金', season: 'autumn', strength: 8, description: '申酉戌三會金局' }
    ];

    for (const group of threeMeetingGroups) {
      const foundBranches = branches.filter(b => group.branches.includes(b.branch));
      // Gate on DISTINCT trine members: duplicate identical branches (e.g. 酉+酉) are 自刑, not any 會
      const distinct = [...new Set(foundBranches.map(b => b.branch))];

      if (distinct.length >= 2) {
        const baseStrength = distinct.length === 3 ? group.strength : group.strength - 2;
        
        // Calculate position analysis for multi-branch relations
        const positions = foundBranches.map(f => f.position);
        let positionType: '相' | '隔' | '遥' | '争' | '双' = '遥';
        let minSpacing = 3;
        
        // Check spacing between all pairs
        for (let i = 0; i < positions.length - 1; i++) {
          for (let j = i + 1; j < positions.length; j++) {
            // 转换中文位置名称为内部键
            const key_i = getPositionKeyByName(positions[i] as any) || positions[i];
            const key_j = getPositionKeyByName(positions[j] as any) || positions[j];
            const spacing = Math.abs(this.POSITION_INDEX[key_i as keyof typeof this.POSITION_INDEX] - this.POSITION_INDEX[key_j as keyof typeof this.POSITION_INDEX]);
            if (spacing < minSpacing) {
              minSpacing = spacing;
              if (spacing === 1) positionType = '相';
              else if (spacing === 2) positionType = '隔';
            }
          }
        }
        
        // Special case for three meetings - consecutive positions are especially powerful
        if (distinct.length === 3) {
          const indices = positions.map(p => {
            const key = getPositionKeyByName(p as any) || p;
            return this.POSITION_INDEX[key as keyof typeof this.POSITION_INDEX];
          }).sort((a, b) => a - b);
          if (indices[2] - indices[0] === 2 && indices[1] - indices[0] === 1) {
            positionType = '争'; // Perfect seasonal meeting
          }
        }
        
        meetings.push({
          branches: foundBranches.map(f => f.branch),
          positions: foundBranches.map(f => f.position),
          type: 'threeMeeting',
          impact: '正面',
          strength: this.applyPositionModifier(baseStrength, positionType),
          element: group.element,
          description: group.description,
          positionType,
          spacing: minSpacing
        });
      }
    }

    return meetings;
  }

  /**
   * Calculate comprehensive overview statistics
   */
  private static calculateOverview(result: RelationsResult): {
    totalRelations: number;
    positiveCount: number;
    negativeCount: number;
    dominantPattern: string;
    harmonyScore: number;
    hasStemCombinations: boolean;
  } {
    const allBranchRelations = [
      ...result.sixHarmonies,
      ...result.sixConflicts,
      ...result.sixHarms,
      ...result.threePunishments,
      ...result.threeHarmonies,
      ...result.sixDestructions,
      ...result.threeMeetings
    ];

    const totalRelations = allBranchRelations.length + result.stemCombinations.length;
    const positiveCount = allBranchRelations.filter(r => r.impact === '正面').length + result.stemCombinations.length;
    const negativeCount = allBranchRelations.filter(r => r.impact === '负面').length;

    // Calculate harmony score (0-100)
    let harmonyScore = 50; // Base score
    
    // Add points for positive branch relations
    allBranchRelations.forEach(relation => {
      if (relation.impact === '正面') {
        harmonyScore += relation.strength;
      } else if (relation.impact === '负面') {
        harmonyScore -= relation.strength;
      }
    });
    
    // Add points for stem combinations (always positive)
    result.stemCombinations.forEach(combination => {
      harmonyScore += combination.strength;
    });

    // Normalize to 0-100 range
    harmonyScore = Math.max(0, Math.min(100, harmonyScore));

    // Determine dominant pattern
    let dominantPattern = '平衡';
    if (result.stemCombinations.length >= 2) {
      dominantPattern = '天干五合';
    } else if (result.threeHarmonies.length > 0) {
      dominantPattern = '三合局';
    } else if (result.sixHarmonies.length >= 2) {
      dominantPattern = '六合';
    } else if (result.sixConflicts.length >= 2) {
      dominantPattern = '六沖';
    } else if (result.threePunishments.length > 0) {
      dominantPattern = '三刑';
    } else if (positiveCount > negativeCount) {
      dominantPattern = '和諧';
    } else if (negativeCount > positiveCount) {
      dominantPattern = '衝突';
    }

    return {
      totalRelations,
      positiveCount,
      negativeCount,
      dominantPattern,
      harmonyScore,
      hasStemCombinations: result.stemCombinations.length > 0
    };
  }

  /**
   * Get relationship strength modifier for fortune calculations
   * Used by other analyzers to factor in branch relationships
   */
  static getRelationshipModifier(result: RelationsResult): number {
    const { harmonyScore, dominantPattern } = result.overview;
    
    // Base modifier from harmony score
    let modifier = (harmonyScore - 50) / 50; // Range: -1 to +1
    
    // Additional modifiers for special patterns
    if (dominantPattern === 'threeHarmony') modifier += 0.3;
    if (dominantPattern === 'sixHarmony') modifier += 0.2;
    if (dominantPattern === 'sixConflict') modifier -= 0.3;
    if (dominantPattern === 'threePunishment') modifier -= 0.4;
    
    return Math.max(-1, Math.min(1, modifier));
  }

  /**
   * Check if specific relationship type exists
   * Utility method for other analyzers
   */
  static hasRelationType(result: RelationsResult, type: string): boolean {
    // Check stem combinations
    if (type === 'fiveCombination' || type === 'stemCombination') {
      return result.stemCombinations.length > 0;
    }
    
    // Check branch relations
    const allBranchRelations = [
      ...result.sixHarmonies,
      ...result.sixConflicts,
      ...result.sixHarms,
      ...result.threePunishments,
      ...result.threeHarmonies,
      ...result.sixDestructions,
      ...result.threeMeetings
    ];

    return allBranchRelations.some(relation => relation.type === type);
  }
}