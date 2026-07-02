import { describe, it, expect } from "vitest";
import { z } from "zod";
import { coercedBoolean, numifyNumericStrings, sanitizeToolArgs } from "../src/utils/coerce";
import { assertValidSolarDate } from "../src/utils/timeNormalization";

/**
 * Regression guard for the "Expected number/boolean, received string" bug:
 * MCP clients (Claude web app / ChatGPT connectors) serialize tool-call
 * arguments as strings. All numeric fields use z.coerce.number() and all
 * boolean fields use coercedBoolean() so stringified input is accepted while
 * invalid input is still rejected. These mirror the exact field patterns used
 * across bazi_basic / bazi_liunian / bazi_reverse / ziwei_liunian /
 * bazi_true_solar_time.
 */
describe("numeric fields tolerate stringified client input", () => {
  const yearField = z.coerce.number().int().min(1900).max(2100);       // year/startYear/endYear
  const monthField = z.coerce.number().int().min(1).max(12);           // month
  const longitudeField = z.coerce.number().min(-180).max(180);         // longitude (float)

  it("coerces stringified integers to numbers", () => {
    expect(yearField.parse("1993")).toBe(1993);
    expect(monthField.parse("6")).toBe(6);
  });

  it("passes native numbers through unchanged", () => {
    expect(yearField.parse(1993)).toBe(1993);
  });

  it("coerces stringified floats (longitude)", () => {
    expect(longitudeField.parse("114.17")).toBeCloseTo(114.17);
  });

  it("still rejects non-numeric and out-of-constraint input", () => {
    expect(() => yearField.parse("abc")).toThrow();   // NaN
    expect(() => yearField.parse("19.5")).toThrow();  // not int
    expect(() => yearField.parse("1800")).toThrow();  // below min
    expect(() => monthField.parse("13")).toThrow();   // above max
  });
});

describe("boolean fields tolerate stringified input without the z.coerce.boolean footgun", () => {
  it("maps canonical string forms correctly (incl. the 'false' anti-footgun)", () => {
    expect(coercedBoolean().parse("true")).toBe(true);
    expect(coercedBoolean().parse("false")).toBe(false); // z.coerce.boolean() would wrongly give true
    expect(coercedBoolean().parse("1")).toBe(true);
    expect(coercedBoolean().parse("0")).toBe(false);
  });

  it("passes native booleans through", () => {
    expect(coercedBoolean().parse(true)).toBe(true);
    expect(coercedBoolean().parse(false)).toBe(false);
  });

  it("applies optional/default like the real fields", () => {
    expect(coercedBoolean().optional().default(true).parse(undefined)).toBe(true);
  });

  it("rejects genuinely invalid values", () => {
    expect(() => coercedBoolean().parse("maybe")).toThrow();
  });
});

describe("sanitizeToolArgs: ''/null must mean 'not provided', never 0", () => {
  const S = z.object({
    hour: z.coerce.number().int().min(0).max(23),                 // required
    longitude: z.coerce.number().min(-180).max(180).optional(),   // optional
    minute: z.coerce.number().int().min(0).max(59).optional().default(0),
  });

  it("empty-string required field fails validation instead of becoming 0 (wrong-chart guard)", () => {
    expect(() => S.parse(sanitizeToolArgs({ hour: "" }))).toThrow();
    expect(() => S.parse(sanitizeToolArgs({ hour: null }))).toThrow();
  });

  it("empty-string optional field becomes undefined / default, not 0", () => {
    const r = S.parse(sanitizeToolArgs({ hour: "17", longitude: "", minute: null })) as {
      hour: number; longitude?: number; minute: number;
    };
    expect(r.longitude).toBeUndefined(); // NOT 0 (0°E would shift the chart by -480min)
    expect(r.minute).toBe(0);            // via default, not via Number(null)
    expect(r.hour).toBe(17);
  });

  it("recurses into nested objects and preserves arrays", () => {
    expect(sanitizeToolArgs({ a: { b: "", c: "x" }, d: [1, "", 3] })).toEqual({
      a: { c: "x" },
      d: [1, undefined, 3],
    });
  });
});

describe("assertValidSolarDate: impossible dates must error, not roll over", () => {
  it("rejects rollover dates", () => {
    expect(() => assertValidSolarDate(1993, 2, 30)).toThrow(/無效的公曆日期/);
    expect(() => assertValidSolarDate(1993, 4, 31)).toThrow();
    expect(() => assertValidSolarDate(2001, 2, 29)).toThrow(); // non-leap year
  });

  it("accepts real dates including leap day", () => {
    expect(() => assertValidSolarDate(2000, 2, 29)).not.toThrow(); // leap year
    expect(() => assertValidSolarDate(1993, 6, 15)).not.toThrow();
  });
});

describe("numifyNumericStrings: literal-union fields accept stringified numbers", () => {
  const yao = z.preprocess(
    numifyNumericStrings,
    z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9)])
  );

  it("converts stringified valid literals", () => {
    expect(yao.parse("6")).toBe(6);
    expect(yao.parse(9)).toBe(9);
  });

  it("still rejects out-of-set values, stringified or not", () => {
    expect(() => yao.parse("5")).toThrow();
    expect(() => yao.parse(5)).toThrow();
    expect(() => yao.parse("")).toThrow(); // empty string is not numified
  });
});

describe("BaziService cache key: omitted longitude must not collide with longitude 0", () => {
  it("returns different charts for longitude:0 (Greenwich, -480min TST) vs omitted (no TST)", async () => {
    const { BaziService } = await import("../src/services/bazi/BaziService");
    const svc = new BaziService();
    const base = { year: 1990, month: 5, day: 15, hour: 10, gender: "male" as const };
    const withZero = await svc.calculate({ ...base, longitude: 0 });
    const omitted = await svc.calculate({ ...base });
    // 兩者時柱必須不同（0°E 經度修正 -480 分 vs 無經度修正）；相同即快取污染
    expect(withZero.chart.hour.stem + withZero.chart.hour.branch)
      .not.toBe(omitted.chart.hour.stem + omitted.chart.hour.branch);
    // 精準指標：明確 0°E 有 -480 分經度修正；未提供經度則經度修正必為 0
    // （1990 年在中國 DST 窗口，兩者都另有夏令時校正，故不用 applied 判斷）
    expect(withZero.birthInfo?.solarTimeInfo?.longitudeCorrectionMinutes).toBeCloseTo(-480, 0);
    expect(omitted.birthInfo?.solarTimeInfo?.longitudeCorrectionMinutes ?? 0).toBe(0);
  }, 30_000);
});
