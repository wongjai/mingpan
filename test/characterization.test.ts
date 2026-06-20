/**
 * Characterization（特徵化）測試 —— 黃金基準
 *
 * 目的：喺修改命盤計算邏輯之前，封存一批代表性命盤的「現狀」輸出做 baseline。
 * 之後每個 fix 跑呢個 test：
 *   - 唔應該受影響的命盤 → snapshot 必須一字不變（擋意外 side-effect）
 *   - 應該受影響的命盤   → snapshot 會 fail，人手審查新值對唔對（對照 lunar/iztro/權威）後 update
 *
 * 注意：只 snapshot deterministic 欄位，避開依賴 new Date() 的 current 運限，
 * 否則 baseline 會每日漂移。
 */
import { describe, it, expect } from 'vitest';
import { baziService } from '../src/services/bazi/BaziService';
import { ziweiService } from '../src/services/ziwei/ZiweiService';

type Case = {
  label: string;
  year: number; month: number; day: number; hour: number;
  minute?: number; gender: 'male' | 'female'; longitude?: number;
};

// 代表性命盤：覆蓋普通 / 子時 / 西部經度 / 節氣臨界 / 不同強弱 / 紫微晚子跨年
const CASES: Case[] = [
  { label: '普通男命-深圳經度', year: 1990, month: 5,  day: 15, hour: 10, minute: 30, gender: 'male',   longitude: 114.17 },
  { label: '普通女命-無經度',   year: 1988, month: 6,  day: 12, hour: 14, minute: 0,  gender: 'female' },
  { label: '晚子時-23時',       year: 2000, month: 1,  day: 1,  hour: 23, minute: 30, gender: 'male' },
  { label: '早子時-0時',        year: 2000, month: 1,  day: 1,  hour: 0,  minute: 30, gender: 'male' },
  { label: '西部經度-烏魯木齊', year: 1995, month: 8,  day: 10, hour: 12, minute: 0,  gender: 'male',   longitude: 87.6 },
  { label: '節氣臨界-立春前',   year: 2024, month: 2,  day: 4,  hour: 15, minute: 0,  gender: 'male' },
  { label: '乙木女命',          year: 1985, month: 11, day: 3,  hour: 8,  minute: 0,  gender: 'female' },
  { label: '紫微晚子跨年',      year: 2000, month: 12, day: 31, hour: 23, minute: 30, gender: 'male' },
];

function baziSnapshot(r: any) {
  return {
    四柱: {
      年: `${r.chart?.year?.stem}${r.chart?.year?.branch}`,
      月: `${r.chart?.month?.stem}${r.chart?.month?.branch}`,
      日: `${r.chart?.day?.stem}${r.chart?.day?.branch}`,
      時: `${r.chart?.hour?.stem}${r.chart?.hour?.branch}`,
    },
    日主: r.basic?.dayMaster,
    五行: r.basic?.fiveElements && {
      木: r.basic.fiveElements.木, 火: r.basic.fiveElements.火, 土: r.basic.fiveElements.土,
      金: r.basic.fiveElements.金, 水: r.basic.fiveElements.水,
    },
    十神: r.basic?.tenGods?.map((t: any) => `${t.name}@${t.position}`),
    喜用神: r.traditional?.yongShen && {
      用: r.traditional.yongShen.yongShen,
      喜: r.traditional.yongShen.xiShen,
      忌: r.traditional.yongShen.jiShen,
    },
    格局: r.traditional?.geJu?.pattern,
    強弱: r.traditional?.strength,
    定量強弱: r.enhanced?.strengthAnalysis &&
      `${r.enhanced.strengthAnalysis.dayMasterStrength}/${r.enhanced.strengthAnalysis.totalScore}`,
    大運前4: r.timeBased?.daYun?.slice(0, 4).map((d: any) => `${d.startAge}歲(${d.startYear}) ${d.stem}${d.branch}`),
  };
}

function ziweiSnapshot(r: any) {
  const palaces: any[] = r.palaces || [];
  const ming = palaces.find((p) => p.name === '命宮' || p.name === '命宫');
  const body = palaces.find((p) => p.isBodyPalace);
  const m: any = (r.mutagenInfo as any)?.natal;
  return {
    命宮: ming && `${ming.heavenlyStem}${ming.earthlyBranch} ${(ming.majorStars || []).map((s: any) => s.name).join('、') || '無主星'}`,
    身宮: body?.name,
    十二宮: palaces.map((p) => `${p.name}${p.heavenlyStem}${p.earthlyBranch}:${(p.majorStars || []).map((s: any) => s.name).join('、') || '空'}`),
    本命四化: m && `祿${m.lu}權${m.quan}科${m.ke}忌${m.ji}`,
  };
}

describe('characterization: 八字', () => {
  for (const c of CASES) {
    it(c.label, async () => {
      const r = await baziService.calculate({
        year: c.year, month: c.month, day: c.day, hour: c.hour,
        minute: c.minute, gender: c.gender, longitude: c.longitude,
      });
      expect(baziSnapshot(r)).toMatchSnapshot();
    });
  }
});

describe('characterization: 紫微', () => {
  for (const c of CASES) {
    it(c.label, () => {
      const r = ziweiService.calculate({
        year: c.year, month: c.month, day: c.day, hour: c.hour, gender: c.gender,
      });
      expect(ziweiSnapshot(r)).toMatchSnapshot();
    });
  }
});
