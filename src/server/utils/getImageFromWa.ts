import { writeFile } from "fs/promises";
import { join } from "path";

import { downloadMediaMessage, proto, WASocket } from "@whiskeysockets/baileys";

export async function getImageFromWaMessage(
  messages: proto.IWebMessageInfo[],
  sock: WASocket
) {
  let getImageMessage =
    messages[0].message?.extendedTextMessage?.contextInfo?.quotedMessage
      ?.imageMessage;
  if (!getImageMessage) {
    getImageMessage = messages[0].message?.imageMessage;
  }
  if (!getImageMessage) {
    return null;
  }

  const buffer = await downloadMediaMessage(
    messages[0],
    "buffer",
    {},
    {
      logger: sock.logger,
      // pass this so that baileys can request a reupload of media
      // that has been deleted
      reuploadRequest: sock.updateMediaMessage,
    }
  );
  let imgIdUrl: string = "";

  let urlWaImg = getImageMessage?.url;
  const conditionRegexUrl = /\/([^\/]+)\?/;
  const match = urlWaImg?.match(conditionRegexUrl);
  const extractUrl = match ? match[1] : null;
  if (extractUrl) {
    imgIdUrl = extractUrl.substring(12, extractUrl.length).replace(/-/g, "");
  }
  const rootDir = process.cwd();

  const typeFile = getImageMessage!.mimetype?.split("/")[1];
  const filename = "IMG-WA-" + imgIdUrl + "." + typeFile;
  // save to file
  await writeFile(join(rootDir, "storage/downloaded-image", filename), buffer);

  return "downloaded-image/" + filename;
}
