import { z } from "zod";

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
