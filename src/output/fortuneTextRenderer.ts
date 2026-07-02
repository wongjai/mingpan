import { BaziResult } from '../services/bazi/types';
import { ZiweiResult, PALACE_NAMES, CompleteMutagenInfo } from '../services/ziwei/types';
import { FortuneQuery } from '../shared/types';
import { Lunar, Solar } from 'lunar-javascript';

export type FortuneTextOptions = {
  detail?: 'simple' | 'standard' | 'detailed';
  includePersonal?: boolean;
  includeLocation?: boolean;
  includeAnalysis?: boolean;
};

export type BaziTimeLabels = {
  dayun?: string;
  liunian?: string;
  liuyue?: string;
  liuri?: string;
};

export type ZiweiTimeContext = {
  decade?: { palaceName?: string; startAge?: number; endAge?: number; branch?: string; index?: number; palaceIndex?: number };
  yearly?: { year?: number; stem?: string; branch?: string; palaceName?: string; palaceIndex?: number };
  monthly?: { lunarLabel?: string; palaceName?: string; palaceIndex?: number };
  daily?: { date?: string; palaceName?: string; palaceIndex?: number };
};

const LUNAR_MONTH_NAMES: Record<number, string> = {
  1: '正月', 2: '二月', 3: '三月', 4: '四月', 5: '五月', 6: '六月',
  7: '七月', 8: '八月', 9: '九月', 10: '十月', 11: '冬月', 12: '臘月'
};

const HOUR_TO_SHICHEN: Record<number, string> = {
  23: '子時', 0: '子時', 1: '丑時', 2: '丑時', 3: '寅時', 4: '寅時',
  5: '卯時', 6: '卯時', 7: '辰時', 8: '辰時', 9: '巳時', 10: '巳時',
  11: '午時', 12: '午時', 13: '未時', 14: '未時', 15: '申時', 16: '申時',
  17: '酉時', 18: '酉時', 19: '戌時', 20: '戌時', 21: '亥時', 22: '亥時'
};

