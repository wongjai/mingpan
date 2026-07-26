/**
 * 八字顯化映射器（Manifestation Mapper）
 *
 * 純函數：將 BaziService.calculate() 產出的結構化 BaziResult，
 * 重新組織成「顯化（manifestation）」語域的個人成長指引 profile。
 *
 * 設計原則：
 * - 命理邏輯一律 reuse mingpan 內部已計算的結果（喜用神、十神、強弱、大運、流年），
 *   本映射器只負責「BaziResult → 顯化維度」的重組與書面語呈現，不重新發明命理計算。
 * - 事業／關係／健康直接取用 YongShenAnalyzer 已生成的建議（本身已是書面繁體）。
 * - 核心方向／財富／今日行動／日誌提問／肯定語為規則衍生（element-based），全部書面語。
 * - 防禦性：traditional / enhanced / timeBased 任何一段缺失，都退回較低 confidence，不拋錯。
 *
 * 輸出語域：書面語繁體中文。
 */

import { BaziResult } from './types';

export interface ManifestationTheme {
  title: string;
  summary: string;
  recommendedActions: string[];
  avoidances: string[];
}

export interface ManifestationProfile {
  confidence: 'low' | 'medium' | 'high';

  identity: {
    dayMaster: string;          // 日主天干
    dayMasterElement: string;   // 日主五行
    strength?: string;          // 日主強弱（衰极/身弱/.../旺极）
    pattern?: string;           // 格局
    pillars: {
      year?: string;
      month?: string;
      day?: string;
      hour?: string;
    };
  };

  energy: {
    favorableElements: string[];    // 用神＋喜神
    unfavorableElements: string[];  // 忌神
    coreDirection: string;          // 核心顯化方向（書面語）
  };

  themes: {
    career: ManifestationTheme;
    wealth: ManifestationTheme;
    relationship: ManifestationTheme;
    health: ManifestationTheme;
  };

  timing: {
    currentDaYun?: string;   // 當前大運干支（虛歲區間）
    yearGanZhi?: string;     // 目標／當前流年干支
    yearTheme?: string;      // 本年主題
    monthTheme?: string;     // 本月主題（MVP 暫不填，預留日後接 流月）
  };

  practices: {
    dailyAction: string;     // 今日行動
    journalPrompt: string;   // 日誌提問
    affirmation: string;     // 肯定語
  };

  warnings: string[];
}

export interface ManifestationMapOptions {
  targetYear?: number;
}

// ────────────────────────────────────────────────────────────
// 規則表（書面語）——核心方向／財富／日常實踐的 element 衍生語意
// ────────────────────────────────────────────────────────────

interface ElementManifest {
  energy: string;        // 核心能量關鍵詞
  wealthSummary: string; // 財富取向
  wealthActions: string[];
  dailyAction: string;
  journalPrompt: string;
  affirmation: string;
}

const ELEMENT_MANIFEST: Record<string, ElementManifest> = {
  木: {
    energy: '成長、規劃、學習與拓展',
    wealthSummary: '宜以長線累積與人脈經營為主軸，避免急功近利',
    wealthActions: ['為一項長期目標訂立可執行的下一步', '投資於能持續複利的技能與關係'],
    dailyAction: '為一個長期目標訂立明確的下一步並付諸行動。',
    journalPrompt: '今日我在哪一件事情上獲得了成長？',
    affirmation: '我順應自身的生長之力，穩步擴展。',
  },
  火: {
    energy: '表達、領導、傳播與影響力',
    wealthSummary: '宜透過能見度、影響力與表達創造價值，重視個人品牌',
    wealthActions: ['主動向外展示一項成果或觀點', '把握能提升曝光與連結的場合'],
    dailyAction: '主動表達一個你一直想分享的想法或成果。',
    journalPrompt: '今日我向外展現了哪一部分真實的自己？',
    affirmation: '我以溫暖而真誠的光，照亮自己與他人。',
  },
  土: {
    energy: '穩定、系統、承擔與累積',
    wealthSummary: '宜着重資產累積與穩定現金流，重視信用與根基',
    wealthActions: ['鞏固一項既有的收入或資產基礎', '建立可重複、可信賴的流程'],
    dailyAction: '整理並鞏固一項既有的基礎、承諾或資源。',
    journalPrompt: '今日我為長遠的安穩做了哪一件踏實的事？',
    affirmation: '我腳踏實地，承載並滋養所擁有的一切。',
  },
  金: {
    energy: '條理、精準、決斷與原則',
    wealthSummary: '宜透過紀律、定價與品質把關創造價值，重視專業門檻',
    wealthActions: ['為一件待決之事做出清晰取捨', '檢視並提升自身產出的品質與定價'],
    dailyAction: '為一件懸而未決之事做出清晰而果斷的取捨。',
    journalPrompt: '今日我在哪一處做到了取捨分明？',
    affirmation: '我以清明與分寸，雕琢出真正重要的事物。',
  },
  水: {
    energy: '流動、研究、應變與連結',
    wealthSummary: '宜把握靈活機會與學習驅動的收入，重視資訊與時機',
    wealthActions: ['蒐集一項關鍵資訊再作判斷', '保持選項彈性，順勢調整方向'],
    dailyAction: '蒐集一項你欠缺的關鍵資訊，再作出判斷。',
    journalPrompt: '今日我順應了哪一個變化、放下了哪一份執着？',
    affirmation: '我如水般順勢而行，於變化中尋得出路。',
  },
};

