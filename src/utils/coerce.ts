import { z } from "zod";

/**
 * Sanitize raw MCP tool-call arguments BEFORE Zod validation.
 *
 * Guards against the z.coerce.number() footgun: Number("") === 0 and
 * Number(null) === 0, so an empty-string longitude/timezone/hour from a
 * sloppy client would silently become 0 and produce a WRONG CHART instead of
 * a validation error. We treat "" and null as "not provided": the key is
 * removed, so required fields fail validation ("Required"/invalid type) and
 * optional fields fall back to their defaults. Recurses into nested
 * objects/arrays; array length is preserved (elements become undefined and
 * are rejected by their element schema).
 */
export function sanitizeToolArgs(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (Array.isArray(value)) return value.map(sanitizeToolArgs);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const s = sanitizeToolArgs(v);
      if (s !== undefined) out[k] = s;
    }
    return out;
  }
  return value;
}

/**
 * Preprocess helper: convert number-like strings to numbers, leaving
 * everything else untouched. For wrapping z.union([z.literal(6), ...]) etc.,
 * which z.coerce cannot handle — stringified client input ("6") would
 * otherwise be rejected by literal unions. JSON schema output is unchanged
 * (zod-to-json-schema reads through the preprocess wrapper).
 */
export function numifyNumericStrings(v: unknown): unknown {
  if (typeof v === "string") {
    const s = v.trim();
    if (s !== "" && Number.isFinite(Number(s))) return Number(s);
  }
  return v;
}

/**
 * Boolean schema tolerant of stringified input.
 *
 * Some MCP clients (e.g. Claude web app / ChatGPT connectors) serialize
 * tool-call arguments as strings, so a boolean field arrives as "true" / "false"
 * rather than a native boolean. Plain z.boolean() rejects those with
 * "Expected boolean, received string".
 *
 * We deliberately DO NOT use z.coerce.boolean(), which maps any non-empty string
 * (including "false") to true via Boolean(). This helper only accepts the
 * canonical textual forms and passes native booleans through unchanged; anything
 * else falls through to z.boolean() and is rejected as before.
 */
export function coercedBoolean() {
  return z.preprocess((v) => {
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "true" || s === "1") return true;
      if (s === "false" || s === "0") return false;
    }
    return v;
  }, z.boolean());
}
