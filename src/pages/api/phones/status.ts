import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import bearerAuthMiddleware from "@/middleware/bearerAuthMiddleware";

/**
 * Normalisasi nomor HP untuk variasi pencarian format Indonesia (08..., 628..., +628..., 8...)
 */
function getPhoneSearchVariants(input: string): string[] {
  const cleaned = input.trim();
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (!digitsOnly) return [cleaned];

  const variants = new Set<string>();
  variants.add(digitsOnly);

  if (digitsOnly.startsWith("0")) {
    // e.g. 085... -> 6285... dan 85...
    const with62 = "62" + digitsOnly.slice(1);
    variants.add(with62);
    variants.add(digitsOnly.slice(1));
  } else if (digitsOnly.startsWith("62")) {
    // e.g. 6285... -> 085... dan 85...
    const with0 = "0" + digitsOnly.slice(2);
    variants.add(with0);
    variants.add(digitsOnly.slice(2));
  } else if (digitsOnly.startsWith("8")) {
    // e.g. 85... -> 6285... dan 085...
    variants.add("62" + digitsOnly);
    variants.add("0" + digitsOnly);
  }

  return Array.from(variants);
}

/**
 * Format payload response phone dengan token / api_key
 */
function formatPhoneResponse(phone: any) {
  if (!phone) return null;
  return {
    id: phone.id,
    name: phone.name,
    number: phone.number,
    account_name: phone.account_name,
    token: phone.token,
    api_key: phone.token,
    status: phone.status,
    isOnline: phone.isOnline,
    active: phone.active,
    is_save_group: phone.is_save_group,
    userId: phone.userId,
    createdAt: phone.createdAt,
    updatedAt: phone.updatedAt,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({
      result: false,
      message: "Method Not Allowed",
    });
  }

  try {
    const {
      id,
      phone_id,
      phoneId,
      phone,
      number,
      phone_number,
      phoneNumber,
      token,
      api_key,
      apiKey,
      is_online,
      isOnline,
      active,
    } = req.query;

    const targetId = (id || phone_id || phoneId)?.toString();
    const targetToken = (token || api_key || apiKey)?.toString();
    const searchPhone = (phone || number || phone_number || phoneNumber)?.toString();
    const onlineParam = typeof is_online !== "undefined" ? is_online : isOnline;

    // 1. Jika mencari berdasarkan ID spesifik
    if (targetId) {
      const phoneData = await prisma.phone.findUnique({
        where: {
          id: targetId,
        },
        select: {
          id: true,
          name: true,
          number: true,
          account_name: true,
          token: true,
          status: true,
          isOnline: true,
          active: true,
          is_save_group: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!phoneData) {
        return res.status(404).json({
          result: false,
          message: "Phone not found",
        });
      }

      return res.status(200).json({
        result: true,
        data: formatPhoneResponse(phoneData),
      });
    }

    // 2. Jika mencari berdasarkan token / api_key spesifik
    if (targetToken) {
      const phoneData = await prisma.phone.findUnique({
        where: {
          token: targetToken,
        },
        select: {
          id: true,
          name: true,
          number: true,
          account_name: true,
          token: true,
          status: true,
          isOnline: true,
          active: true,
          is_save_group: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!phoneData) {
        return res.status(404).json({
          result: false,
          message: "Phone with given token not found",
        });
      }

      return res.status(200).json({
        result: true,
        data: formatPhoneResponse(phoneData),
      });
    }

    // 3. Query list / pencarian berdasarkan phone number (dengan normalisasi format) & filter lain
    let phoneWhereClause: any = undefined;
    if (searchPhone) {
      const variants = getPhoneSearchVariants(searchPhone);
      phoneWhereClause = {
        OR: variants.map((v) => ({
          number: {
            contains: v,
          },
        })),
      };
    }

    const phones = await prisma.phone.findMany({
      where: {
        ...(phoneWhereClause && phoneWhereClause),
        ...(typeof onlineParam !== "undefined" && onlineParam !== "" && {
          isOnline: onlineParam === "1" || onlineParam === "true",
        }),
        ...(typeof active !== "undefined" && active !== "" && {
          active: Number(active),
        }),
      },
      select: {
        id: true,
        name: true,
        number: true,
        account_name: true,
        token: true,
        status: true,
        isOnline: true,
        active: true,
        is_save_group: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      result: true,
      count: phones.length,
      data: phones.map(formatPhoneResponse),
    });
  } catch (error: any) {
    console.error("[Phone Status API Error]:", error);
    return res.status(500).json({
      result: false,
      message: "Internal Server Error",
      error: error?.message || error,
    });
  }
}

export default bearerAuthMiddleware(handler);
