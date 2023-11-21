import { CountryCode, parsePhoneNumber } from "libphonenumber-js";
import makeWASocket, { deleteSession } from "./makeWASocket";
import {
  AnyMessageContent,
  WASocket,
  delay,
  proto,
} from "@whiskeysockets/baileys";

const sendMessageFromIo = async ({
  phoneId,
  userId,
  tos,
  phoneCountry,
  message,
}: {
  phoneId: string;
  userId: string;
  tos: string[];
  phoneCountry: string;
  message: string;
}) => {
  let retry = 0;

  let send: any = [];
  for (const _to of tos) {
    const sendResult = await sendMessage(
      _to,
      phoneCountry,
      message,
      retry,
      phoneId,
      userId
    );
    send.push(sendResult);
  }
  console.log(send);
};

const sendMessage = async (
  _to: string,
  phoneCountry: string,
  message: string,
  retry: number,
  phoneId: string,
  userId: string
): Promise<proto.WebMessageInfo | undefined> => {
  const createdWaSock = await makeWASocket(userId, phoneId);
  try {
    const parsedTo = parsePhoneNumber(
      _to,
      (phoneCountry || "ID") as CountryCode
    );
    return await createdWaSock.sendMessage(
      `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
      {
        text: message!,
      }
    );
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
