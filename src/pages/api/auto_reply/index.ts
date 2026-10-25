import { phoneRecordScope as ownerScope, phoneScope } from "@/lib/access";
import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";

import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { ButtonMessage } from "@/types/components/IAutoReplyFormModal";
import { AuthNextApiRequest } from "@/types/global";
import { publicPayload } from "@/server/campaigns/content";
import { aiRuleInput } from "@/lib/aiPlugins";

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
        ...ownerScope(req.user!),
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
  if (req.body?.reply_when !== undefined && !["Personal", "Group", "All"].includes(req.body.reply_when)) return res.status(400).json({ message: "Cakupan balasan tidak valid." });
  if (req.body?.reply_status !== undefined && !["active", "inactive"].includes(req.body.reply_status)) return res.status(400).json({ message: "Status balasan tidak valid." });
  if (!req.body || !["text", "image", "button", "list", "webhook", "ai"].includes(req.body.type_message) || !["Equal", "Contain", "Any"].includes(req.body.type_keyword)) return res.status(400).json({ message: "Jenis balasan/kata kunci tidak valid." });
  for (const field of ["isi_param_1", "isi_param_2", "isi_param_3"]) {
    const value = req.body[field];
    if (value === undefined || value === null || value === "") {
      req.body[field] = null;
    } else if (!["Sender", "Recipient", "Message", "Quote", "Custom"].includes(value)) {
      return res.status(400).json({ message: "Isi parameter webhook tidak valid." });
    }
  }
  if (req.body.type_keyword === "Any") req.body.keyword = "";
  if (typeof req.body.keyword !== "string" || req.body.keyword.length > 191 || (req.body.type_keyword !== "Any" && !req.body.keyword.trim())) return res.status(400).json({ message: "Kata kunci wajib diisi; maksimal 191 karakter." });
  if (["text", "button"].includes(req.body.type_message) && (typeof req.body.reply !== "string" || !req.body.reply.trim() || req.body.reply.length > 10000)) return res.status(400).json({ message: "Pesan balasan wajib diisi; maksimal 10.000 karakter." });
  if (req.body.type_message === "button") {
    try { publicPayload.parse({ kind: "button", text: req.body.reply, buttons: req.body.buttons.map((b: ButtonMessage) => ({ id: b.name, text: b.value })) }); }
    catch { return res.status(400).json({ message: "Tombol balasan tidak valid; maksimal 3 tombol." }); }
  }
  const delaySeconds = Number(req.body.delaySeconds || 0);
  if (!Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 60) return res.status(400).json({ message: "Delay balasan 0–60 detik." });
  let replyOwnerId = req.user!.id;
  if (req.body.id) {
    const existing = await prisma.autoReply.findFirst({ where: { id: Number(req.body.id), ...ownerScope(req.user!) } });
    if (!existing) return res.status(404).json({ message: "Reply not found" });
    if (req.body.phoneId !== existing.phoneId) return res.status(400).json({ message: "Perangkat pada balasan otomatis tidak dapat dipindahkan." });
    replyOwnerId = existing.userId;
  } else {
    const phone = await prisma.phone.findFirst({ where: { id: String(req.body.phoneId), ...phoneScope(req.user!) } });
    if (!phone) return res.status(404).json({ message: "Device not found" });
    replyOwnerId = phone.userId;
  }
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
  //         userId: replyOwnerId,
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

  if (req.body.type_message === "list") {
    try {
      const content = JSON.parse(req.body.listPayload);
      const checked = publicPayload.parse({ ...content, kind: "list" });
      replies = JSON.stringify(checked);
    } catch { return res.status(400).json({ message: "JSON list menu tidak valid." }); }
  }
  if (req.body.type_message === "ai") {
    const parsed = aiRuleInput.safeParse({ provider: req.body.aiProvider, instructions: req.body.aiInstructions || "" });
    if (!parsed.success) return res.status(400).json({ message: "Provider atau instruksi AI tidak valid." });
    const plugin = await prisma.aiPlugin.findUnique({ where: { userId_provider: { userId: replyOwnerId, provider: parsed.data.provider } } });
    if (!plugin?.enabled || !plugin.encryptedKey) return res.status(400).json({ message: "Aktifkan provider dan simpan API key di menu Plugin AI pada akun pemilik perangkat." });
    replies = JSON.stringify(parsed.data);
  }
  if (req.body.id) {
    auto_replies = await prisma.autoReply.update({
      where: {
        id: req.body.id,
      },
      data: {
        reply_status: req.body.reply_status,
        reply_when: req.body.reply_when,
        delaySeconds,
        is_quoted: !!req.body.is_quoted,
        type_keyword: req.body.type_keyword,
        keyword: req.body.keyword,
        reply: replies && JSON.parse(replies),
        type: req.body.type_message,
        is_save_inbox: req.body.is_save_inbox,
        url: req.body.url,
        type_request: req.body.type_request,
        param_1: req.body.param_1 != undefined ? req.body.param_1 : null,
        isi_param_1:
          req.body.isi_param_1 != undefined ? req.body.isi_param_1 : null,
        param_2: req.body.param_2 != undefined ? req.body.param_2 : null,
        isi_param_2:
          req.body.isi_param_2 != undefined ? req.body.isi_param_2 : null,
        param_3: req.body.param_3 != undefined ? req.body.param_3 : null,
        isi_param_3:
          req.body.isi_param_3 != undefined ? req.body.isi_param_3 : null,
        custom_value_1:
          req.body.custom_input_1 != undefined ? req.body.custom_input_1 : null,
        custom_value_2:
          req.body.custom_input_2 != undefined ? req.body.custom_input_2 : null,
        custom_value_3:
          req.body.custom_input_3 != undefined ? req.body.custom_input_3 : null,
      },
    });
  } else {
    auto_replies = await prisma.autoReply.create({
      data: {
        reply_status: req.body.reply_status ?? "inactive",
        reply_when: req.body.reply_when ?? (req.body.type_message === "ai" ? "Personal" : "All"),
        delaySeconds,
        is_quoted: !!req.body.is_quoted,
        userId: replyOwnerId,
        phoneId: req.body.phoneId,
        type_keyword: req.body.type_keyword,
        type: req.body.type_message,
        keyword: req.body.keyword,
        is_save_inbox: req.body.is_save_inbox,
        reply: replies && JSON.parse(replies),
        url: req.body.url,
        type_request: req.body.type_request,
        param_1: req.body.param_1 != undefined ? req.body.param_1 : null,
        isi_param_1:
          req.body.isi_param_1 != undefined ? req.body.isi_param_1 : null,
        param_2: req.body.param_2 != undefined ? req.body.param_2 : null,
        isi_param_2:
          req.body.isi_param_2 != undefined ? req.body.isi_param_2 : null,
        param_3: req.body.param_3 != undefined ? req.body.param_3 : null,
        isi_param_3:
          req.body.isi_param_3 != undefined ? req.body.isi_param_3 : null,
        custom_value_1:
          req.body.custom_input_1 != undefined ? req.body.custom_input_1 : null,
        custom_value_2:
          req.body.custom_input_2 != undefined ? req.body.custom_input_2 : null,
        custom_value_3:
          req.body.custom_input_3 != undefined ? req.body.custom_input_3 : null,
      },
    });
  }
  return res.status(200).json(auto_replies);
};

export default apiAuthMiddleware(handler);
