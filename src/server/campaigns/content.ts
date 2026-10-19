import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { z } from "zod";
const short = z.string().trim().min(1).max(200);
export const publicPayload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("poll"), name: short, values: z.array(short).min(2).max(12), selectableCount: z.number().int().min(1).max(12).default(1) }),
  z.object({ kind: z.literal("location"), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), name: short.optional() }),
  z.object({ kind: z.literal("vcard"), name: short, number: z.string().regex(/^\d{8,15}$/) }),
  z.object({ kind: z.literal("button"), text: z.string().min(1).max(10000), buttons: z.array(z.object({ id: short, text: short })).min(1).max(3) }),
  z.object({ kind: z.literal("list"), text: z.string().min(1).max(10000), title: short, buttonText: short, rows: z.array(z.object({ id: short, title: short, description: z.string().max(200).optional() })).min(1).max(10) }),
  z.object({ kind: z.literal("sticker") }),
]);
export function payloadContent(input: unknown): AnyMessageContent {
  const p = publicPayload.parse(input);
  if (p.kind === "poll") {
    if (p.selectableCount > p.values.length || new Set(p.values).size !== p.values.length) throw new Error("INVALID_POLL");
    return { poll: { name: p.name, values: p.values, selectableCount: p.selectableCount } };
  }
  if (p.kind === "location") return { location: { degreesLatitude: p.latitude, degreesLongitude: p.longitude, name: p.name } };
  if (p.kind === "vcard") {
    const name = p.name.replace(/[\r\n;:,\\]/g, " ");
    return { contacts: { displayName: name, contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;type=CELL;type=VOICE;waid=${p.number}:+${p.number}\nEND:VCARD` }] } };
  }
  // The current Baileys API accepts legacy interactive protobufs through forward.
  // WhatsApp client rendering varies; transport acknowledgment is not delivery.
  if (p.kind === "button") return { forward: { key: { fromMe: true }, message: { buttonsMessage: { contentText: p.text, headerType: 1,
    buttons: p.buttons.map(b => ({ buttonId: b.id, buttonText: { displayText: b.text }, type: 1 })) } } }, force: true };
  if (p.kind === "list") return { forward: { key: { fromMe: true }, message: { listMessage: { description: p.text, title: p.title, buttonText: p.buttonText, listType: 1,
    sections: [{ title: p.title, rows: p.rows.map(r => ({ rowId: r.id, title: r.title, description: r.description })) }] } } }, force: true };
  throw new Error("STICKER_REQUIRES_MEDIA");
}
