import { CountryCode } from "libphonenumber-js";
import { normalizePhoneRecipient } from "../../utils/normalizePhoneRecipient";

import { delay, WAMessage } from "@whiskeysockets/baileys";

// import makeWASocket, { deleteSession } from "@/lib/makeWASocket";
import makeWASocket from "./makeWASocket";

const sendMessageFromIo = async ({
  phoneId,
  userId,
  tos,
  phoneCountry,
  message,
  image,
}: {
  phoneId: string;
  userId: string;
  tos: string[];
  phoneCountry: string;
  message: string;
  image?: any;
}): Promise<WAMessage[]> => {
  let retry = 0;

  let send: WAMessage[] = [];
  for (const _to of tos) {
    const sendResult = await sendMessage(
      _to,
      phoneCountry,
      message,
      retry,
      phoneId,
      userId,
      image
    );
    if (!sendResult?.key?.id) throw new Error("WhatsApp tidak mengembalikan ID pesan.");
    send.push(sendResult);
  }
  return send;
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

const sendMessage = async (
  _to: string,
  phoneCountry: string,
  message: string,
  retry: number,
  phoneId: string,
  userId: string,
  image?: any
): Promise<WAMessage | undefined> => {
  const createdWaSock = await makeWASocket(userId, phoneId);
  try {
    const recipient = normalizePhoneRecipient(_to, (phoneCountry || "ID") as CountryCode);
    if (!image) {
      const res = await createdWaSock.sendMessage(
        `${recipient}@s.whatsapp.net`,
        {
          text: message!,
        }
      );
      return res;
    } else {
      const imgExt = ["jpg", "jpeg", "png", "gif"];
      if (isBase64(image)) {
        // return res.status(200).json('ok file');
        // let fileName = new Date().getTime() + '_' + phone.id + '.'+'png';
        const binaryString = Buffer.from(image);
        // const blob = new Blob([binaryString], {type: 'image/png' || 'image/png'});

        // const file = new File([blob], fileName || 'image', {type: 'image/png' || 'image/png'});
        // return res.status(200).json({'binary': binaryString});
        return await createdWaSock.sendMessage(
          `${recipient}@s.whatsapp.net`,
          {
            image: binaryString,
            caption: message,
          }
        );
      } else if (image !== null && !isBase64(image)) {
        // return res.status(200).json('ok');
        return await createdWaSock.sendMessage(
          `${recipient}@s.whatsapp.net`,
          {
            image: {
              url: image,
            },
            caption: message,
          }
        );
      }
    }
  } catch (e: any) {
    if (e?.output?.statusCode === 428) {
      retry++;
      if (retry < 5) {
        await delay(2000);
        return await sendMessage(
          _to,
          phoneCountry,
          message,
          retry,
          phoneId,
          userId,
          image
        );
      } else {
        // rmSync(`./whatsapp-auth/${userId}-${phoneId}`, {
        //   recursive: true,
        //   force: true,
        // });
        throw e;
      }
    } else {
      throw e;
    }
  }
};

export default sendMessageFromIo;
