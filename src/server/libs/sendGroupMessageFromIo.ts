import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { createLegacySendAttempt, withLegacySendAttempt, canRetryLegacySend, type LegacySendAttempt } from "../messaging/transportSafety";
import { delay, WAMessage } from "@whiskeysockets/baileys";

// import makeWASocket from "@/lib/makeWASocket";
import makeWASocket from "./makeWASocket";

const sendGroupMessageFromIo = async ({
  phoneId,
  userId,
  // tos,
  phoneCountry,
  message,
  image,
  id_group,
}: {
  phoneId: string;
  userId: string;
  // tos: string[];
  phoneCountry: string;
  message: string;
  image?: any;
  id_group: string;
}) => {
  let retry = 0;

  let send: any = [];
  return await sendGroupMessage(
    // _to,
    phoneCountry,
    message,
    retry,
    phoneId,
    userId,
    image,
    id_group
  );
  // for(const _to of tos) {
  // }
};

const isBase64 = (str: string) => {
  try {
    const decodeString = atob(str);

    const encodedString = btoa(decodeString);

    return encodedString === str;
  } catch (e) {
    return false;
  }
};

const sendGroupMessage = async (
  // _to: string,
  phoneCountry: string,
  message: string,
  retry: number,
  phoneId: string,
  userId: string,
  image?: any,
  id_group?: string,
  attempt: LegacySendAttempt = createLegacySendAttempt()
): Promise<WAMessage | undefined> => {
  const createdWaSock = await makeWASocket(userId, phoneId);
  const sendAttempt = (jid: string, content: AnyMessageContent) => withLegacySendAttempt(attempt,
    () => createdWaSock.sendMessage(jid, content, { messageId: attempt.messageId }));
  try {
    let is_exist_idgroup = await createdWaSock.groupMetadata(id_group!);
    if (!is_exist_idgroup) {
      throw "ID Group not register";
    }

    // const parsedTo = parsePhoneNumber(
    // _to,
    // (phoneCountry || "ID") as CountryCode
    // );
    if (!image) {
      return await sendAttempt(`${id_group}`, {
        text: message!,
      });
    } else {
      const imgExt = ["jpg", "jpeg", "png", "gif"];
      if (isBase64(image)) {
        // return res.status(200).json('ok file');
        // let fileName = new Date().getTime() + '_' + phone.id + '.'+'png';
        const binaryString = Buffer.from(image);
        // const blob = new Blob([binaryString], {type: 'image/png' || 'image/png'});

        // const file = new File([blob], fileName || 'image', {type: 'image/png' || 'image/png'});
        // return res.status(200).json({'binary': binaryString});
        return await sendAttempt(`${id_group}`, {
          image: binaryString,
        });
      } else if (image !== null && !isBase64(image)) {
        // return res.status(200).json('ok');
        return await sendAttempt(`${id_group}`, {
          image: {
            url: image,
          },
          caption: message,
        });
      }
    }
  } catch (e: any) {
    if (canRetryLegacySend(attempt, e, retry, 5)) {
      retry++;
      await delay(2000);
      return await sendGroupMessage(
        // _to,
        phoneCountry,
        message,
        retry,
        phoneId,
        userId,
        image,
        id_group,
        attempt
      );
    } else {
      throw e;
    }
  }
};

export default sendGroupMessageFromIo;
