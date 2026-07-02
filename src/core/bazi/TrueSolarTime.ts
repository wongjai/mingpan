/**
 * True Solar Time Calculator
 * Enhanced with high-precision astronomical calculations from taro-bazi
 * Implements algorithms from 寿星万年历 (Longevity Star Calendar)
 */

import {
  gregorianToJulianDay,
  getSolarLongitude,
  getLightAberration,
  getEarthNutationParameter
} from '../calendar/astronomicalCalendar';

/**
 * 真太陽時可選參數（向後兼容：全缺省 = 假設北京時間 UTC+8 / 120°E，無 DST）
 */
export interface TstOptions {
  /** 出生鐘錶所屬標準時區的 UTC 偏移（小時），缺省 8（北京） */
  timezone?: number;
  /** 顯式夏令時偏移（小時），扣減自鐘錶時間，如 1 = 撥快一小時 */
  dstOffset?: number;
  /** IANA 時區標識（如 'Asia/Shanghai'）；提供時由 Intl 推導標準偏移與 DST */
  timezoneId?: string;
}

/**
 * 真太陽時計算明細（供 output 審計與 calculate_true_solar_time tool 使用）
 */
export interface TstDetail {
  adjusted: Date;
  standardMeridian: number;            // 標準經線（度）
  longitudeCorrectionMinutes: number;  // 經度修正（分鐘）
  equationOfTimeMinutes: number;       // 均時差（分鐘，Jean Meeus）
  dstOffsetMinutes: number;            // 已扣減的夏令時（分鐘）
  totalCorrectionMinutes: number;      // 總修正（分鐘）
  standardOffsetHours: number;         // 解析後的標準時區偏移（小時）
  timezoneBasis: string;               // 時區依據：default-beijing | offset:N | iana:ID
  assumedTimezone: boolean;            // 是否因未提供時區而假設北京時間（且有經度）
}

export class TrueSolarTime {
  /**
   * Adjust clock time to true solar time with astronomical precision.
   * 向後兼容：options 缺省時等同舊版（假設北京時間 UTC+8 / 120°E、無 DST）。
   * @param date - The clock time
   * @param longitude - The longitude in degrees (positive for East, negative for West)
   * @param options - 時區 / 夏令時可選參數
   * @returns Adjusted date/time
   */
  static adjust(date: Date, longitude: number, options: TstOptions = {}): Date {
    return this.adjustWithDetail(date, longitude, options).adjusted;
  }

  /**
   * 真太陽時詳細計算，暴露各項修正分量。
   * - longitude 提供時：套用經度修正 + 均時差（真太陽時）。
   * - longitude 缺省時：只做夏令時鐘錶校正（經度修正/均時差為 0）。
   * 真太陽時 = 平太陽時 + 經度差 + 均時差 − 夏令時。
   */
  static adjustWithDetail(date: Date, longitude: number | undefined, options: TstOptions = {}): TstDetail {
    const hasLongitude = longitude !== undefined && longitude !== null;

    // 1) 解析時區：標準偏移（小時）+ 夏令時（分鐘）
    const tz = this.resolveTimezone(date, options);
    const standardMeridian = tz.standardOffsetHours * 15;

    // 2) 經度修正 + 均時差（僅當提供經度）。
    //    最短弧歸一化 [-180,180] 避免跨換日線時 360°（= 1440 分 = 1 日）誤差。
    let longitudeCorrectionMinutes = 0;
    let equationOfTimeMinutes = 0;
    if (hasLongitude) {
      const rawDiff = (longitude as number) - standardMeridian;
      const longDiff = ((rawDiff + 540) % 360) - 180;
      longitudeCorrectionMinutes = longDiff * 4;

      const jd = gregorianToJulianDay(
        date.getFullYear(), date.getMonth() + 1, date.getDate(),
        date.getHours(), date.getMinutes(), date.getSeconds()
      );
      equationOfTimeMinutes = this.getEquationOfTime(jd);
    }

    // 3) 夏令時扣減（顯式 dstOffset 優先，否則中國 1986–1991 自動偵測）
    const dstOffsetMinutes = tz.dstOffsetMinutes;

    // 4) 總修正
    const totalCorrectionMinutes = longitudeCorrectionMinutes + equationOfTimeMinutes - dstOffsetMinutes;
    const adjusted = new Date(date.getTime() + totalCorrectionMinutes * 60 * 1000);

    return {
      adjusted,
      standardMeridian,
      longitudeCorrectionMinutes,
      equationOfTimeMinutes,
      dstOffsetMinutes,
      totalCorrectionMinutes,
      standardOffsetHours: tz.standardOffsetHours,
      timezoneBasis: tz.basis,
      assumedTimezone: tz.assumed && hasLongitude,
    };
  }

