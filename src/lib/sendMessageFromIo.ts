// import makeWASocket, { deleteSession } from "@/lib/makeWASocket";
import makeWASocket, { deleteSession } from "./makeWASocket";
import { CountryCode, parsePhoneNumber } from "libphonenumber-js";
import {
  AnyMessageContent,
  WASocket,
  delay,
  proto,
} from "@whiskeysockets/baileys";
import toBase64 from "./toBase64";

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
}): Promise<proto.WebMessageInfo[]> => {
  let retry = 0;

  let send: proto.WebMessageInfo[] = [];
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
    sendResult && send.push(sendResult);
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
): Promise<proto.WebMessageInfo | undefined> => {
  const createdWaSock = await makeWASocket(userId, phoneId);
  try {
    const parsedTo = parsePhoneNumber(
      _to,
      (phoneCountry || "ID") as CountryCode
    );
    if (!image) {
      return await createdWaSock.sendMessage(
        `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
        {
          text: message!,
        }
      );
    } else {
      const imgExt = ["jpg", "jpeg", "png", "gif"];
      if ((image !== undefined) && (typeof(image) == 'object')) {

        const image64 = await toBase64(image.filepath);

        return await createdWaSock.sendMessage(
          `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
          {
            image: Buffer.from(image64),
            caption: message,
          }
        );
      } else if ((image !== undefined) && (typeof(image) == 'string')) {
        // return res.status(200).json('ok');
        return await createdWaSock.sendMessage(
          `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
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
    if (e?.output?.statusCode === 428 && retry < 5) {
      deleteSession(phoneId);
      retry++;
      await delay(2000);
      return await sendMessage(
        _to,
        phoneCountry,
        message,
        retry,
        phoneId,
        userId
      );
    } else {
      throw e;
    }
  }
};

export default sendMessageFromIo;
