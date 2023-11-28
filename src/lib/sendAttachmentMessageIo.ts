import { CountryCode, parsePhoneNumber } from "libphonenumber-js";
import makeWASocket, {deleteSession} from "./makeWASocket";
import {
    delay,
    proto
} from "@whiskeysockets/baileys";
import toBase64 from "./toBase64";


const sendAttachmentMessageIo = async ({
    userId,
    phoneId,
    tos,
    phoneCountry,
    caption,
    image,
} : {
    tos: string[];
    userId: string;
    phoneId: string;
    phoneCountry: string;
    caption: string;
    image?: any; 
}) => {
    let retry = 0;

    let send: any = [];
    for(const _to of tos) {
        const sendResult = await sendAttachmentMessage(
            _to,
            phoneCountry,
            caption,
            retry,
            phoneId,
            userId,
            image,
            // id_group
        );

        sendResult && send.push(sendResult);
    }
    return send;
}

const sendAttachmentMessage = async (
    _to: string,
    phoneCountry: string,
    caption: string,
    retry: number,
    phoneId: string,
    userId: string,
    image: any
): Promise<proto.WebMessageInfo | undefined> => {
    const createdWaSock = await makeWASocket(userId, phoneId);
    
    try {
        const parsedTo = parsePhoneNumber(
            _to,
            (phoneCountry || "ID") as CountryCode
        );

        if((image !== undefined) && (typeof(image) == 'string')) {
            return await createdWaSock.sendMessage(
                `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
                {
                    image: {
                        url: image
                    },
                    caption: caption 
                }
            )
        } 
        else if((image !== undefined) && (typeof(image) == 'object')) {
            const image64 = await toBase64(image.filepath);
            return await createdWaSock.sendMessage(
                `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
                {
                  image: Buffer.from(image64),
                  caption: caption,
                }
              );
        }
    } catch (e: any) {
        if (e?.output?.statusCode === 428 && retry < 5) {
            deleteSession(phoneId);
            retry++;
            await delay(2000);
            return await sendAttachmentMessage(
            _to,
            phoneCountry,
            caption,
            retry,
            phoneId,
            userId,
            image
            );
        } else {
            throw e;
        }
    }
}

export default sendAttachmentMessageIo