import type { NextApiRequest } from "next";
import { DispatchAuthError, resolveIntegrationIdentity } from "./dispatchAuth";

// Session/QR/disconnect/check-number also recheck the owner.
export async function resolveControlDevice(req: Pick<NextApiRequest, "headers" | "query">, input: unknown) {
  const identity = await resolveIntegrationIdentity(req, input);
  if (identity.mode !== "device" || !identity.device) throw new DispatchAuthError(401, "Token perangkat diperlukan.", true);
  return identity.device;
}
