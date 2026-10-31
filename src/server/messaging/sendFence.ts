import { AsyncLocalStorage } from "node:async_hooks";
import { SendGuardError } from "./safety";

type SendFence = { deadlineAt: number; isCurrent: () => Promise<boolean> };
const shared = globalThis as typeof globalThis & { doranSendFence?: AsyncLocalStorage<SendFence> };
const fences = shared.doranSendFence || (shared.doranSendFence = new AsyncLocalStorage<SendFence>());

// A timer racing a Promise cannot cancel an underlying send.
export const withSendFence = <T>(fence: SendFence, task: () => Promise<T>) => fences.run(fence, task);
export async function assertSendFence() {
  const fence = fences.getStore();
  if (!fence) return;
  if (Date.now() >= fence.deadlineAt || !await fence.isCurrent() || Date.now() >= fence.deadlineAt) {
    throw new SendGuardError("DEVICE_THROTTLED", new Date(Date.now() + 60_000));
  }
}