function getLunarDayName(day: number): string {
  const DAYS1 = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十'];
  const DAYS2 = ['十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
  const DAYS3 = ['廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
  if (day <= 10) return DAYS1[day - 1];
  if (day <= 20) return DAYS2[day - 11];
  return DAYS3[day - 21];
}

function formatLunarBirthday(birthDate: Date): string {
  try {
    const solar = Solar.fromYmd(birthDate.getFullYear(), birthDate.getMonth() + 1, birthDate.getDate());
    const lunar = solar.getLunar();
    
    const yearGanzhi = lunar.getYearInGanZhi();
    const lunarMonth = lunar.getMonth();
    const lunarDay = lunar.getDay();
    const isLeapMonth = lunar.getMonth() < 0;
    
    const monthName = LUNAR_MONTH_NAMES[Math.abs(lunarMonth)] || `${Math.abs(lunarMonth)}月`;
    const leapPrefix = isLeapMonth ? '閏' : '';
    const dayName = getLunarDayName(lunarDay);
    const shichen = HOUR_TO_SHICHEN[birthDate.getHours()] || '未知時';
    
    return `${yearGanzhi}年${leapPrefix}${monthName}${dayName}${shichen}`;
  } catch (e) {
    return '';
  }
}

export function renderFortuneText(
  params: {
    query: FortuneQuery;
    bazi?: BaziResult | null;
    ziwei?: ZiweiResult | null;
    subjectName?: string;
  },
  options: FortuneTextOptions = { detail: 'standard', includePersonal: false, includeLocation: false }
): string {
  const { query, bazi, ziwei, subjectName } = params;
  const name = options.includePersonal ? (subjectName || '命主') : '命主';
  const timeRange = query.when?.range || '一生';
  const aspect = (query.what?.aspect as string) || '綜合運勢';

  const lines: string[] = [];
  lines.push('【命理資訊（標準化文本）】');
  lines.push(`${name} - ${timeRange} - 主題：${aspect}`);
  lines.push('');

  // 八字
  if (bazi?.chart) {
    lines.push('◆ 八字四柱');
    const pillars = [
      { key: 'year', label: '年柱' },
      { key: 'month', label: '月柱' },
      { key: 'day', label: '日柱' },
      { key: 'hour', label: '時柱' },
    ] as const;
    for (const p of pillars) {
      const pillar: any = (bazi.chart as any)[p.key];
      if (pillar) {
        const hidden = (pillar.hiddenStems || []).map((hs: any) => hs.stem).join('、');
        lines.push(`${p.label}：${pillar.stem}${pillar.branch}${hidden ? `（藏干：${hidden}）` : ''}`);
      }
    }
    if (bazi.basic?.tenGods?.length) {
      const top5 = bazi.basic.tenGods
        .slice()
        .sort((a: any, b: any) => (b.strength ?? 0) - (a.strength ?? 0))
        .slice(0, 5)
        .map((tg: any) => `${tg.name}@${tg.position}`)
        .join('、');
      if (top5) lines.push(`十神摘要：${top5}`);
    }
    lines.push('');
  }

  // 紫微
  if (ziwei?.palaces?.length) {
    lines.push('◆ 紫微概要');
    const palaces: any[] = (ziwei as any).palaces;
    const ming = palaces.find(p => p?.name === '命宮' || p?.name === '命宫') || palaces[0];
    if (ming) {
      const majorStars = (ming.majorStars || []).map((s: any) => s.name).join('、');
      lines.push(`命宮：${ming.earthlyBranch}（主星：${majorStars}）`);
      const idx = palaces.indexOf(ming);
      if (idx >= 0) {
        const tri = [ (idx + 4) % 12, (idx + 7) % 12, (idx + 10) % 12 ];
        lines.push('三方四正：');
        for (const i of tri) {
          const pz = palaces[i];
          const stars = (pz?.majorStars || []).map((s: any) => s.name).join('、');
          lines.push(`- ${pz?.name}（${pz?.earthlyBranch}）：${stars}`);
        }
      }
    }
    lines.push('');
  }

  lines.push('—— 由 BaziWei 專業計算生成');
  return lines.join('\n');
}
export function renderBaziText(
  params: { 
    bazi: BaziResult; 
    subjectName?: string; 
    gender?: 'male' | 'female';
    birthDate?: Date;
    timeLabels?: BaziTimeLabels;
  },
  options: FortuneTextOptions = { detail: 'standard', includePersonal: false, includeLocation: false }
): string {
  const { bazi, subjectName, gender, birthDate, timeLabels } = params;
  const genderText = gender === 'male' ? '男' : gender === 'female' ? '女' : '未知';
  const dt = birthDate || bazi?.birthInfo?.solar;
  const fmt = (d?: Date) => {
    if (!d) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const lines: string[] = [];
  lines.push('=== 命主資料 ===');
  if (options.includePersonal && subjectName) {
    lines.push(`姓名：${subjectName}`);
  }
  lines.push(`性別：${genderText}`);
  if (dt) {
    lines.push(`公曆：${fmt(dt)}`);
    const lunarBirthday = formatLunarBirthday(dt);
    if (lunarBirthday) {
      lines.push(`農曆：${lunarBirthday}`);
    }
  }
  lines.push('');

  lines.push('=== 八字命盤 ===');
  const pillarDefs = [
    { key: 'year', label: '年柱' },
    { key: 'month', label: '月柱' },
    { key: 'day', label: '日柱' },
    { key: 'hour', label: '時柱' },
  ] as const;
  for (const p of pillarDefs) {
    const pillar: any = (bazi.chart as any)?.[p.key];
    if (!pillar) continue;
    const hidden = (pillar.hiddenStems || []).map((hs: any) => hs.stem).join('、');
    lines.push(`${p.label}：${pillar.stem || ''}${pillar.branch || ''}${hidden ? `（藏干：${hidden}）` : ''}`);
  }
  if (bazi.basic?.dayMaster) lines.push(`日主：${bazi.basic.dayMaster}`);
  if (timeLabels?.dayun) lines.push(`目標大運：${timeLabels.dayun}`);
  if (timeLabels?.liunian) lines.push(`目標流年：${timeLabels.liunian}`);
  if (timeLabels?.liuyue) lines.push(`目標流月：${timeLabels.liuyue}`);
  if (timeLabels?.liuri) lines.push(`目標流日：${timeLabels.liuri}`);
  lines.push('');

  // detail=simple：命主資料 + 四柱 + 日主，到此為止（analysis / 大運另由 handler 控制）
  const detail = options.detail || 'standard';
  const includeAnalysis = options.includeAnalysis !== false;
  if (detail !== 'simple' && includeAnalysis) {
    lines.push(...renderBaziAnalysisSections(bazi, detail === 'detailed'));
  }

  return lines.join('\n');
}

/**
 * 渲染 standard/detailed 分級共用的分析區塊：五行力量、日主強弱、格局、用神、十神、神煞、原局刑沖合害。
 * 抽出成獨立函式以維持 renderBaziText 主體精簡；detailed=true 時每個區塊附加更多細節。
 */
function renderBaziAnalysisSections(bazi: BaziResult, detailed: boolean): string[] {
  const lines: string[] = [];
  const fmtNum = (n: unknown): string => {
    if (typeof n !== 'number' || Number.isNaN(n)) return '—';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };

  // --- 五行力量 ---
  const fe: any = bazi.basic?.fiveElements;
  if (fe) {
    lines.push('=== 五行力量 ===');
    lines.push(`木${fmtNum(fe.木)} 火${fmtNum(fe.火)} 土${fmtNum(fe.土)} 金${fmtNum(fe.金)} 水${fmtNum(fe.水)}（共${fmtNum(fe.total)}）`);
    const balance = fe.balance;
    if (balance) {
      const missing = balance.missing?.length ? `　缺：${balance.missing.join('、')}` : '';
      lines.push(`最旺：${balance.strongest || '—'}　最弱：${balance.weakest || '—'}${missing}`);
    }
    lines.push('');
  }

  // --- 日主強弱 ---
  const sa: any = bazi.enhanced?.strengthAnalysis;
  if (sa) {
    lines.push('=== 日主強弱 ===');
    lines.push(`${sa.dayMasterStrength}（得分 ${fmtNum(sa.totalScore)}，${fmtNum(sa.percentage)}%）`);
    if (sa.analysis) lines.push(sa.analysis);
    if (detailed) {
      if (sa.details?.length) {
        lines.push('細項：');
        for (const d of sa.details) {
          lines.push(`- ${d.item}：${fmtNum(d.finalScore ?? d.score)}`);
        }
      }
      if (sa.characteristics?.length) lines.push(`特徵：${sa.characteristics.join('、')}`);
      if (sa.recommendations?.length) lines.push(`建議：${sa.recommendations.join('、')}`);
    }
    lines.push('');
  }

  // --- 格局（用 enhanced.patternAnalysis，NOT traditional.geJu） ---
  const pa: any = bazi.enhanced?.patternAnalysis;
  const primaryPattern = pa?.primaryPattern;
  if (primaryPattern) {
    lines.push('=== 格局 ===');
    lines.push(primaryPattern.type || '—');
    if (primaryPattern.description) lines.push(primaryPattern.description);
    if (detailed && pa?.secondaryPatterns?.length) {
      for (const sp of pa.secondaryPatterns) {
        lines.push(`次要格局：${sp.type}${sp.description ? `（${sp.description}）` : ''}`);
      }
    }
    lines.push('');
  }

  // --- 用神 ---
  const yg: any = bazi.traditional?.yongShen;
  if (yg) {
    lines.push('=== 用神 ===');
    const toArr = (v: any): string[] => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);
    const yongShenArr = toArr(yg.yongShen);
    const xiShenArr = toArr(yg.xiShen);
    const jiShenArr = toArr(yg.jiShen);
    if (yongShenArr.length === 0) {
      lines.push('用神分析未能得出明確結果');
    } else {
      lines.push(`用神：${yongShenArr.join('、')}　喜神：${xiShenArr.join('、') || '無'}　忌神：${jiShenArr.join('、') || '無'}`);
    }
    if (yg.explanation) lines.push(yg.explanation);
    if (detailed && yg.recommendations) {
      const rec: any = yg.recommendations;
      const summaryBits = [
        rec.career?.favorableIndustries?.length ? `適合產業：${rec.career.favorableIndustries.slice(0, 3).join('、')}` : '',
        rec.career?.timing ? `職涯時機：${rec.career.timing}` : '',
        rec.lifestyle?.schedule ? `作息建議：${rec.lifestyle.schedule}` : '',
      ].filter(Boolean);
      if (summaryBits.length) lines.push(`用神建議摘要：${summaryBits.join('　')}`);
    }
    lines.push('');
  }

  // --- 十神（藏干衍生項原始資料以英文 "(hidden)" 標註，改用「（藏）」符合繁中輸出） ---
  // 注：不顯示 strength 數字 —— TenGodsAnalyzer.calculateStrength 的位置/十神權重表
  // 因鍵值不匹配（英文鍵查中文位置、簡體鍵查繁體十神）而全數落空，數字無資訊量。
  const tenGods = bazi.basic?.tenGods ?? [];
  if (tenGods.length) {
    lines.push('=== 十神 ===');
    const godLabel = (name: string) => name.replace(/\(hidden\)$/, '（藏）');
    lines.push(tenGods.map((tg: any) => `${tg.position}·${godLabel(tg.name)}`).join('、'));
    lines.push('');
  }

  // --- 神煞（名稱按位置分組；detailed 才附完整描述） ---
  const shenShaList = bazi.basic?.shenSha ?? [];
  lines.push('=== 神煞 ===');
  if (shenShaList.length) {
    const byPosition = new Map<string, string[]>();
    for (const s of shenShaList) {
      const arr = byPosition.get(s.position) || [];
      arr.push(s.name);
      byPosition.set(s.position, arr);
    }
    for (const [position, names] of byPosition) {
      lines.push(`${position}：${names.join('、')}`);
    }
    if (detailed) {
      for (const s of shenShaList) {
        if (s.description) lines.push(`${s.position}·${s.name}（${s.type}）：${s.description}`);
      }
    }
  } else {
    lines.push('（無顯著神煞）');
  }
  lines.push('');

  // --- 原局刑沖合害（8 類合沖刑害合併，各取 description） ---
  const br: any = bazi.enhanced?.branchRelations;
  if (br) {
    const all = [
      ...(br.stemCombinations ?? []),
      ...(br.sixHarmonies ?? []),
      ...(br.sixConflicts ?? []),
      ...(br.sixHarms ?? []),
      ...(br.threePunishments ?? []),
      ...(br.threeHarmonies ?? []),
      ...(br.sixDestructions ?? []),
      ...(br.threeMeetings ?? []),
    ];
    lines.push('=== 原局刑沖合害 ===');
    if (all.length) {
      for (const r of all) {
        if (r?.description) lines.push(r.description);
      }
    } else {
      lines.push('（原局無明顯刑沖合害）');
    }
    lines.push('');
  }

  return lines;
}

export function renderZiweiText(
  params: { 
    ziwei: ZiweiResult; 
    subjectName?: string;
    gender?: 'male' | 'female';
    birthDate?: Date;
    timeContext?: ZiweiTimeContext;
    mutagen?: CompleteMutagenInfo; // 可選：覆蓋使用UI計算的四化（包含流月/流日/流時）
  },
  options: FortuneTextOptions = { detail: 'standard', includePersonal: false, includeLocation: false }
): string {
  const { ziwei, subjectName, gender, birthDate, timeContext, mutagen } = params;
  const genderText = gender === 'male' ? '男' : gender === 'female' ? '女' : '未知';
  const fmt = (d?: Date) => {
    if (!d) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const palaces: any[] = (ziwei as any).palaces || [];
  // 更嚴格的命宮識別：優先中文「命宮/命宫」，再回退到英文Life
  const ming = palaces.find(p => p?.name === '命宮' || p?.name === '命宫')
    || palaces.find(p => p?.name === 'Life Palace' || p?.name === 'Life')
    || palaces[0];
  const bodyPalace = palaces.find(p => p?.isBodyPalace);

  const brightnessMark = (b?: string) => {
    if (!b) return '';
    const m = b.toLowerCase();
    if (b === '庙' || b === '廟') return '廟';
    if (b === '旺') return '旺';
    if (b === '得') return '得';
    if (b === '利') return '利';
    if (b === '平') return '平';
    if (b === '不') return '不';
    if (b === '陷') return '陷';
    if (m === 'temple') return '廟';
    if (m === 'prosperous') return '旺';
    if (m === 'gain') return '得';
    if (m === 'benefit') return '利';
    if (m === 'unfavorable') return '不';
    if (m === 'fallen') return '陷';
    return '';
  };

  const lines: string[] = [];
  lines.push('=== 命主資料 ===');
  if (subjectName) {
    lines.push(`姓名：${subjectName}`);
  }
  lines.push(`性別：${genderText}`);
  if (birthDate) {
    lines.push(`公曆：${fmt(birthDate)}`);
    const lunarBirthday = formatLunarBirthday(birthDate);
    if (lunarBirthday) {
      lines.push(`農曆：${lunarBirthday}`);
    }
  }
  lines.push('');

  lines.push('=== 紫微命盘 ===');
  if (ming) {
    // 僅對主星標註亮度；輔星不標註
    const majors = (ming.majorStars || []) as any[];
    const minors = (ming.minorStars || []) as any[];
    const majorList = majors.map(s => `${s.name}${brightnessMark(s.brightness) ? `(${brightnessMark(s.brightness)})` : ''}`);
    const minorList = minors.slice(0, 6).map(s => s.name);
    const starList = [...majorList, ...minorList]
      .join('、')
      .replace(/、\s*$/, '');
    const hb = `${ming.heavenlyStem || ''}${ming.earthlyBranch || ''}`.trim();
    const starsText = starList || '無主星';
    lines.push(`本命命宮 ${hb}：${starsText}`.trim());
  }
  lines.push(`本命身宮：${bodyPalace?.name || '命宮'}`);

  if (timeContext?.decade && (timeContext.decade.palaceName || (timeContext.decade.startAge && timeContext.decade.endAge))) {
    const ageStr = (timeContext.decade.startAge && timeContext.decade.endAge)
      ? `（${timeContext.decade.startAge}-${timeContext.decade.endAge}岁）` : '';
    lines.push(`分析目標大限命宮宮位：${timeContext.decade.palaceName || '未知'}${ageStr}`);
  }
  if (timeContext?.yearly && (timeContext.yearly.year || timeContext.yearly.stem || timeContext.yearly.branch)) {
    const y = timeContext.yearly.year ? `（${timeContext.yearly.year}年）` : '';
    lines.push(`分析目標流年命宮宮位：${timeContext.yearly.palaceName || '未知'}${y}`);
  }
  if (timeContext?.monthly && (timeContext.monthly.lunarLabel || timeContext.monthly.palaceName)) {
    const suffix = timeContext.monthly.lunarLabel ? `（農曆${timeContext.monthly.lunarLabel}）` : '';
    lines.push(`分析目標流月命宮宮位：${timeContext.monthly.palaceName || '未知'}${suffix}`);
  }
  if (timeContext?.daily && (timeContext.daily.date || timeContext.daily.palaceName)) {
    const suffix = timeContext.daily.date ? `（公曆${timeContext.daily.date}）` : '';
    lines.push(`分析目標流日命宮宮位：${timeContext.daily.palaceName || '未知'}${suffix}`);
  }

  // 十二宮位：standard 和 detailed 模式都輸出完整宮位資訊
  // MCP命理工具需要完整的十二宮位作為基本資訊
  if (options.detail === 'standard' || options.detail === 'detailed') {
    // 十二宮位（按需求格式輸出：干支 本命<宮> 目標大限為X 目標流年為Y 目標流月為Z 目標流日為W（a-b歲） [身]：星曜列表）
    try {
      lines.push('');
      lines.push('十二宮位：');

      // 準備相對映射工具（對齊AI日曆邏輯：以PALACE_NAMES旋轉）
      const monthlyMingIndex = timeContext?.monthly?.palaceIndex;
      const dailyMingIndex = timeContext?.daily?.palaceIndex;
      const decadeMingIndex = timeContext?.decade?.palaceIndex ?? timeContext?.decade?.index;
      const yearlyMingIndex = timeContext?.yearly?.palaceIndex;

      const normalizeForText = (base: string): string => {
        // 將交友映射為僕役，其餘保持原樣；去掉尾部的「宮」字（命宮保留原樣）
        let name = base === '交友' ? '僕役' : base;
        if (name.endsWith('宮') && name !== '命宮') name = name.slice(0, -1);
        return name;
      };

      const relNameByIndex = (palaceIndex: number, mingIndex?: number): string | undefined => {
        if (mingIndex === undefined || mingIndex === null) return undefined;
        const i = (palaceIndex - mingIndex + 12) % 12;
        const raw = PALACE_NAMES[i] || '';
        return normalizeForText(raw);
      };

      // 以文本規範的順序輸出：命宮→兄弟→夫妻→子女→財帛→疾厄→遷移→僕役→官祿→田宅→福德→父母
      const TEXT_ORDER = ['命宮','兄弟','夫妻','子女','財帛','疾厄','遷移','僕役','官祿','田宅','福德','父母'];

      // iztro 已配置為 zh-TW，輸出繁體中文，與 PALACE_NAMES 一致
      // 僅需處理「僕役↔交友」的別名映射
      const resolvePalace = (label: string) => {
        if (label === '僕役') {
          // 僕役宮在 iztro 中名為「交友」
          return palaces.find(pp => pp?.name === '僕役' || pp?.name === '交友') as any;
        }
        return palaces.find(pp => pp?.name === label) as any;
      };

      for (const label of TEXT_ORDER) {
        const p = resolvePalace(label);
        if (!p) continue;
        const hb = `${p.heavenlyStem || ''}${p.earthlyBranch || ''}`.trim();
        // 星曜：主星（帶亮度）+ 少量輔星（不標註亮度）
        const major = (p.majorStars || []).map((s: any) => `${s.name}${brightnessMark(s.brightness) ? `(${brightnessMark(s.brightness)})` : ''}`);
        const minor = (p.minorStars || []).slice(0, 5).map((s: any) => s.name);
        const starsJoined = [...major, ...minor].join('、') || '無主星';

        // 動態宮位名稱
        const idx = p.index ?? 0;
        const decadeName = relNameByIndex(idx, decadeMingIndex) ? `目標大限為${relNameByIndex(idx, decadeMingIndex)}` : '';
        const yearlyName = relNameByIndex(idx, yearlyMingIndex) ? `目標流年為${relNameByIndex(idx, yearlyMingIndex)}` : '';
        const monthlyName = relNameByIndex(idx, monthlyMingIndex) ? `目標流月為${relNameByIndex(idx, monthlyMingIndex)}` : '';
        const dailyName = relNameByIndex(idx, dailyMingIndex) ? `目標流日為${relNameByIndex(idx, dailyMingIndex)}` : '';

        // 大限年齡區間（虛歲）
        // 大限年齡：若缺失，根據decades補全
        let age = '';
        if (p.decadeInfo && p.decadeInfo.startAge && p.decadeInfo.endAge) {
          age = `（${p.decadeInfo.startAge}-${p.decadeInfo.endAge}歲）`;
        } else if ((ziwei as any).decades?.length) {
          const dec = (ziwei as any).decades.find((d: any) => d.palaceIndex === (p.index ?? 0));
          if (dec?.startAge && dec?.endAge) {
            age = `（${dec.startAge}-${dec.endAge}歲）`;
          }
        }
        const bodyMark = p.isBodyPalace ? ' [身]' : '';
        const parts = [
          hb,
          `本命${label}`,
          decadeName,
          yearlyName,
          monthlyName,
          dailyName,
          age
        ].filter(Boolean).join(' ');
        lines.push(`${parts}${bodyMark}：${starsJoined}`.trim());
      }
    } catch {}

    // 四化
    // 只有在明確指定對應時間範圍時才顯示對應的四化
    // 本命四化始終顯示；大限/流年/流月/流日四化僅在有對應 timeContext 時顯示
    try {
      // 優先使用外部覆蓋的mutagen（包含月/日/時），否則使用ziwei內置
      const m = (mutagen as any) || ((ziwei as any).mutagenInfo as any);
      if (m) {
        const fmtLine = (label: string, info?: any) => {
          if (!info) return '';
          const parts: string[] = [];
          if (info.lu) parts.push(`化祿-${info.lu}`);
          if (info.quan) parts.push(`化權-${info.quan}`);
          if (info.ke) parts.push(`化科-${info.ke}`);
          if (info.ji) parts.push(`化忌-${info.ji}`);
          return parts.length ? `${label}：${parts.join(' ')}` : '';
        };

        const lines4: string[] = [];
        // 本命四化始終顯示
        const l1 = fmtLine('本命四化', m.natal);
        if (l1) lines4.push(l1);
        // 只有在有大限 timeContext 時才顯示大限四化
        if (timeContext?.decade) {
          const l2 = fmtLine('大限四化', m.decadal);
          if (l2) lines4.push(l2);
        }
        // 只有在有流年 timeContext 時才顯示流年四化
        if (timeContext?.yearly) {
          const l3 = fmtLine('流年四化', m.yearly);
          if (l3) lines4.push(l3);
        }
        // 只有在有流月 timeContext 時才顯示流月四化
        if (timeContext?.monthly) {
          const l4 = fmtLine('流月四化', m.monthly);
          if (l4) lines4.push(l4);
        }
        // 只有在有流日 timeContext 時才顯示流日四化
        if (timeContext?.daily) {
          const l5 = fmtLine('流日四化', m.daily);
          if (l5) lines4.push(l5);
        }
        if (lines4.length) {
          lines.push('');
          lines.push('四化系統：');
          for (const l of lines4) lines.push(l);
        }
      }
    } catch {}
  }

  lines.push('');
  return lines.join('\n');
}
