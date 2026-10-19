import { z } from "zod";

export const EMAIL_FROM_KEY = "postmark-from-email";
export const EMAIL_FROM_LABEL = "Email pengirim Postmark";
export const DEFAULT_EMAIL_FROM = "wa@dorandev.com";
export const emailFromInput = z.string().email().max(254);
