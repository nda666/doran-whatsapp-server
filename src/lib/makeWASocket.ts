// import "pino-pretty";
// import "pino-roll";
import _makeWASocket, {
  WASocket,
  useMultiFileAuthState,
  delay,
  GroupMetadata,
  MessageType,
} from "@whiskeysockets/baileys";
import { pino } from "pino";
import { prisma } from "./prisma";
import { WaSockQrTimeout } from "../server/constant";
import connectionUpdate from "../server/events/connectionUpdate";
import { AutoReply, InboxMessage, Phone, Prisma } from "@prisma/client";
import toBase64 from "./toBase64";

const session = new Map();

// {
// transport: {
//   targets: [
//     {
//       level: "debug",
//       target: "pino-pretty",
//       options: {
//         colorize: true,
//       },
//     },
//     {
//       level: "error",
//       target: "pino-roll",
//       options: {
//         file: "./whatsapp-logs/whatsapp.log",
//         frequency: "daily",
//         colorize: true,
//         mkdir: true,
//       },
//     },
//   ],
// },
// }

const makeWASocket = async (
  userId: string,
  phoneId: string,
  onCreated?: (waSock: WASocket) => void
): Promise<WASocket> => {
  console.log("SESSION: " + session);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(
    `./whatsapp-auth/${userId}-${phoneId}`
  );
  let _waSocket = {} as WASocket;
  if (session.get(phoneId)) {
    _waSocket = session.get(phoneId);
    console.info("GET from session: " + _waSocket.user);
  } else {
    const waSocketLogOption = pino({
      enabled: true,
      level: "error",

      transport: {
        targets: [
          // {
          //   level: "error",
          //   target: "pino-pretty",
          //   options: {
          //     colorize: true,
          //   },
          // },
          {
            level: "error",
            target: "pino-roll",
            options: {
              file: "./whatsapp-logs/whatsapp.log",
              frequency: "daily",
              colorize: true,
              mkdir: true,
            },
          },
        ],
      },
    });
    _waSocket = await _makeWASocket({
      printQRInTerminal: false,
      auth: state,
      logger: waSocketLogOption,
      syncFullHistory: true,
      qrTimeout: WaSockQrTimeout,
    });

    console.info("CREATE new session: " + phoneId);
    _waSocket.ev.on("creds.update", (authState) => {
      saveCreds();
    });

    // return _waSocket;
    _waSocket.ev.on("connection.update", async (update) => {
      connectionUpdate(_waSocket, userId, phoneId, update);
    });

    onCreated && onCreated(_waSocket);

    // for reply
    _waSocket.ev.on("messages.upsert", async ({ messages }) => {
      function isLapWord(word: string) {
        const formatWordClient = word!.match(/\w+\,/);

        if (formatWordClient !== null && Object.keys(formatWordClient)) {
          const extractWord = formatWordClient[0];
          const isWord = "LAP,";
          if (extractWord.toLowerCase() === isWord.toLowerCase()) {
            return true;
          }
        }
      }

      // const toBase64 = (file:any) => new Promise((resolve, reject) => {
      //   const reader = new FileReader();
      //   reader.readAsDataURL(file);
      //   reader.onload = () => resolve(reader.result);
      //   reader.onerror = reject;
      // });
      if(!messages[0].key.fromMe) {
        let messageByPhone = messages[0].message!.conversation;
        let messageByWeb = messages[0].message!.extendedTextMessage?.text;
        let messageIn: string | undefined = undefined;
        
        if(messageByPhone !== undefined) {
          messageIn = messageByPhone?.toString();
        }

        if(messageByWeb !== undefined) {
          messageIn = messageByWeb?.toString();
        }
        // let messageIn = messageByPhone = messageByWeb;
        // let messageIn = messageByPhone;
        // let messageIn = messageByWeb;
        const messageType = Object.keys(messages[0].message!)[0];
        let quotedMessage: any = null;
        if (messages[0].message?.extendedTextMessage?.contextInfo) {
          quotedMessage =
            messages[0].message?.extendedTextMessage?.contextInfo?.quotedMessage;
        }

        const getPhone = async () => {
          const findPhone = await prisma.phone.findUnique({
            where: {
              id: phoneId,
            },
          });
          return findPhone;
        };

        // return;
        if (messageIn) {
          // console.log(messageIn);
          const checkIdGroupFormat = /^[0-9]+@g\.us$/;
          if (checkIdGroupFormat.test(messages[0].key.remoteJid!)) {
            const metadata = await _waSocket.groupMetadata(
              messages[0].key!.remoteJid!
            );
            if (metadata) {
              let konv_date = new Date(metadata.creation! * 1000);
              let year = konv_date.toLocaleString("id-ID", { year: "numeric" });
              let month = konv_date.toLocaleString("id-ID", { month: "2-digit" });
              let day = konv_date.toLocaleString("id-ID", { day: "2-digit" });

              let date =
                year +
                "-" +
                month +
                "-" +
                day +
                " " +
                konv_date.getHours() +
                ":" +
                konv_date.getMinutes() +
                ":" +
                konv_date.getSeconds();
              const datetime = new Date(date);

              getPhone().then(async (dataphone) => {
                if (dataphone?.is_save_group) {
                  // try implicit

                  const groups = await prisma.group.count({
                    where: {
                      group_id: metadata.id,
                    },
                    select: {
                      group_id: true,
                    },
                  });

                  if (!Number(groups.group_id)) {
                    const insertGroup = async (metadata: GroupMetadata) => {
                      const participant_list = metadata.participants.map(
                        (participant) => ({
                          whatsapp_id: participant.id,
                          admin: participant.admin,
                        })
                      );
                      try {
                        const savegroup = await prisma.group.create({
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

                        savegroup && "Group saved succesfully";
                      } catch (err) {
                        console.log(err);
                      }
                    };
                    insertGroup(metadata);
                  }
                  // return;
                }
              });
            }
          }

          const phoneReplies = prisma.autoReply.findMany({
            where: {
              phoneId: phoneId,
              // keyword: messageIn.toLowerCase()
              // AND: [
              //   { phoneId: phoneId },
              //   {
              //     OR: [
              //       { keyword: messageIn.toLowerCase() },
              //       { keyword: { contains: messageIn.toLowerCase() } },
              //     ],
              //   },
              // ],
            },
          });

          const hasLapWord = isLapWord(String(messageIn));
          if (hasLapWord) {
            const insertInbox = async (data: InboxMessage) => {
              if (Object.keys(data)) {
                const response = await prisma.inboxMessage.create({
                  data: {
                    message: data.message,
                    recipient: data.recipient,
                    sender: data.sender,
                  },
                });
                if (response) {
                  return response;
                }
              }
            };

            const dataInbox: InboxMessage[] = [];
            getPhone().then((phonedata) => {
              if (Object.keys(phonedata as Phone).length !== 0) {
                dataInbox.push({
                  message: messageIn,
                  recipient: messages[0].key.remoteJid!.split("@")[0]!,
                  sender: phonedata!.number!,
                  // isRead: true,
                } as InboxMessage);

                // delay(2000);
                insertInbox(dataInbox[0]);
                _waSocket.sendMessage(messages[0].key.remoteJid!, {
                  text: "Balasan laporan dalam proses pengiriman",
                });
                return;
              }
            });
          }

          phoneReplies
            .then(async (result: AutoReply[]) => {
              if (result.length) {
                const insertInbox = async (data: InboxMessage) => {
                  if (Object.keys(data)) {
                    const response = await prisma.inboxMessage.create({
                      data: {
                        message: data.message,
                        recipient: data.recipient,
                        sender: data.sender,
                      },
                    });
                    if (response) {
                      return response;
                    }
                  }
                };

                let phones = await getPhone();
                let phone_number = await phones?.number;
                result.forEach(async (item) => {
                  const replyText = JSON.parse(JSON.stringify(item.reply));
                  if (item.type == "text") {
                    if (item.type_keyword.toLowerCase() == "equal") {
                      // console.log(messageIn!.toLowerCase() == item.keyword.toLowerCase());
                      if (
                        messageIn!.toLowerCase() == item.keyword.toLowerCase()
                      ) {
                        if (item.is_save_inbox) {
                          const dataInbox: InboxMessage[] = [
                            {
                              message: messageIn!,
                              recipient:
                                messages[0].key.remoteJid!.split("@")[0]!,
                              sender: phone_number,
                            } as InboxMessage,
                          ];

                          insertInbox(dataInbox[0]);
                        }
                        _waSocket.sendMessage(
                          messages[0].key.remoteJid!,
                          replyText
                        );
                      }
                    } else if (item.type_keyword.toLowerCase() == "contain") {
                      if (
                        messageIn!
                          .toLowerCase()
                          .includes(item.keyword.toLowerCase())
                      ) {
                        if (item.is_save_inbox) {
                          const dataInbox: InboxMessage[] = [
                            {
                              message: messageIn!,
                              recipient:
                                messages[0].key.remoteJid!.split("@")[0]!,
                              sender: phone_number,
                            } as InboxMessage,
                          ];

                          insertInbox(dataInbox[0]);
                        }

                        _waSocket.sendMessage(
                          messages[0].key.remoteJid!,
                          replyText
                        );
                      }
                    }
                  }
                  if (item.type == "image") {
                    const image64 = await toBase64(
                      "./public/" + replyText.image.url
                    );
                    // replyText.image.url = process.env.APP_URL + '/' + replyText.image.url;
                    replyText.image = Buffer.from(image64);
                    if (item.type_keyword.toLowerCase() == "equal") {
                      if (
                        messageIn!.toLowerCase() == item.keyword.toLowerCase()
                      ) {
                        _waSocket.sendMessage(
                          messages[0].key.remoteJid!,
                          replyText
                        );
                      }
                    } else if (item.type_keyword.toLowerCase() == "contain") {
                      if (
                        messageIn!
                          .toLowerCase()
                          .includes(item.keyword.toLowerCase())
                      ) {
                        _waSocket.sendMessage(
                          messages[0].key.remoteJid!,
                          replyText
                        );
                      }
                    }
                  }

                  // Pesan Button
                  // if(item.type == 'button') {
                  //   if(item.type_keyword.toLowerCase() == 'equal') {
                  //     // console.log('ok');
                  //     if(messageIn!.toLowerCase() == item.keyword.toLowerCase()) {
                  //       console.log('ok');
                  //       // send a buttons message!
                  //       const buttons = [
                  //         {buttonId: 'id1', buttonText: {displayText: 'Button 1'}, type: 1},
                  //         {buttonId: 'id2', buttonText: {displayText: 'Button 2'}, type: 1},
                  //         {buttonId: 'id3', buttonText: {displayText: 'Button 3'}, type: 1}
                  //       ]

                  //       const buttonMessage = {
                  //           text: "Hi it's button message",
                  //           footer: 'Hello World',
                  //           buttons: buttons,
                  //           headerType: 1
                  //       }

                  //       _waSocket.sendMessage(messages[0].key.remoteJid!, buttonMessage);
                  //     }
                  //   }
                  // }
                });
              } else {
                throw "data empty";
              }
            })
            .catch((err: any) => err);
        }

        if (quotedMessage) {
          type quoteMessage = {
            conversation: any;
          };

          let clientMessage = messages[0].message!.extendedTextMessage!.text;
          const hasLapWord = isLapWord(String(quotedMessage.conversation));

          if (hasLapWord) {
            const getPhone = async () => {
              const findPhone = await prisma.phone.findUnique({
                where: {
                  id: phoneId,
                },
              });
              return findPhone;
            };

            const insertQuote = async (
              quote: string,
              clientMessage: string,
              sender_num: string,
              recipient_num: string
            ) => {
              const result: {
                success: boolean;
                error: any;
                data: any;
              } = {
                success: false,
                error: undefined,
                data: undefined,
              };

              try {
                const response = await prisma.inboxMessage.create({
                  data: {
                    message: clientMessage,
                    quote: quote,
                    sender: sender_num,
                    recipient: recipient_num,
                  },
                });
                result.success = true;

                if (result.success) {
                  result.data = response;
                  return result.data;
                }
              } catch (e) {
                result.error = e;
                return result.error;
              }
            };

            const participantNum = String(
              messages[0].message!.extendedTextMessage!.contextInfo!.participant!.split(
                "@"
              )[0]
            );
            const senderNum = messages[0].key.remoteJid?.split("@")[0];
            insertQuote(
              quotedMessage.conversation,
              String(clientMessage),
              String(senderNum),
              String(participantNum)
            );
            _waSocket.sendMessage(messages[0].key.remoteJid!, {
              text: "Balasan laporan dalam proses pengiriman",
            });
            return;
          }
        }
      }
      
    });
  }

  if (_waSocket.user) {
    await prisma.phone.update({
      where: {
        id: phoneId,
      },
      data: {
        number: _waSocket.user.id.split(":")[0],
        account_name: _waSocket.user.name,
      },
    });
  }

  session.set(phoneId, _waSocket);
  return _waSocket;
};

export const deleteSession = (phoneId: string) => {
  session.delete(phoneId);
};

export const getAllSession = () => {
  return session;
};

export default makeWASocket;
