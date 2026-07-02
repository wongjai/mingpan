# 命盘 MCP Server

[![Version](https://img.shields.io/badge/version-0.1.9-blue.svg)](https://github.com/ChesterRa/mingpan)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)

**命盘（Mingpan）** 是一个中华传统术数 MCP 服务，为 Claude 等 AI 应用提供命理排盘与占卜起卦的计算能力。

## 特性

-  **MCP 原生**：无缝集成 Claude Desktop 及 Claude Code
- 🌏 **中文输出**：以简体为主，术语保持传统
- 📊 **结构化文本 + structuredContent**：每个工具同时返回可读文本与机器可读的结构化数据
- 🕗 **真太阳时精校**：经度修正 + 均时差（Jean Meeus）+ 时区/夏令时，支持全球时区（IANA）
- 🏷️ **MCP 规范标注**：所有工具带 `readOnlyHint` 等 annotations，便于客户端判断安全与缓存

## 配置方法

### Claude Desktop

找到配置文件并添加以下内容：

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mingpan": {
      "command": "npx",
      "args": ["-y", "mingpan"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add mingpan -- npx -y mingpan
```

### 验证

配置完成后重启客户端，然后尝试：

> 请帮我排一个八字命盘，1992年4月12日7点30分，男性

> 请帮我起一个奇门遁甲时盘，2024年6月21日10点

## 工具列表

### 命理排盘

命理学基于出生时间推算人生运势，属于「命」的范畴。

#### 八字命理

| 工具                   | 说明                                       |
| ---------------------- | ------------------------------------------ |
| `bazi_basic`           | 八字命盘排盘（四柱、藏干、十神、五行力量） |
| `bazi_dayun`           | 大运列表（十年一运）                       |
| `bazi_liunian`         | 流年列表（指定年份范围）                   |
| `bazi_liuyue`          | 流月列表（节气月，立春起算）               |
| `bazi_liuri`           | 流日列表（指定月份内每日）                 |
| `bazi_manifestation`   | 八字显化指引（喜用神导向的成长与行动建议） |
| `bazi_true_solar_time` | 真太阳时换算（经度修正 + 均时差 + 夏令时） |
| `bazi_reverse`         | 八字反查（由四柱反推可能的公历出生时间）   |

#### 紫微斗数

| 工具             | 说明                                     |
| ---------------- | ---------------------------------------- |
| `ziwei_basic`    | 紫微命盘排盘（十二宫、主星、辅星、四化） |
| `ziwei_daxian`   | 大限列表（十年一限）                     |
| `ziwei_xiaoxian` | 小限列表（每年一宫）                     |
| `ziwei_liunian`  | 流年列表（指定年份范围）                 |
| `ziwei_liuyue`   | 流月列表（农历月）                       |
| `ziwei_liuri`    | 流日列表（农历日）                       |

### 占卜起卦

占卜术基于起卦时间或随机数推演卦象，属于「卜」的范畴。

#### 六爻

| 工具           | 说明                                                |
| -------------- | --------------------------------------------------- |
| `liuyao_basic` | 六爻排盘（本卦/变卦、纳甲、六亲、六神、世应、旬空） |

六爻输入为六个爻值（自下而上）：
- 6 = 老阴（动爻，阴变阳）
- 7 = 少阳（静爻）
- 8 = 少阴（静爻）
- 9 = 老阳（动爻，阳变阴）

#### 梅花易数

| 工具           | 说明                                     |
| -------------- | ---------------------------------------- |
| `meihua_basic` | 梅花易数排盘（本卦/变卦/互卦、体用分析） |

支持两种起卦方式：
- 时间起卦：根据农历年月日时计算
- 数字起卦：根据两个数字计算

#### 大六壬

| 工具             | 说明                                             |
| ---------------- | ------------------------------------------------ |
| `daliuren_basic` | 大六壬排盘（天地盘、四课、三传、十二天将、神煞） |

大六壬为三式之首，需输入节气、农历月、日干支、时干支。

#### 奇门遁甲

| 工具            | 说明 |
| --------------- | ---- |
| `qimen_basic`   | 奇门遁甲排盘（九宫布局、三奇六仪、八门九星八神、格局判断） |
| `qimen_yongshen`| 奇门用神分析（按事类选取用神，含主客、旺衰、空亡、入墓等） |
| `qimen_zeri`    | 奇门择日（指定日期区间内筛选相对更佳的时机） |

奇门遁甲为三式之一，盘式与规则主要参考张志春《神奇之门》，支持：时盘/日盘/月盘/年盘、转盘/飞盘、拆补法/茅山法。

更多说明见：`docs/qimen-yongshen-guide.md`。

## 输入参数

### 命理工具（八字/紫微）

| 参数            | 类型    | 必填 | 说明                                                         |
| --------------- | ------- | ---- | ------------------------------------------------------------ |
| year            | number  | ✓    | 出生年份（1900-2100）                                        |
| month           | number  | ✓    | 出生月份（1-12）                                             |
| day             | number  | ✓    | 出生日期（1-31）                                             |
| hour            | number  | ✓    | 出生时辰（0-23）                                             |
| minute          | number  |      | 出生分钟（0-59），默认 0                                     |
| gender          | string  | ✓    | `male` / `female`                                            |
| longitude       | number  |      | 出生地经度，用于真太阳时校正                                 |
| timezone        | number  |      | 标准时区 UTC 偏移（小时），默认 8（北京时间）                |
| dstOffset       | number  |      | 夏令时偏移（小时）。中国 1986–1991 夏令时会自动识别          |
| timezoneId      | string  |      | IANA 时区标识（如 `Asia/Shanghai`、`America/New_York`）      |
| dayBoundaryMode | string  |      | 子时换日流派：`MIDNIGHT_00`（默认）/ `ZI_HOUR_23`            |
| isLunar         | boolean |      | 是否为农历输入，默认 false                                   |

### 占卜工具（六爻/梅花/大六壬）

占卜工具使用起卦时间而非出生时间，具体参数请参考各工具说明。

### 奇门遁甲工具

| 参数         | 类型    | 必填 | 说明 |
| ------------ | ------- | ---- | ---- |
| year         | number  | ✓    | 起盘年份（1900-2100） |
| month        | number  | ✓    | 起盘月份（1-12） |
| day          | number  | ✓    | 起盘日期（1-31） |
| hour         | number  | ✓    | 起盘时辰（0-23） |
| minute       | number  |      | 分钟（0-59），默认 0 |
| isLunar      | boolean |      | 是否为农历输入，默认 false |
| panType      | string  |      | `时盘` / `日盘` / `月盘` / `年盘`，默认 `时盘` |
| panStyle     | string  |      | `转盘` / `飞盘`，默认 `转盘` |
| zhiRunMethod | string  |      | `chaibu`（拆补法）/ `maoshan`（茅山法），默认 `chaibu` |

## 月份基准说明

| 系统 | 月份基准           | 日期基准 |
| ---- | ------------------ | -------- |
| 八字 | 节气月（立春起算） | 公历日   |
| 紫微 | 农历月（初一起算） | 农历日   |

## 真太阳时与时区

八字四柱以真太阳时为基准。提供 `longitude` 后，系统按下式校正出生时间再排盘：

> 真太阳时 = 钟表时间 + 经度修正 + 均时差（Jean Meeus）− 夏令时

- **经度修正**：每偏离标准经线 1° 修正 4 分钟；标准经线由 `timezone` 推导（默认北京 120°E）。
- **均时差**：采用 Jean Meeus 高精度公式（精度约 ±10 秒）。
- **夏令时**：中国 1986–1991 夏令时自动识别；其他地区可传 `timezoneId`（IANA，自动处理当地夏令时）或显式 `dstOffset`。
- **海外出生**：请同时提供 `longitude` 与 `timezone`/`timezoneId`；若只给经度未给时区，将默认按北京时间计算并在输出中附带提示。

可用 `bazi_true_solar_time` 工具单独换算真太阳时，查看经度修正、均时差、夏令时各分量。

> ⚠️ 向后兼容：未提供时区相关参数时，行为与旧版一致（按北京时间 UTC+8）。1986–1991 中国出生者因补上夏令时校正，结果可能与旧版不同（此为修正，非回归）。

## 子时换日流派

`dayBoundaryMode` 控制晚子时（23:00–23:59）的日柱归属：

| 取值          | 含义                             |
| ------------- | -------------------------------- |
| `MIDNIGHT_00` | 默认。子时不换日，晚子时仍属当日 |
| `ZI_HOUR_23`  | 23:00 即换日，晚子时归次日子时   |

## 结构化输出（structuredContent）

除可读文本外，所有工具同时返回 `structuredContent`，便于 AI / 程序直接消费：

- 命盘类：四柱、日主、五行、十神、真太阳时校正明细（`solarTimeInfo`）与 `metadata`
- 列表类：大运 / 流年 / 流月 / 流日等数组
- 占卜类：完整排盘结果对象

所有工具均标注为只读、幂等（`readOnlyHint` / `idempotentHint`），客户端可据此安全缓存。

## 开发

```bash
git clone https://github.com/ChesterRa/mingpan.git
cd mingpan
npm install
npm run build
npm run dev  # 监听变化
```

## 依赖

| 库                          | 用途             |
| --------------------------- | ---------------- |
| `@modelcontextprotocol/sdk` | MCP 协议实现     |
| `lunar-javascript`          | 农历/公历转换    |
| `iztro`                     | 紫微斗数计算引擎 |
| `zod`                       | 输入参数校验     |

## 路线图

- [x] 八字基础排盘与时运列表
- [x] 紫微基础排盘与时运列表
- [x] 六爻排盘
- [x] 梅花易数排盘
- [x] 大六壬排盘
- [x] 奇门遁甲排盘
- [x] 真太阳时多时区与夏令时校正、子时换日流派可选
- [x] 八字反查与真太阳时换算工具、全工具 structuredContent
- [ ] 出生时辰未知（仅排三柱）支持

## 许可证

Apache License 2.0
