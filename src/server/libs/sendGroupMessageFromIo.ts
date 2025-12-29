import { delay, WAMessage } from "@whiskeysockets/baileys";

// import makeWASocket, { deleteSession } from "@/lib/makeWASocket";
import makeWASocket, { deleteSession } from "./makeWASocket";

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
  id_group?: string
): Promise<WAMessage | undefined> => {
  const createdWaSock = await makeWASocket(userId, phoneId);
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
      return await createdWaSock.sendMessage(`${id_group}`, {
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
        return await createdWaSock.sendMessage(`${id_group}`, {
          image: binaryString,
        });
      } else if (image !== null && !isBase64(image)) {
        // return res.status(200).json('ok');
        return await createdWaSock.sendMessage(`${id_group}`, {
          image: {
            url: image,
          },
          caption: message,
        });
      }
    }
  } catch (e: any) {
    if (e?.output?.statusCode === 428 && retry < 5) {
      deleteSession(phoneId);
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
        id_group
      );
    } else {
      throw e;
    }
  }
};

export default sendGroupMessageFromIo;
