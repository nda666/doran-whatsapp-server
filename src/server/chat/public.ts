export function publicChatMessage<T extends { id: string; mediaPath: string | null; requestHash: string | null; sourceMediaId: string | null }>(row: T) {
  const { mediaPath, requestHash, sourceMediaId, ...safe } = row;
  return { ...safe, mediaUrl: mediaPath ? `/api/conversations/media/${row.id}` : null };
}
