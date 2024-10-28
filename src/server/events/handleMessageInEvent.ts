import { Phone } from "@prisma/client";
import { proto, WASocket } from "@whiskeysockets/baileys";

import {
  CekValueParam,
  checkIdGroupFormat,
  getImageFromWaMessage,
  messageKeywordTypeChecker,
  runFetchGetResponse,
} from "../../server/utils";
import { getAutoReplyByPhoneId } from "../../services/autoReply";
import { saveToGrup } from "../../services/group";
import {
  insertToInboxMessage,
  InserttWebhookToInboxMessageProps,
  insertWebhookToInboxMessage,
} from "../../services/inboxMessage";
import toBase64 from "../libs/toBase64";

export const handleMessageInEvent = async (
  phone: Phone,
  _waSocket: WASocket,
  messageIn: string,
  messages: proto.IWebMessageInfo[]
) => {
  if (phone?.is_save_group) {
    await saveToGrup(messages, _waSocket);
  }

  const phoneReplies = await getAutoReplyByPhoneId(phone.id);
  // insert inbox moved to top;
  // let phones = await phone();
  let phone_number = phone && phone.number;
  phoneReplies.forEach(async (item) => {
    const replyText = JSON.parse(JSON.stringify(item.reply));

    if (
      !messageKeywordTypeChecker(messageIn, item.keyword, item.type_keyword)
    ) {
      return;
    }

    if (item.type == "text") {
      if (item.is_save_inbox) {
        insertToInboxMessage({
          message: messageIn!,
          recipient: messages[0].key.remoteJid!.split("@")[0]!,
          sender: phone_number!,
        });
      }
      await _waSocket.sendMessage(messages[0].key.remoteJid!, replyText);
    }

    if (item.type == "image") {
      const image64 = await toBase64("./storage/" + replyText.image.url);
      // replyText.image.url = process.env.APP_URL + '/' + replyText.image.url;
      replyText.image = Buffer.from(image64);
      messageKeywordTypeChecker(
        messageIn ?? "",
        item.keyword,
        item.type_keyword
      ) && _waSocket.sendMessage(messages[0].key.remoteJid!, replyText);
    }

    if (
      item.type == "webhook" &&
      !checkIdGroupFormat(messages[0].key.remoteJid!)
    ) {
      const finalFilePath = await getImageFromWaMessage(messages, _waSocket);

      type dataInboxType = {
        message: string;
        recipient: string;
        sender: string;
        url?: string;
        type_request?: string | null;
        param_1?: string | null;
        isi_param_1?: string | null;
        param_2?: string | null;
        isi_param_2?: string | null;
        param_3?: string | null;
        isi_param_3?: string | null;
        custom_value_1?: string | null;
        custom_value_2?: string | null;
        custom_value_3?: string | null;
        response?: string | null; // untuk response dari api
      };

      const itHasKeyword = messageKeywordTypeChecker(
        messageIn,
        item.keyword,
        item.type_keyword
      );
      if (!itHasKeyword) {
        return;
      }

      if (!item.is_save_inbox) {
        return;
      }

      let data = {
        image_in: finalFilePath,
        message: messageIn!,
        recipient: messages[0].key.remoteJid!.split("@")[0]!,
        sender: phone_number,
        auto_reply_id: item.id.toString(),
      } as InserttWebhookToInboxMessageProps;

      if (!item.url) {
        return;
      }

      let objParamProp: string[] = [];
      let objParamValue: string[] = [];
      let params: { [key: string]: string | null } = {};

      data.url = item.url;
      data.type_request = item.type_request;

      data.param_1 = item.param_1 ? item.param_1 : null;
      data.isi_param_1 = item.isi_param_1 ? item.isi_param_1 : null;
      if (item.param_1 && item.isi_param_1) {
        objParamProp.push(item.param_1);
        let valueObj = CekValueParam(
          item,
          "isi_param_1",
          data as dataInboxType
        );
        objParamValue.push(valueObj);
        if (item.custom_value_1) {
          data.custom_value_1 = item.custom_value_1;
        }
      }

      data.param_2 = item.param_2 ? item.param_2 : null;
      data.isi_param_2 = item.isi_param_2 ? item.isi_param_2 : null;
      if (item.param_2 && item.isi_param_2) {
        objParamProp.push(item.param_2);
        let valueObj = CekValueParam(
          item,
          "isi_param_2",
          data as dataInboxType
        );
        if (item.custom_value_2) {
          data.custom_value_2 = valueObj;
        }
        objParamValue.push(valueObj);
      }

      data.param_3 = item.param_3 ? item.param_3 : null;
      data.isi_param_3 = item.isi_param_3 ? item.isi_param_3 : null;
      if (item.param_3 && item.isi_param_3) {
        objParamProp.push(item.param_3);
        let valueObj = CekValueParam(
          item,
          "isi_param_3",
          data as dataInboxType
        );
        if (item.custom_value_3) {
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

      params["phone"] = data.sender ?? null;
      params["recipient"] = data.recipient ?? "";
      params["image"] = `${process.env.APP_URL}/api/image/${finalFilePath}`;
      params["message"] = data.message;

      // params["detail"] = JSON.stringify(messages[0]);

      const method_type =
        item.type_request?.toUpperCase() == "GET" ? "GET" : "POST";
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

      const { result, error } = await runFetchGetResponse({
        url: item.url,
        ...options,
      });

      data.respons = error ? error : JSON.stringify(result);
      await insertWebhookToInboxMessage(data);
    }
  });
};
