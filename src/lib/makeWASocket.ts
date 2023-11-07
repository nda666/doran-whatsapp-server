import "pino-pretty";
import "pino-roll";
import _makeWASocket, {
  WASocket,
  useMultiFileAuthState,
  delay,
} from "@whiskeysockets/baileys";
import { pino } from "pino";
import { prisma } from "./prisma";
import { WaSockQrTimeout } from "../server/constant";
import connectionUpdate from "../server/events/connectionUpdate";
import { AutoReply, InboxMessage, Phone } from "@prisma/client";
import axios, { AxiosError } from "axios";
import { error } from "console";

const session = new Map();

const waSocketLogOption = pino({
  enabled: false,
  level: "error",

  transport: {
    targets: [
      // {
      //   level: "debug",
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
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(
    `./whatsapp-auth/${userId}-${phoneId}`
  );
  let _waSocket = {} as WASocket;
  if (session.get(phoneId)) {
    _waSocket = session.get(phoneId);
    console.info("GET from session: " + phoneId);
  } else {
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

    _waSocket.ev.on("connection.update", async (update) => {
      connectionUpdate(_waSocket, userId, phoneId, update);
    });

    onCreated && onCreated(_waSocket);

    // for reply
    _waSocket.ev.on("messages.upsert",({messages}) => {
      function isLapWord(word:string) {
        const formatWordClient = word!.match(/\w+\,/);

        if (formatWordClient !== null && Object.keys(formatWordClient)) {
          const extractWord = formatWordClient[0];
          const isWord = "LAP,";
          if (extractWord.toLowerCase() === isWord.toLowerCase()) {
            return true;
          }
        }
      }
      let messageIn = messages[0].message?.conversation;
      let quotedMessage: any = null;
      if (messages[0].message?.extendedTextMessage?.contextInfo) {
        quotedMessage =
          messages[0].message?.extendedTextMessage?.contextInfo?.quotedMessage;
      }
      // console.log(quotedMessage);
      // console.log(messageIn);
      if (messageIn) {
        const phoneReplies = prisma.autoReply.findMany({
          where: {
            // phoneId: phoneId,
            // keyword: messageIn.toLowerCase()
            AND: [
              { phoneId: phoneId },
              {
                OR: [
                  { keyword: messageIn.toLowerCase() },
                  { keyword: { contains: messageIn.toLowerCase() } }
                ]
              }
            ]
          }
        });

        const hasLapWord = isLapWord(String(messageIn));
        if(hasLapWord) {
          const getPhone = async () => {
            const findPhone = await prisma.phone.findUnique({
              where: {
                id: phoneId
              }
            });
            return findPhone;
          };

          const insertInbox = async (data:InboxMessage) => {
            if(Object.keys(data)) {
              console.log(data);
              const response = await prisma.inboxMessage.create({
                data: {
                  message: data.message,
                  recipient: data.recipient,
                  sender: data.sender
                }
              });
              if(response) {
                return response;
              }
            }
          }

          const dataInbox : InboxMessage[] = [];
          getPhone().then((phonedata) => {
            if(Object.keys(phonedata as Phone).length !== 0) {
              dataInbox.push({
                message: messageIn,
                recipient: messages[0].key.remoteJid!.split("@")[0]!, 
                sender: phonedata!.number!,
                // isRead: true,
              } as InboxMessage);

              // delay(2000);
              insertInbox(dataInbox[0]);
              _waSocket.sendMessage(messages[0].key.remoteJid!, {text: 'Balasan laporan dalam proses pengiriman'});
              return;
            }
          })
        }

        phoneReplies
          .then((result: AutoReply[]) => {
            if (result.length) {
              result.forEach((item) => {
                if (item.type == "text") {
                  const replyText = JSON.parse(JSON.stringify(item.reply));
                  if(result.length) {
                    result.forEach((item) => {
                      const replyText = JSON.parse(JSON.stringify(item.reply));
                      if(item.type == 'text') {
                        if(item.type_keyword.toLowerCase() == 'equal') {
                          if(messageIn!.toLowerCase() == item.keyword.toLowerCase()) {
                            // console.log(replyText);
                            _waSocket.sendMessage(messages[0].key.remoteJid!, replyText);
                          }
                        } else if(item.type_keyword.toLowerCase() == 'contain') {
                          // console.log(messageIn);
                          if(item.keyword.toLowerCase().includes(messageIn!.toLowerCase())) {
                            // console.log(replyText);
                            _waSocket.sendMessage(messages[0].key.remoteJid!, replyText);
                          }
                        }

                      }
                      if(item.type == 'image') {
                        replyText.image.url = process.env.APP_URL + '/' + replyText.image.url;
                        if(item.type_keyword.toLowerCase() == 'equal') {
                          if(messageIn!.toLowerCase() == item.keyword.toLowerCase()) {
                            // console.log(replyText);
                            _waSocket.sendMessage(messages[0].key.remoteJid!, replyText);
                          }
                        } else if(item.type_keyword.toLowerCase() == 'contain') {
                          // console.log(item.keyword.toLowerCase().includes(messageIn!.toLowerCase()));
                          if(item.keyword.toLowerCase().includes(messageIn!.toLowerCase())) {
                            // console.log('ok');
                            _waSocket.sendMessage(messages[0].key.remoteJid!, replyText);
                          }
                        }
                      }
                    })
                  } else {
                    throw 'data empty'
                  }
                }
              })
            }
          })
        .catch((err) => err);
      }

      // console.log(quotedMessage);
      if (quotedMessage) {
        type quoteMessage = {
          conversation: any;
        };

        let clientMessage = messages[0].message!.extendedTextMessage!.text;
        const hasLapWord = isLapWord(String(quotedMessage.conversation));

        // console.log(hasLapWord);
        if(hasLapWord) {
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
              result.error = error;
              return result.error;
            }
          }
  
          const participantNum = String(messages[0].message!.extendedTextMessage!.contextInfo!.participant!.split('@')[0]);
          const senderNum = messages[0].key.remoteJid?.split('@')[0];
          insertQuote(quotedMessage.conversation,String(clientMessage),String(senderNum),String(participantNum));
          _waSocket.sendMessage(messages[0].key.remoteJid!, {text: 'Balasan laporan dalam proses pengiriman'});
          return;
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

export default makeWASocket;
