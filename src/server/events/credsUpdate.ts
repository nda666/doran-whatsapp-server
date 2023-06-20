import {
  ConnectionState,
  DisconnectReason,
  WASocket,
} from "@whiskeysockets/baileys";
import { Server } from "socket.io";
import whatsappSocket from "../whatsappSocket";
import { updatePhoneStatusAndOnline } from "../../lib/phone";
import { WaSockQrTimeout } from "../constant";

export default function credsUpdate(
  io: Server,
  waSock: WASocket,
  userId: string,
  phoneId: string,
  update: Partial<ConnectionState>
) {}
