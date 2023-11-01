import "pino-pretty";
import "pino-roll";
import _makeWASocket, {
  WASocket,
  useMultiFileAuthState,
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
      let messageIn = messages[0].message?.conversation;
      // console.log(messageIn);
      if(messageIn) {
        const phoneReplies = prisma.autoReply.findMany({
          where: {
            phoneId: phoneId,
            // keyword: messages[0].message?.conversation?.toLowerCase()
          }
        });

        phoneReplies.then((result: AutoReply[]) => {

          if(result.length) {
            result.forEach((item) => {
              if(item.type == 'text') {

                const replyText = JSON.parse(JSON.stringify(item.reply));
 
                if(item.type_keyword.toLowerCase() == 'equal') {
                  if(messageIn!.toLowerCase() == item.keyword.toLowerCase()) {
    
                    // const formatWord = replyText!.text.match(/[A-Z]+/);
                    const formatWord = replyText!.text.match(/\bLAP,\b/g);

                    if(formatWord !== null && Object.keys(replyText)) {
                      const extractWord = formatWord[0];
                      if(extractWord === 'LAP,') {

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
                          _waSocket.sendMessage(messages[0].key.remoteJid!, replyText);
                          if(Object.keys(phonedata as Phone).length !== 0) {
                            dataInbox.push({
                              message: replyText.text,
                              recipient: messages[0].key.remoteJid!.split("@")[0]!, 
                              sender: phonedata!.number!,
                              // isRead: true,
                            } as InboxMessage);

                            insertInbox(dataInbox[0]);
                          }
                        })
                      } else {
                        _waSocket.sendMessage(messages[0].key.remoteJid!, replyText);
                      }
                    } else {
                      console.log(replyText);
                      _waSocket.sendMessage(messages[0].key.remoteJid!, replyText);
                    }
                  }
                } else if(item.type_keyword.toLowerCase() == 'contain') {
                  // console.log(messageIn);
                  if(messageIn!.toLowerCase().includes(item.keyword.toLowerCase())) {
                    console.log(replyText);
                    _waSocket.sendMessage(messages[0].key.remoteJid!, replyText);
                  }
                }

              }
            })
          } else {
            throw 'data empty'
          }
        })
        .catch((err) => err);
      }


      // if(Object.keys(replyText).length !== 0) {
      //   console.log(replyText);
      //   _waSocket.sendMessage(messages[0].key.remoteJid!, replyText as any);
      // }
      // if(messages[0].message?.conversation?.toLowerCase() == 'hello') {
      //   _waSocket.sendMessage(messages[0].key.remoteJid!, { text: 'Hello there!' })
      // }
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