// 流年十神 → 本年主題（書面語）
const TEN_GOD_YEAR_THEME: Record<string, string> = {
  正官: '責任與規範之年，宜守正循序，外在的肯定與晉升多隨自律而來',
  七殺: '考驗與磨練之年，壓力背後是突破與承擔的契機，宜化壓力為紀律',
  正財: '務實經營之年，宜踏實累積、看顧既有資源與現金流',
  偏財: '機會流動之年，宜廣結善緣、把握靈活的開源時機，但忌貪多',
  食神: '才華舒展之年，宜順其自然地表達與創造，享受過程',
  傷官: '創新與外顯之年，才華鋒芒畢露，宜以作品說話、留意言語分寸',
  正印: '學習與滋養之年，宜進修、內省，貴人與長輩的扶持值得珍惜',
  偏印: '沉潛與鑽研之年，宜深耕專業、獨立思考，留意過度思慮',
  比肩: '自立與並肩之年，宜建立平等的合作關係，守住自己的節奏',
  劫財: '人際角力之年，合作與競爭並存，宜分清界線、量力而為',
};

// ────────────────────────────────────────────────────────────
// 輔助
// ────────────────────────────────────────────────────────────

const STEM_TO_ELEMENT: Record<string, string> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};

function pillarText(p: any): string | undefined {
  if (!p || !p.stem || !p.branch) return undefined;
  return `${p.stem}${p.branch}`;
}

function uniq(arr: (string | undefined | null)[]): string[] {
  return [...new Set(arr.filter((x): x is string => !!x))];
}

/** 取主導用神元素；缺用神時退回日主元素 */
function primaryElement(favorable: string[], dayMasterElement: string): string {
  const cand = favorable.find((e) => ELEMENT_MANIFEST[e]);
  return cand || (ELEMENT_MANIFEST[dayMasterElement] ? dayMasterElement : '土');
}

// ────────────────────────────────────────────────────────────
// 主映射
// ────────────────────────────────────────────────────────────

