import { createHash } from "node:crypto";

// {a|b|c} picks one option. Needs at least one "|" so personalisation fields like {nama} stay untouched.
const SPIN = /\{([^{}|]*(?:\|[^{}|]*)+)\}/g;

/** Deterministic per seed, so every retry of one queued message sends the same wording. */
export function spin(text: string, seed: string): string {
  if (!text.includes("|")) return text;
  const digest = createHash("sha256").update(seed).digest();
  let index = 0;
  return text.replace(SPIN, (_match, body: string) => {
    const options = body.split("|");
    const pick = digest[index++ % digest.length] % options.length;
    return options[pick];
  });
}
