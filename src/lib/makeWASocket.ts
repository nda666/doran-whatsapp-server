import { WaSockQrTimeout } from "@/server/constant";
import _makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";

const makeWASocket = async (userId: string, phoneId: string) => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(
    `./whatsapp-auth/${userId}-${phoneId}`
  );
  return await _makeWASocket({
    printQRInTerminal: false,
    auth: state,
    syncFullHistory: false,
  });
};

export default makeWASocket;
