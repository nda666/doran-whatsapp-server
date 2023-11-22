// import makeWASocket, { deleteSession } from "@/lib/makeWASocket";
import makeWASocket, { deleteSession } from "./makeWASocket";
import { CountryCode, parsePhoneNumber } from "libphonenumber-js";
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
    image
} : {
    phoneId: string;
    userId: string;
    tos: string[];
    phoneCountry: string
    message: string;
    image?: any;
}) => {
    let retry = 0;

    let send: any = [];
    for(const _to of tos) {
        const sendResult = await sendMessage(
            _to,
            phoneCountry,
            message,
            retry,
            phoneId,
            userId,
            image
        );
    }
}

const isBase64 = (str: string) => {
    try {
      const decodeString = atob(str);
  
      const encodedString = btoa(decodeString);
  
      return encodedString === str;
    }
    catch (e) {
      return false
    }
}

const sendMessage = async (
    _to: string,
    phoneCountry: string,
    message: string,
    retry: number,
    phoneId: string,
    userId: string,
    image?: any
) : Promise<proto.WebMessageInfo | undefined> => {
    const createdWaSock = await makeWASocket(userId, phoneId);
    try {
        const parsedTo = parsePhoneNumber(
        _to,
        (phoneCountry || "ID") as CountryCode
        );
        if(!image) {
            return await createdWaSock.sendMessage(
            `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
            {
                text: message!,
            }
            );
        }
        else
        {
            const imgExt = ['jpg','jpeg','png','gif'];
            if(isBase64(image)) {
                // return res.status(200).json('ok file');
                // let fileName = new Date().getTime() + '_' + phone.id + '.'+'png';
                const binaryString = Buffer.from(image);
                // const blob = new Blob([binaryString], {type: 'image/png' || 'image/png'});

                // const file = new File([blob], fileName || 'image', {type: 'image/png' || 'image/png'});
                // return res.status(200).json({'binary': binaryString});
                return await createdWaSock.sendMessage(
                `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
                {
                    image: binaryString,
                    caption: message
                }
                );
                
            }
            else if(image !== null && !isBase64(image)) {
                // return res.status(200).json('ok');
                return await createdWaSock.sendMessage(
                    `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
                    {
                    image: {
                        url: image
                    },
                    caption: message
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
}

export default sendMessageFromIo;