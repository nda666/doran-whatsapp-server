import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { createLegacySendAttempt, withLegacySendAttempt, canRetryLegacySend, type LegacySendAttempt } from "../messaging/transportSafety";
import { readFileSync } from "fs";
import { CountryCode } from "libphonenumber-js";
import { normalizePhoneRecipient } from "../../utils/normalizePhoneRecipient";

import { delay, WAMessage } from "@whiskeysockets/baileys";

import makeWASocket from "./makeWASocket";
import toBase64 from "./toBase64";

const sendAttachmentMessageIo = async ({
  userId,
  phoneId,
  tos,
  phoneCountry,
  caption,
  image,
}: {
  tos: string[];
  userId: string;
  phoneId: string;
  phoneCountry: string;
  caption: string;
  image?: any;
}) => {
  let retry = 0;
  let send: any = [];
  for (const _to of tos) {
    const sendResult = await sendAttachmentMessage(
      _to,
      phoneCountry,
      caption,
      retry,
      phoneId,
      userId,
      image
      // id_group
    );

    sendResult && send.push(sendResult);
  }
  return send;
};

const sendAttachmentMessage = async (
  _to: string,
  phoneCountry: string,
  caption: string,
  retry: number,
  phoneId: string,
  userId: string,
  image: any,
  attempt: LegacySendAttempt = createLegacySendAttempt()
): Promise<WAMessage | undefined> => {
  const createdWaSock = await makeWASocket(userId, phoneId);
  const sendAttempt = (jid: string, content: AnyMessageContent) => withLegacySendAttempt(attempt,
    () => createdWaSock.sendMessage(jid, content, { messageId: attempt.messageId }));
  try {
    const recipient = normalizePhoneRecipient(_to, (phoneCountry || "ID") as CountryCode);

    if (image !== undefined && typeof image == "string") {
      return await sendAttempt(
        `${recipient}@s.whatsapp.net`,
        {
          image: {
            url: image,
          },
          caption: caption,
        }
      );
    } else if (image !== undefined && typeof image == "object") {
      const reqData = {};
      const _file = image;
      console.log(_file);
      if (_file.mimetype?.startsWith("image/")) {
        const image64 = await toBase64(_file.filepath);
        return await sendAttempt(
          `${recipient}@s.whatsapp.net`,
          {
            image: Buffer.from(image64),
            caption: caption,
          }
        );
      }

      if (_file.mimetype?.startsWith("video/")) {
        return await sendAttempt(
          `${recipient}@s.whatsapp.net`,
          {
            video: readFileSync(_file.filepath),
            caption: caption,
          }
        );
      }

      if (_file.mimetype?.startsWith("audio/")) {
        return await sendAttempt(
          `${recipient}@s.whatsapp.net`,
          {
            audio: readFileSync(_file.filepath),
            mimetype: _file.mimetype,
            caption: caption,
          }
        );
      }

      if (_file.mimetype == "application/pdf") {
        return await sendAttempt(
          `${recipient}@s.whatsapp.net`,
          {
            document: readFileSync(_file.filepath),
            mimetype: _file.mimetype,
            caption: caption,
          }
        );
      }

      const image64 = await toBase64(image.filepath);
      return await sendAttempt(
        `${recipient}@s.whatsapp.net`,
        {
          image: Buffer.from(image64),
          caption: caption,
        }
      );
    }
  } catch (e: any) {
    if (canRetryLegacySend(attempt, e, retry, 5)) {
      retry++;
      await delay(2000);
      return await sendAttachmentMessage(
        _to,
        phoneCountry,
        caption,
        retry,
        phoneId,
        userId,
        image,
        attempt
      );
    } else {
      throw e;
    }
  }
};

export default sendAttachmentMessageIo;