  /**
   * 解析標準時區偏移（小時）與夏令時（分鐘）。
   * 優先序：IANA timezoneId → 數字 timezone → 缺省北京時間（含中國 1986–1991 自動 DST）。
   */
  private static resolveTimezone(date: Date, options: TstOptions): {
    standardOffsetHours: number; dstOffsetMinutes: number; basis: string; assumed: boolean;
  } {
    // (a) 明確 IANA：由 Intl 推導標準偏移與 DST
    if (options.timezoneId) {
      // 先驗證 IANA id，否則深層 Intl 錯誤只會上拋一句「calculation failed」，用戶唔知邊度錯
      try {
        new Intl.DateTimeFormat(undefined, { timeZone: options.timezoneId });
      } catch {
        throw new Error(
          `無效的 timezoneId：「${options.timezoneId}」，請用 IANA 時區格式（如 Asia/Hong_Kong、America/New_York）`
        );
      }
      const o = this.getIanaOffsets(date, options.timezoneId);
      return {
        standardOffsetHours: o.standardOffsetMinutes / 60,
        dstOffsetMinutes: options.dstOffset !== undefined ? options.dstOffset * 60 : o.dstOffsetMinutes,
        basis: `iana:${options.timezoneId}`,
        assumed: false,
      };
    }
    // (b) 明確數字 timezone：標準偏移 = timezone，DST = 顯式 dstOffset（缺省 0）
    if (options.timezone !== undefined) {
      return {
        standardOffsetHours: options.timezone,
        dstOffsetMinutes: (options.dstOffset ?? 0) * 60,
        basis: `offset:${options.timezone}`,
        assumed: false,
      };
    }
    // (c) 缺省：假設北京時間 UTC+8。顯式 dstOffset 優先，否則中國 1986–1991 自動偵測。
    const dst = options.dstOffset !== undefined
      ? options.dstOffset * 60
      : this.getChinaDstMinutes(date);
    return { standardOffsetHours: 8, dstOffsetMinutes: dst, basis: 'default-beijing', assumed: true };
  }

  /**
   * 中國 1986–1991 夏令時自動偵測（由 IANA Asia/Shanghai 推導）。
   * 限定窗口，避免擾動民國時期等歷史偏移。
   */
  private static getChinaDstMinutes(date: Date): number {
    const y = date.getFullYear();
    if (y < 1986 || y > 1991) return 0;
    return this.getIanaOffsets(date, 'Asia/Shanghai').dstOffsetMinutes;
  }

  /**
   * 由 IANA 時區於指定瞬間取標準偏移與夏令時（分鐘）。純 Node 內置 Intl，無外部依賴。
   * 標準偏移 = 1 月與 7 月偏移之較小者（兼容南北半球）。
   */
  private static getIanaOffsets(date: Date, timeZoneId: string): {
    standardOffsetMinutes: number; dstOffsetMinutes: number;
  } {
    const at = (d: Date): number => {
      const s = new Intl.DateTimeFormat('en-US', { timeZone: timeZoneId, timeZoneName: 'longOffset' })
        .formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
      const m = s.match(/GMT([+-])(\d{2}):?(\d{2})?/);
      if (!m) return 0;
      const sign = m[1] === '-' ? -1 : 1;
      return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
    };
    const total = at(date);
    const jan = at(new Date(Date.UTC(date.getFullYear(), 0, 1)));
    const jul = at(new Date(Date.UTC(date.getFullYear(), 6, 1)));
    const standardOffsetMinutes = Math.min(jan, jul);
    const dstOffsetMinutes = Math.max(0, total - standardOffsetMinutes);
    return { standardOffsetMinutes, dstOffsetMinutes };
  }

