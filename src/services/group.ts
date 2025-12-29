import { WAMessage, WASocket } from "@whiskeysockets/baileys";

import { prisma } from "../lib/prisma";
import { checkIdGroupFormat } from "../server/utils/checkIdGroupFormat";

export const saveToGrup = async (
  messages: WAMessage[],
  _waSocket: WASocket
) => {
  if (!messages[0].key.remoteJid) {
    return;
  }
  if (!checkIdGroupFormat(messages[0].key.remoteJid)) {
    return;
  }
  const metadata = await _waSocket.groupMetadata(messages[0].key.remoteJid!);
  if (metadata) {
    let convertDate = new Date(metadata.creation! * 1000);
    let year = convertDate.toLocaleString("id-ID", { year: "numeric" });
    let month = convertDate.toLocaleString("id-ID", {
      month: "2-digit",
    });
    let day = convertDate.toLocaleString("id-ID", { day: "2-digit" });

    let date =
      year +
      "-" +
      month +
      "-" +
      day +
      " " +
      convertDate.getHours() +
      ":" +
      convertDate.getMinutes() +
      ":" +
      convertDate.getSeconds();
    const datetime = new Date(date);

    const groups = await prisma.group.count({
      where: {
        group_id: metadata.id,
      },
      select: {
        group_id: true,
      },
    });

    if (!Number(groups.group_id)) {
      const participant_list = metadata.participants.map((participant) => ({
        whatsapp_id: participant.id,
        admin: participant.admin,
      }));

      const insertGroup = await prisma.group.create({
        data: {
          group_id: metadata.id,
          subject: metadata.subject,
          owner: String(metadata.subjectOwner),
          creation: datetime,
          size: metadata.size,
          desc: metadata.desc,
          restrict: metadata.restrict,
          announce: metadata.announce,
          participants: {
            create: participant_list,
          },
        },
      });
    }
  }
};