export function mapBaziToManifestation(
  result: BaziResult,
  options: ManifestationMapOptions = {}
): ManifestationProfile {
  const warnings: string[] = [];

  const chart = result.chart;
  const dayMaster = result.basic?.dayMaster || chart?.day?.stem || '';
  const dayMasterElement =
    result.basic?.dayMasterElement || STEM_TO_ELEMENT[dayMaster] || '';

  const yong = result.traditional?.yongShen;
  const favorableElements = uniq([...(yong?.yongShen || []), ...(yong?.xiShen || [])]);
  const unfavorableElements = uniq(yong?.jiShen || []);
  const rec = yong?.recommendations;

  const strength =
    result.traditional?.strength ||
    result.enhanced?.strengthAnalysis?.dayMasterStrength;
  // 格局：優先取 enhanced.patternAnalysis（權威書面格局名），
  // 缺失時退回 traditional.geJu.description（中文敘述）；
  // 絕不輸出 geJu.pattern（內部英文 key，如 follow_金）
  const rawPattern =
    result.enhanced?.patternAnalysis?.primaryPattern?.type ||
    result.traditional?.geJu?.description;
  const pattern =
    rawPattern && /[一-鿿]/.test(rawPattern) ? rawPattern : undefined;

  // confidence
  let confidence: ManifestationProfile['confidence'] = 'high';
  if (!yong || favorableElements.length === 0) {
    confidence = 'low';
    warnings.push(
      '未能取得完整的喜用神結構，以下指引主要依日主五行的一般傾向生成，個人化程度較低。'
    );
  } else if (!result.timeBased?.daYun?.length) {
    confidence = 'medium';
  }

  const main = primaryElement(favorableElements, dayMasterElement);
  const mainManifest = ELEMENT_MANIFEST[main];

  // 核心方向
  const favText = favorableElements.length
    ? favorableElements.join('、')
    : dayMasterElement;
  const coreDirection =
    `你的能量核心在於「${mainManifest.energy}」。` +
    `當你讓生活與選擇更貼近${favText}的特質時，內在會更順、外在的助力也更容易聚攏；` +
    `這便是你最自然的顯化方向。`;

  // ── 事業（reuse recommendations.career）──
  const career: ManifestationTheme = {
    title: '事業顯化',
    summary:
      `順應${favText}的能量發展事業最為得力，宜選擇與之相應的領域與角色，` +
      `循序累積、借力而行。`,
    recommendedActions: uniq([
      ...(rec?.career?.favorableIndustries?.slice(0, 5) || []),
      ...(rec?.career?.idealRoles?.slice(0, 3) || []),
    ]),
    avoidances: uniq(rec?.career?.avoidIndustries || []),
  };
  if (rec?.career?.timing) {
    career.summary += `行動節奏宜「${rec.career.timing}」。`;
  }
  if (career.recommendedActions.length === 0) {
    career.recommendedActions = [`選擇與${favText}相應的行業與角色，發揮所長`];
  }

  // ── 財富（規則衍生）──
  const wealth: ManifestationTheme = {
    title: '財富顯化',
    summary: mainManifest.wealthSummary + '。',
    recommendedActions: [...mainManifest.wealthActions],
    avoidances: unfavorableElements.length
      ? [`留意${unfavorableElements.join('、')}相關的耗損與過度投入`]
      : [],
  };

  // ── 關係（reuse recommendations.relationships）──
  const relationship: ManifestationTheme = {
    title: '關係顯化',
    summary:
      `在關係中，宜以「${(rec?.relationships?.communicationStyle || ['真誠溝通']).join('、')}」` +
      `為溝通基調，與具備${(rec?.relationships?.compatibleElements || favorableElements).join('、')}` +
      `特質的人較易彼此滋養。`,
    recommendedActions: uniq([
      ...(rec?.relationships?.partnerQualities?.slice(0, 3) || []),
      ...(rec?.relationships?.socialActivities?.slice(0, 3) || []),
    ]),
    avoidances: uniq(rec?.relationships?.conflictResolution
      ? [`衝突時宜「${rec.relationships.conflictResolution.join('、')}」，避免硬碰`]
      : []),
  };
  if (relationship.recommendedActions.length === 0) {
    relationship.recommendedActions = ['以真誠與耐心經營重要的關係'];
  }

  // ── 健康／能量平衡（reuse recommendations.health）──
  const health: ManifestationTheme = {
    title: '健康與能量平衡',
    summary:
      (rec?.health?.vulnerableAreas?.length
        ? `宜多留意${rec.health.vulnerableAreas.slice(0, 3).join('、')}的保養；`
        : '宜順應自身節奏，維持身心平衡；') +
      (rec?.health?.stressManagement?.length
        ? `紓壓之道在於「${rec.health.stressManagement.join('、')}」。`
        : '以規律作息與適度休息養護能量。'),
    recommendedActions: uniq([
      ...(rec?.health?.preventiveMeasures?.slice(0, 3) || []),
      ...(rec?.health?.exercises?.slice(0, 2) || []),
      ...(rec?.health?.dietaryGuidelines?.slice(0, 2) || []),
    ]),
    avoidances: [],
  };
  if (health.recommendedActions.length === 0) {
    health.recommendedActions = ['維持規律作息與適度運動，留意情緒的紓解'];
  }

  // ── 時機（大運／流年）──
  const currentDaYun = result.timeBased?.currentDaYun;
  const timing: ManifestationProfile['timing'] = {};
  if (currentDaYun) {
    timing.currentDaYun =
      `${currentDaYun.stem}${currentDaYun.branch}` +
      (currentDaYun.startAge && currentDaYun.endAge
        ? `（虛歲 ${currentDaYun.startAge}–${currentDaYun.endAge}）`
        : '');
  }

  const liuNianList = result.timeBased?.liuNian || [];
  const targetYear = options.targetYear;
  const targetLiuNian = targetYear
    ? liuNianList.find((l) => l.year === targetYear)
    : result.timeBased?.currentLiuNian;
  if (targetLiuNian) {
    timing.yearGanZhi = `${targetLiuNian.year}（${targetLiuNian.stem}${targetLiuNian.branch}）`;
    const theme = targetLiuNian.tenGod && TEN_GOD_YEAR_THEME[targetLiuNian.tenGod];
    if (theme) {
      timing.yearTheme = theme + '。';
    }
  } else if (targetYear) {
    warnings.push(`目標年份 ${targetYear} 超出可計算的流年範圍，已略過本年主題。`);
  }

  // ── 日常實踐（規則衍生）──
  const practices: ManifestationProfile['practices'] = {
    dailyAction: mainManifest.dailyAction,
    journalPrompt: mainManifest.journalPrompt,
    affirmation: mainManifest.affirmation,
  };

  return {
    confidence,
    identity: {
      dayMaster,
      dayMasterElement,
      strength,
      pattern,
      pillars: {
        year: pillarText(chart?.year),
        month: pillarText(chart?.month),
        day: pillarText(chart?.day),
        hour: pillarText(chart?.hour),
      },
    },
    energy: {
      favorableElements,
      unfavorableElements,
      coreDirection,
    },
    themes: { career, wealth, relationship, health },
    timing,
    practices,
    warnings,
  };
}