  /**
   * Calculate the equation of time with high precision
   * This accounts for the Earth's elliptical orbit and axial tilt
   * @param jd - Julian Day number
   * @returns Correction in minutes
   */
  private static getEquationOfTime(jd: number): number {
    // Calculate centuries from J2000.0
    const T = (jd - 2451545.0) / 36525.0;
    const T2 = T * T;
    const T3 = T2 * T;
    
    // Mean longitude of the Sun
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T2;
    
    // Mean anomaly of the Sun
    const M = 357.52911 + 35999.05029 * T - 0.0001537 * T2;
    
    // Eccentricity of Earth's orbit
    const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T2;
    
    // Convert to radians
    const MRad = M * Math.PI / 180;
    const L0Rad = L0 * Math.PI / 180;
    
    // Obliquity of the ecliptic
    const epsilon = 23.43929111 - 0.013004167 * T - 0.000000164 * T2 + 0.000000503 * T3;
    const y = Math.tan(0.5 * epsilon * Math.PI / 180) ** 2;
    
    // Equation of time
    const E = y * Math.sin(2 * L0Rad)
             - 2 * e * Math.sin(MRad)
             + 4 * e * y * Math.sin(MRad) * Math.cos(2 * L0Rad)
             - 0.5 * y * y * Math.sin(4 * L0Rad)
             - 1.25 * e * e * Math.sin(2 * MRad);
    
    // Convert from radians to minutes
    return E * 180 / Math.PI * 4;
  }
  
