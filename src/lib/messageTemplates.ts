import { z } from "zod";

export const templateInput = z.object({
  name: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(10000),
});
export function templateVariables(content: string): string[] {
  return Array.from(new Set(Array.from(content.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]{0,39})\}/g), match => match[1])));
}
/** A single substitution pass: values containing braces are never evaluated. */
export function renderMessageTemplate(content: string, values: Record<string, string>) {
  return content.replace(/\{([a-zA-Z][a-zA-Z0-9_]{0,39})\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : token);
}
