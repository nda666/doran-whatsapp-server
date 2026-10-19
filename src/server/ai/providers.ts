import { providerNames, type AiProvider } from "../../lib/aiPlugins";
export class AiError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export type AiGenerationInput = { provider: AiProvider; apiKey: string; model: string; systemPrompt: string; message: string; maxOutputTokens: number };
export function buildAiRequest(input: AiGenerationInput): { url: string; headers: Record<string, string>; body: unknown } {
  const { provider, apiKey, model, systemPrompt, message, maxOutputTokens } = input;
  if (provider === "openai") return { url: "https://api.openai.com/v1/responses", headers: { Authorization: `Bearer ${apiKey}` },
    body: { model, instructions: systemPrompt, input: message, max_output_tokens: maxOutputTokens, store: false } };
  if (provider === "gemini") return { url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, headers: { "x-goog-api-key": apiKey },
    body: { systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: "user", parts: [{ text: message }] }], generationConfig: { maxOutputTokens } } };
  return { url: "https://api.anthropic.com/v1/messages", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: { model, system: systemPrompt, messages: [{ role: "user", content: message }], max_tokens: maxOutputTokens } };
}
export function parseAiResponse(provider: AiProvider, data: any): string {
  let text: string;
  if (provider === "openai") {
    if (data.status !== "completed") throw new AiError("AI_INCOMPLETE", "AI belum menghasilkan jawaban lengkap. Coba naikkan batas token.", 502);
    text = (data.output || []).filter((item: any) => item.type === "message").flatMap((item: any) => item.content || []).filter((item: any) => item.type === "output_text").map((item: any) => item.text).join("\n");
  } else if (provider === "gemini") {
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason !== "STOP") throw new AiError("AI_INCOMPLETE", "AI tidak menghasilkan jawaban lengkap atau pesan dibatasi provider.", 502);
    text = (candidate.content?.parts || []).filter((part: any) => !part.thought && typeof part.text === "string").map((part: any) => part.text).join("\n");
  } else {
    if (!["end_turn", "stop_sequence"].includes(data.stop_reason)) throw new AiError("AI_INCOMPLETE", "AI belum menghasilkan jawaban lengkap. Coba naikkan batas token.", 502);
    text = (data.content || []).filter((item: any) => item.type === "text").map((item: any) => item.text).join("\n");
  }
  if (!text?.trim()) throw new AiError("AI_EMPTY", "Provider tidak mengembalikan jawaban teks.", 502);
  if (text.length > 10000) throw new AiError("AI_OUTPUT_TOO_LONG", "Jawaban AI melebihi 10.000 karakter. Kurangi batas token atau minta jawaban lebih ringkas.", 502);
  return text.trim();
}
export async function generateAiText(input: AiGenerationInput): Promise<string> {
  const request = buildAiRequest(input);
  try {
    const response = await fetch(request.url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { ...request.headers, "Content-Type": "application/json" }, body: JSON.stringify(request.body) });
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw new AiError("AI_AUTH", "API key atau akses model ditolak provider.", 502);
      if (response.status === 429) throw new AiError("AI_PROVIDER_LIMIT", "Kuota atau batas permintaan provider tercapai.", 429);
      if ([503, 529].includes(response.status)) throw new AiError("AI_PROVIDER_BUSY", `${providerNames[input.provider]} sedang sibuk. Tunggu sekitar 1 menit, lalu coba lagi.`, 503);
      if (response.status >= 500) throw new AiError("AI_PROVIDER_UNAVAILABLE", `${providerNames[input.provider]} sedang mengalami gangguan sementara. Coba lagi beberapa saat nanti.`, 503);
      throw new AiError("AI_PROVIDER_ERROR", "Permintaan ditolak provider. Periksa model, saldo, dan pengaturan token.", 502);
    }
    return parseAiResponse(input.provider, await response.json());
  } catch (error) {
    if (error instanceof AiError) throw error;
    // Never surface fetch errors, headers, response bodies, or credentials to logs/clients.
    throw new AiError("AI_CONNECTION", "Provider AI belum dapat dihubungi atau melewati batas waktu 30 detik.", 502);
  }
}
