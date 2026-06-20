/**
 * 八字顯化文本渲染器（Manifestation Text Renderer）
 *
 * 將 ManifestationProfile 渲染成跟現有 mingpan 工具一致風格的結構化繁體文本，
 * 末段附上免責提醒。語域：書面語。
 */

import { ManifestationProfile, ManifestationTheme } from '../services/bazi/ManifestationMapper';

function themeBlock(t: ManifestationTheme): string[] {
  const lines: string[] = [`=== ${t.title} ===`, t.summary];
  if (t.recommendedActions.length) lines.push(`宜：${t.recommendedActions.join('、')}`);
  if (t.avoidances.length) lines.push(`忌：${t.avoidances.join('；')}`);
  return lines;
}

export function renderManifestationText(profile: ManifestationProfile): string {
  const L: string[] = [];
  const id = profile.identity;

  // 命主概要
  L.push('=== 八字顯化指引 ===');
  const idBits = [
    `日主：${id.dayMaster}${id.dayMasterElement ? `（${id.dayMasterElement}）` : ''}`,
  ];
  if (id.strength) idBits.push(`強弱：${id.strength}`);
  if (id.pattern) idBits.push(`格局：${id.pattern}`);
  L.push(idBits.join('｜'));

  const p = id.pillars;
  const pill = [
    p.year && `年 ${p.year}`,
    p.month && `月 ${p.month}`,
    p.day && `日 ${p.day}`,
    p.hour && `時 ${p.hour}`,
  ].filter(Boolean).join('　');
  if (pill) L.push(`四柱：${pill}`);
  L.push('');

  // 核心顯化方向
  L.push('=== 核心顯化方向 ===');
  if (profile.energy.favorableElements.length) {
    L.push(`用神方向：${profile.energy.favorableElements.join('、')}`);
  }
  if (profile.energy.unfavorableElements.length) {
    L.push(`宜節制：${profile.energy.unfavorableElements.join('、')}`);
  }
  L.push(profile.energy.coreDirection);
  L.push('');

  // 四大顯化主題
  const themes = [
    profile.themes.career,
    profile.themes.wealth,
    profile.themes.relationship,
    profile.themes.health,
  ];
  for (const t of themes) {
    L.push(...themeBlock(t));
    L.push('');
  }

  // 時機
  const tm = profile.timing;
  if (tm.currentDaYun || tm.yearGanZhi || tm.yearTheme || tm.monthTheme) {
    L.push('=== 時機（大運・流年） ===');
    if (tm.currentDaYun) L.push(`當前大運：${tm.currentDaYun}`);
    if (tm.yearGanZhi) L.push(`本年：${tm.yearGanZhi}`);
    if (tm.yearTheme) L.push(`本年主題：${tm.yearTheme}`);
    if (tm.monthTheme) L.push(`本月主題：${tm.monthTheme}`);
    L.push('');
  }

  // 日常實踐
  L.push('=== 日常實踐 ===');
  L.push(`今日行動：${profile.practices.dailyAction}`);
  L.push(`日誌提問：${profile.practices.journalPrompt}`);
  L.push(`肯定語：${profile.practices.affirmation}`);
  L.push('');

  // 說明（如有）
  if (profile.warnings.length) {
    L.push('=== 說明 ===');
    for (const w of profile.warnings) L.push(`· ${w}`);
    L.push('');
  }

  // 免責提醒
  L.push('—— 提醒 ——');
  L.push(
    '本顯化指引以傳統八字象徵為本，重在自我覺察、反思與行動規劃，並非命定的預測，' +
    '亦不構成醫療、法律、投資、婚戀等專業意見。重大抉擇請結合現實情況審慎判斷，' +
    '必要時諮詢相關專業人士。'
  );

  return L.join('\n');
}
