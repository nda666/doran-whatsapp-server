import { z } from "zod";
export const aiProviders = ["openai", "gemini", "claude"] as const;
export type AiProvider = typeof aiProviders[number];
export const providerNames: Record<AiProvider, string> = { openai: "OpenAI", gemini: "Gemini AI", claude: "Claude AI" };
export const defaultAiPrompt = "Anda adalah asisten layanan pelanggan. Balas dalam bahasa pengguna dengan ramah dan ringkas. Gunakan informasi bisnis yang diberikan. Jika tidak mengetahui jawabannya, sampaikan dengan jujur dan arahkan ke admin. Jangan mengarang harga, stok, atau janji.";
export const aiPluginInput = z.object({
  provider: z.enum(aiProviders), enabled: z.boolean(),
  apiKey: z.string().trim().max(1024).refine(v => !/[\r\n]/.test(v)).optional(),
  removeKey: z.boolean().optional(),
  model: z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/),
  systemPrompt: z.string().trim().min(1).max(10000),
  maxOutputTokens: z.number().int().min(128).max(4096),
  requestsPerMinute: z.number().int().min(1).max(60),
  dailyLimit: z.number().int().min(1).max(10000),
});
export const aiRuleInput = z.object({ provider: z.enum(aiProviders), instructions: z.string().trim().max(4000).default("") });
