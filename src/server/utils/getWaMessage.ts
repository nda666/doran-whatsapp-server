import { proto } from '@whiskeysockets/baileys';

export const getWaMesage = (messages: proto.IWebMessageInfo[]) => {
  const m = messages[0]?.message;
  if (!m) {
    return { messageIn: null, quotedMessage: null, messageType: null };
  }
  const messageType = Object.keys(m!)[0];
  // let messageByPhone = m?.conversation !== undefined ? m?.conversation : undefined;
  let messageByPhone = m?.hasOwnProperty("conversation")
    ? m?.conversation
    : undefined;
  let messageByWeb =
    m?.extendedTextMessage?.text !== undefined
      ? m?.extendedTextMessage?.text
      : undefined;

  let messageIn: string | undefined = undefined;

  if (messageByPhone !== undefined) {
    messageIn = messageByPhone?.toString();
  }

  if (messageByWeb !== undefined) {
    messageIn = messageByWeb?.toString();
  }

  if (messageByWeb !== undefined) {
    messageIn = messageByWeb?.toString();
  }

  if (m?.imageMessage?.caption) {
    messageIn = m?.imageMessage?.caption;
  }

  let quotedMessage: proto.IMessage | null | undefined = null;
  if (m?.extendedTextMessage?.contextInfo) {
    quotedMessage = m?.extendedTextMessage?.contextInfo?.quotedMessage;
  } else if (m?.imageMessage?.contextInfo?.quotedMessage) {
    quotedMessage = m?.imageMessage?.contextInfo?.quotedMessage;
  }

  return { messageIn, quotedMessage, messageType };
};
