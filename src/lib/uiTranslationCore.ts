import messageTemplates from "../data/uiMessagePatterns.json";

const localeNames: Record<string, string> = { id: "id-ID", en: "en-GB", es: "es-ES", ar: "ar-EG", hi: "hi-IN" };
type Values = Record<string, unknown>;
export type UiTranslator = {
  (text: string, values?: Values): string;
  <T>(text: T, values?: Values): T;
  locale: string;
  date: (value: string | number | Date | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
};

const patterns = messageTemplates
  .map(source => ({ source, literal: source.replace(/\{\{\w+\}\}/g, "") }))
  .filter(({ literal }) => /[a-zA-Z]{3}/.test(literal) && literal.trim().length >= 6)
  .sort((a, b) => b.literal.length - a.literal.length)
  .map(({ source }) => {
    const keys: string[] = [];
    const escaped = source.split(/(\{\{\w+\}\})/g).map(part => {
      const key = /^\{\{(\w+)\}\}$/.exec(part);
      if (key) { keys.push(key[1]); return "([\\s\\S]*?)"; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    return { source, keys, pattern: new RegExp(`^${escaped}$`) };
  });

function interpolate(text: string, values?: Values) {
  return text.replace(/\{\{(\w+)\}\}/g, (token, key: string) => values && Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? "") : token);
}

/** Translate known UI copy only. Inputs and API payloads never pass through this function. */
export function createUiTranslator(language: string, catalog: Readonly<Record<string, string>>): UiTranslator {
  const locale = localeNames[language] || localeNames.id;
  const translate = (text: unknown, values?: Values) => {
    if (typeof text !== "string" || !text) return text;
    if (Object.prototype.hasOwnProperty.call(catalog, text)) return interpolate(catalog[text], values);
    // Server errors may arrive with values already interpolated; match only known phrases.
    if (language !== "id" && !values) for (const { source, keys, pattern } of patterns) {
      if (!Object.prototype.hasOwnProperty.call(catalog, source)) continue;
      const match = pattern.exec(text);
      if (match) return interpolate(catalog[source], Object.fromEntries(keys.map((key, index) => [key, match[index + 1]])));
    }
    return interpolate(text, values);
  };
  const date = (value: string | number | Date | null | undefined, options?: Intl.DateTimeFormatOptions) => {
    if (value == null || value === "") return "—";
    const at = new Date(value);
    if (!Number.isFinite(at.getTime())) return "—";
    return new Intl.DateTimeFormat(locale, { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...options }).format(at);
  };
  return Object.assign(translate, { locale, date }) as UiTranslator;
}