  /**
   * Get the day of year (1-365/366)
   */
  private static getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return dayOfYear;
  }
  
  /**
   * Calculate sunrise time with astronomical precision
   * @param date - The date
   * @param latitude - Latitude in degrees (positive for North)
   * @param longitude - Longitude in degrees (positive for East)
   * @returns Sunrise time
   */
  static calculateSunrise(date: Date, latitude: number, longitude: number): Date {
    // Convert to Julian Day at noon
    const jdNoon = gregorianToJulianDay(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      12, 0, 0
    );
    
    // Get solar longitude
    const solarLongitude = getSolarLongitude(jdNoon);
    
    // Calculate solar declination
    const obliquity = 23.43929111; // Earth's axial tilt
    const declinationRad = Math.asin(
      Math.sin(solarLongitude * Math.PI / 180) * 
      Math.sin(obliquity * Math.PI / 180)
    );
    
    // Calculate hour angle at sunrise
    const latRad = latitude * Math.PI / 180;
    
    // Check for polar day/night
    const cosH = -Math.tan(latRad) * Math.tan(declinationRad);
    if (cosH > 1) {
      // Polar night - no sunrise
      return new Date(NaN);
    }
    if (cosH < -1) {
      // Polar day - sun doesn't set
      return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    }
    
    const hourAngleRad = Math.acos(cosH);
    const hourAngleDeg = hourAngleRad * 180 / Math.PI;
    
    // Time of solar noon (in hours)
    const solarNoon = 12 - longitude / 15 + date.getTimezoneOffset() / 60;
    
    // Sunrise time
    const sunriseHour = solarNoon - hourAngleDeg / 15;
    
    // Apply equation of time correction
    const equationOfTime = this.getEquationOfTime(jdNoon);
    const correctedSunriseHour = sunriseHour - equationOfTime / 60;
    
    const sunriseDate = new Date(date);
    sunriseDate.setHours(Math.floor(correctedSunriseHour));
    sunriseDate.setMinutes(Math.floor((correctedSunriseHour % 1) * 60));
    sunriseDate.setSeconds(0);
    
    return sunriseDate;
  }
  
  /**
   * Calculate sunset time with astronomical precision
   * @param date - The date
   * @param latitude - Latitude in degrees
   * @param longitude - Longitude in degrees
   * @returns Sunset time
   */
  static calculateSunset(date: Date, latitude: number, longitude: number): Date {
    // Similar to sunrise but add the hour angle instead of subtracting
    const jdNoon = gregorianToJulianDay(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      12, 0, 0
    );
    
    const solarLongitude = getSolarLongitude(jdNoon);
    const obliquity = 23.43929111;
    const declinationRad = Math.asin(
      Math.sin(solarLongitude * Math.PI / 180) * 
      Math.sin(obliquity * Math.PI / 180)
    );
    
    const latRad = latitude * Math.PI / 180;
    const cosH = -Math.tan(latRad) * Math.tan(declinationRad);
    
    if (cosH > 1) {
      // Polar night
      return new Date(NaN);
    }
    if (cosH < -1) {
      // Polar day
      return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
    }
    
    const hourAngleRad = Math.acos(cosH);
    const hourAngleDeg = hourAngleRad * 180 / Math.PI;
    
    const solarNoon = 12 - longitude / 15 + date.getTimezoneOffset() / 60;
    const sunsetHour = solarNoon + hourAngleDeg / 15;
    
    const equationOfTime = this.getEquationOfTime(jdNoon);
    const correctedSunsetHour = sunsetHour - equationOfTime / 60;
    
    const sunsetDate = new Date(date);
    sunsetDate.setHours(Math.floor(correctedSunsetHour));
    sunsetDate.setMinutes(Math.floor((correctedSunsetHour % 1) * 60));
    sunsetDate.setSeconds(0);
    
    return sunsetDate;
  }
  
  /**
   * Determine if a time is during daylight hours
   * @param date - The date/time to check
   * @param latitude - Latitude in degrees
   * @param longitude - Longitude in degrees
   * @returns true if during daylight hours
   */
  static isDaylight(date: Date, latitude: number, longitude: number): boolean {
    const sunrise = this.calculateSunrise(date, latitude, longitude);
    const sunset = this.calculateSunset(date, latitude, longitude);
    
    // Handle polar day/night cases
    if (isNaN(sunrise.getTime())) return false; // Polar night
    if (sunrise.getHours() === 0 && sunset.getHours() === 23) return true; // Polar day
    
    return date >= sunrise && date <= sunset;
  }
  
  /**
   * Get timezone offset for a longitude
   * @param longitude - Longitude in degrees
   * @returns Timezone offset in hours from UTC
   */
  static getTimezoneOffset(longitude: number): number {
    // Theoretical timezone based on longitude
    // Actual timezones may differ due to political boundaries
    return Math.round(longitude / 15);
  }
  
  /**
   * Calculate the solar position (altitude and azimuth) for a given time and location
   * Useful for advanced BaZi calculations that consider solar position
   */
  static getSolarPosition(date: Date, latitude: number, longitude: number): {
    altitude: number;  // degrees above horizon
    azimuth: number;   // degrees from north
  } {
    const jd = gregorianToJulianDay(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds()
    );
    
    // Get solar coordinates
    const solarLongitude = getSolarLongitude(jd);
    const obliquity = 23.43929111;
    
    // Right ascension and declination
    const alpha = Math.atan2(
      Math.cos(obliquity * Math.PI / 180) * Math.sin(solarLongitude * Math.PI / 180),
      Math.cos(solarLongitude * Math.PI / 180)
    );
    const delta = Math.asin(
      Math.sin(obliquity * Math.PI / 180) * Math.sin(solarLongitude * Math.PI / 180)
    );
    
    // Local sidereal time
    const T = (jd - 2451545.0) / 36525.0;
    const theta0 = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + T * T * (0.000387933 - T / 38710000);
    const theta = (theta0 + longitude) % 360;
    
    // Hour angle
    const H = (theta - alpha * 180 / Math.PI) * Math.PI / 180;
    
    // Convert to horizontal coordinates
    const latRad = latitude * Math.PI / 180;
    const altitude = Math.asin(
      Math.sin(latRad) * Math.sin(delta) + 
      Math.cos(latRad) * Math.cos(delta) * Math.cos(H)
    );
    
    const azimuth = Math.atan2(
      Math.sin(H),
      Math.cos(H) * Math.sin(latRad) - Math.tan(delta) * Math.cos(latRad)
    );
    
    return {
      altitude: altitude * 180 / Math.PI,
      azimuth: ((azimuth * 180 / Math.PI + 360) % 360)
    };
  }
}