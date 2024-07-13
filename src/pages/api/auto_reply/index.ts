import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import Nextauth from "../auth/[...nextauth]";
import { getToken } from "next-auth/jwt";
import { AuthNextApiRequest } from "@/types/global";
import { ButtonMessage } from "@/components/auto-reply/AutoReplyFormModal";
import { AutoReply } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import formidable from "formidable";
import { writeFile } from "fs/promises";
import path from "path";
import fs from "fs/promises";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case "GET":
      return GET(req, res);
    case "POST":
      return POST(req, res);
    default:
      res.status(405).end();
  }
}

const GET = async (req: AuthNextApiRequest, res: NextApiResponse) => {
  const token = await getToken({ req });
  // return res.status(200).json({'text': 'ok'});
  // res.status(200).json({'text': req.query.phone_id,'text1': 'ok'});
  try {
    const autoreply = await prisma.autoReply.findMany({
      where: {
        userId: req?.user?.id!,
        phoneId: String(req?.query.phone_id),
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    res.status(200).json(autoreply);
  } catch (err) {
    res.status(500).end();
  }
};

const POST = async (req: AuthNextApiRequest, res: NextApiResponse) => {
  let auto_replies: any = undefined;
  type image_reply = {
    url: string;
  };
  // const reply_field : {
  //   type?: string | undefined;
  //   content?: string | undefined
  // } = {
  //   type: undefined,
  //   content: undefined
  // };

  interface ImageReply {
    image: image_reply;
    caption?: string;
  }

  type ButtonText = {
    displayText: string;
  };

  interface collectButton {
    buttonId: string;
    buttonText: ButtonText;
    type: number;
  }

  //   if (req.body.phoneId) {
  //     phones = await prisma.autoReply.update({
  //       where: {
  //         id: req.body.phoneId,
  //       },
  //       data: {
  //         name: req.body.name,
  //       },
  //     });
  //   } else {
  //     phones = await prisma.phone.create({
  //       data: {
  //         userId: req.user?.id!,
  //         name: req.body.name,
  //       },
  //     });
  //   }

  let replies: string | undefined = undefined;
  if (req.body.type_message == "image") {
    // return res.status(200).json({"ok": 'test'});
    if (req.body.image_type === "file") {
      let image = req.body.image;
      //
      const objReply = {
        image: {
          url: "uploads/" + image,
        },
        caption: req.body.caption,
      } as ImageReply;

      replies = JSON.stringify(objReply);
    } else if (req.body.image_type === "text") {
      const objReply = {
        image: {
          url: req.body.image,
        },
        caption: req.body.caption,
      } as ImageReply;

      replies = JSON.stringify(objReply);
    }
  } else if (req.body.type_message == "text") {
    const objReply = {
      [req.body.type_message]: req.body.reply,
    };

    replies = JSON.stringify(objReply);
  } else if (req.body.type_message == "button") {
    let buttons = req.body.buttons;

    const buttons_list = buttons.map((item: ButtonMessage) => {
      return {
        buttonId: item.name,
        buttonText: {
          displayText: item.value,
        },
        type: 1,
      };
    });

    const buttonMessage = {
      text: req.body.reply,
      footer: req.body.footer_message,
      buttons: buttons_list,
      headerType: 1,
    };

    replies = JSON.stringify(buttonMessage);
    //
    // return res.status(200).json(buttonMessage);
  }

  if (req.body.id) {
    auto_replies = await prisma.autoReply.update({
      where: {
        id: req.body.id,
      },
      data: {
        type_keyword: req.body.type_keyword,
        keyword: req.body.keyword,
        reply: replies && JSON.parse(replies),
        type: req.body.type_message,
        is_save_inbox: req.body.is_save_inbox,
        url: req.body.url,
        type_request: req.body.type_request,
        param_1: (req.body.param_1 != undefined) ? req.body.param_1 : null,
        isi_param_1: (req.body.isi_param_1 != undefined) ? req.body.isi_param_1 : null,
        param_2: (req.body.param_2 != undefined) ? req.body.param_2 : null,
        isi_param_2: (req.body.isi_param_2 != undefined) ? req.body.isi_param_2 : null,
        param_3: (req.body.param_3 != undefined) ? req.body.param_3 : null,
        isi_param_3: (req.body.isi_param_3 != undefined) ? req.body.isi_param_3 : null,
        custom_value_1: (req.body.custom_input_1 != undefined) ? req.body.custom_input_1 : null,
        custom_value_2: (req.body.custom_input_2 != undefined) ? req.body.custom_input_2 : null,
        custom_value_3: (req.body.custom_input_3 != undefined) ? req.body.custom_input_3 : null
      },
    });
  } else {
    auto_replies = await prisma.autoReply.create({
      data: {
        userId: req.user?.id!,
        phoneId: req.body.phoneId,
        type_keyword: req.body.type_keyword,
        type: req.body.type_message,
        keyword: req.body.keyword,
        is_save_inbox: req.body.is_save_inbox,
        reply: replies && JSON.parse(replies),
        url: req.body.url,
        type_request: req.body.type_request,
        param_1: (req.body.param_1 != undefined) ? req.body.param_1 : null,
        isi_param_1: (req.body.isi_param_1 != undefined) ? req.body.isi_param_1 : null,
        param_2: (req.body.param_2 != undefined) ? req.body.param_2 : null,
        isi_param_2: (req.body.isi_param_2 != undefined) ? req.body.isi_param_2 : null,
        param_3: (req.body.param_3 != undefined) ? req.body.param_3 : null,
        isi_param_3: (req.body.isi_param_3 != undefined) ? req.body.isi_param_3 : null,
        custom_value_1: (req.body.custom_input_1 != undefined) ? req.body.custom_input_1 : null,
        custom_value_2: (req.body.custom_input_2 != undefined) ? req.body.custom_input_2 : null,
        custom_value_3: (req.body.custom_input_3 != undefined) ? req.body.custom_input_3 : null
      },
    });
  }
  return res.status(200).json(auto_replies);
};

export default apiAuthMiddleware(handler);
