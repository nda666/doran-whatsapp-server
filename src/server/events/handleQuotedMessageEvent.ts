import {
  CekValueParam,
  getImageFromWaMessage,
  messageKeywordTypeChecker,
  runFetchGetResponse,
} from "@/server/utils";
import {
  insertQuotesToInboxMessage,
  InserttWebhookToInboxMessageProps,
  insertWebhookToInboxMessage,
} from "@/services/inboxMessage";
import { Phone } from "@prisma/client";
import { proto, WASocket } from "@whiskeysockets/baileys";

import { prisma } from "../../lib/prisma";

export type HandleQuotedMessageEventProps = {
  messageType: string;
  phone: Phone;
  quotedMessage: proto.IMessage;
  waSocket: WASocket;
  messages: proto.IWebMessageInfo[];
};
export const handleQuotedMessageEvent = async (
  props: HandleQuotedMessageEventProps
) => {
  const { waSocket, messages, quotedMessage, phone, messageType } = props;

  const phoneReplies = async () =>
    await prisma.autoReply.findMany({
      where: {
        phoneId: phone.id,
      },
    });

  let clientMessage = "";
  let participantNum = "";

  if (messages[0].message!.extendedTextMessage?.text) {
    clientMessage = messages[0].message!.extendedTextMessage!.text;
    String(
      messages[0].message!.extendedTextMessage!.contextInfo!.participant!.split(
        "@"
      )[0]
    );
  } else if (messages[0].message!.imageMessage?.caption) {
    clientMessage = messages[0].message!.imageMessage?.caption;
    participantNum = String(
      messages[0].message!.imageMessage!.contextInfo!.participant!.split("@")[0]
    );
  }

  const finalFilePath = await getImageFromWaMessage(messages, waSocket);

  const replies_list = await phoneReplies();
  let conversation_quote = quotedMessage.conversation;

  const senderNum = messages[0].key.remoteJid?.split("@")[0];

  replies_list.forEach(async (val) => {
    if (
      !conversation_quote ||
      !messageKeywordTypeChecker(
        conversation_quote,
        val.keyword,
        val.type_keyword
      )
    ) {
      return;
    }

    const replyText = JSON.parse(JSON.stringify(val.reply));

    if (val.type == "text") {
      val.is_save_inbox &&
        (await insertQuotesToInboxMessage({
          message: clientMessage,
          quote: conversation_quote || "",
          sender: senderNum || "",
          recipient: participantNum,
        }));
      await waSocket.sendMessage(messages[0].key.remoteJid!, replyText);
    }

    if (val.type == "webhook") {
      // if (!checkIdGroupFormat(messages[0].key.remoteJid!)) {
      //     return;
      // }

      if (val.is_save_inbox) {
        let data = {
          message: clientMessage,
          quote: conversation_quote,
          recipient: participantNum,
          sender: senderNum,
          image_in: finalFilePath,
        } as InserttWebhookToInboxMessageProps;

        if (val.url) {
          let objParamProp: string[] = [];
          let objParamValue: string[] = [];
          let params: { [key: string]: string | null } = {};

          data.url = val.url;
          data.type_request = val.type_request;

          let is_isi_params = [
            val.isi_param_1,
            val.isi_param_2,
            val.isi_param_3,
          ];

          // console.log(is_isi_params);
          data.param_1 = val.param_1 ? val.param_1 : null;
          data.isi_param_1 = val.isi_param_1 ? val.isi_param_1 : null;
          if (val.param_1 && val.isi_param_1) {
            objParamProp.push(val.param_1);
            let valueObj = CekValueParam(val, "isi_param_1", data);
            objParamValue.push(valueObj);
            if (val.custom_value_1) {
              data.custom_value_1 = val.custom_value_1;
            }
          }

          data.param_2 = val.param_2 ? val.param_2 : null;
          data.isi_param_2 = val.isi_param_2 ? val.isi_param_2 : null;
          if (val.param_2 && val.isi_param_2) {
            objParamProp.push(val.param_2);
            let valueObj = CekValueParam(val, "isi_param_2", data);
            if (val.custom_value_2) {
              data.custom_value_2 = valueObj;
            }
            objParamValue.push(valueObj);
          }

          data.param_3 = val.param_3 ? val.param_3 : null;
          data.isi_param_3 = val.isi_param_3 ? val.isi_param_3 : null;
          if (val.param_3 && val.isi_param_3) {
            objParamProp.push(val.param_3);
            let valueObj = CekValueParam(val, "isi_param_3", data);
            if (val.custom_value_3) {
              data.custom_value_3 = valueObj;
            }
            objParamValue.push(valueObj);
          }

          if (objParamProp.length && objParamValue.length) {
            objParamProp.forEach((val, key) => {
              let propName = String(val!);
              let propValue = objParamValue[key];
              params[propName] = propValue;
            });
          }

          params["phone"] = senderNum ?? null;
          params["recipient"] = participantNum ?? "";
          params["image"] = `${process.env.APP_URL}/api/image/${finalFilePath}`;
          params["quote"] = conversation_quote;
          params["message"] = clientMessage;
          params["detail"] = JSON.stringify(messages[0]);

          const method_type =
            val.type_request?.toUpperCase() == "GET" ? "GET" : "POST";
          data.type_request = method_type;
          let options = {};
          if (method_type == "POST") {
            options = {
              method: "POST",
              body: params,
            };
          } else if (method_type == "GET") {
            options = {
              method: "GET",
              params: params,
            };
          }

          const webhookRes = await runFetchGetResponse({
            url: val.url,
            ...options,
          });
          data.respons = webhookRes.result
            ? JSON.stringify(webhookRes.result)
            : webhookRes.error;
        }
        insertWebhookToInboxMessage(data);
      }
    }
  });
};
