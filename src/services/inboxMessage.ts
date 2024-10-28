import { InboxMessage, ParamType, TypeRequest } from "@prisma/client";

import { prisma } from "../lib/prisma";

export type InsertToInboxMessageProps = Pick<
  InboxMessage,
  "message" | "sender" | "recipient"
> & {
  image_in?: string | null | undefined;
};
export const insertToInboxMessage = async (data: InsertToInboxMessageProps) => {
  return await prisma.inboxMessage.create({
    data: {
      message: data.message,
      sender: data.sender,
      recipient: data.recipient,
      image_in: data.image_in,
    },
  });
};

export type InserttWebhookToInboxMessageProps = {
  message: string;
  recipient: string;
  sender: string;
  url?: string;
  type_request?: TypeRequest | null;
  param_1?: string | null;
  isi_param_1?: ParamType | null;
  param_2?: string | null;
  isi_param_2?: ParamType | null;
  param_3?: string | null;
  isi_param_3?: ParamType | null;
  custom_value_1?: string | null;
  custom_value_2?: string | null;
  custom_value_3?: string | null;
  respons?: string | null; // untuk response dari api
  image_in?: string | null | undefined;
  // auto_reply_id?: string | null | undefined;
};
export const insertWebhookToInboxMessage = async (
  data: InserttWebhookToInboxMessageProps
) => {
  return await prisma.inboxMessage.create({
    data: data,
  });
};

type ImageReply = {
  image: {
    url: string;
  };
  caption: string;
};
export type InsertQuotesToInboxMessageProps = Pick<
  InboxMessage,
  "sender" | "recipient" | "quote"
> & {
  message: ImageReply | string;
  image_in?: string | null | undefined;
};
export const insertQuotesToInboxMessage = async (
  props: InsertQuotesToInboxMessageProps
) => {
  return await prisma.inboxMessage.create({
    data: {
      message:
        typeof props.message === "string"
          ? props.message
          : JSON.stringify(props.message),
      quote: props.quote,
      sender: props.sender,
      recipient: props.recipient,
      image_in: props.image_in,
    },
  });
};
