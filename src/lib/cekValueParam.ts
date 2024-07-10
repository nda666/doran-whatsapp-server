import { AutoReply } from "@prisma/client";

type RecipientSenderType = {
    recipient?: string;
    sender?: string | number | null;
    message?: string;
}
export const CekValueParam = (items: AutoReply, isi_param: string, recipientSender:RecipientSenderType): string => {
    const {recipient, sender, message} = recipientSender;

    let value_result: string = '';

    for(let val in items) {
        if (items.hasOwnProperty(isi_param)) { // Check if val is a valid key of items
            switch (isi_param) {
                case "isi_param_1":
                    if (items[isi_param] === "Recipient") {
                        return String(recipient);
                    } else if (items[isi_param] === "Sender") {
                        return String(sender);
                    } else if (items[isi_param] === "Message") {
                        return String(message);
                    } else if (items[isi_param] === "Custom") {
                        return String(items['custom_value_1']);
                    }
                    break;
                case "isi_param_2":
                    if (items[isi_param] === "Recipient") {
                        return String(recipient);
                    } else if (items[isi_param] === "Sender") {
                        return String(sender);
                    } else if (items[isi_param] === "Message") {
                        return String(message);
                    } else if (items[isi_param] === "Custom") {
                        return String(items['custom_value_2']);
                    }
                    break;
                case "isi_param_3":
                    if (items[isi_param] === "Recipient") {
                        return String(recipient);
                    } else if (items[isi_param] === "Sender") {
                        return String(sender);
                    } else if (items[isi_param] === "Message") {
                        return String(message);
                    } else if (items[isi_param] === "Custom") {
                        return String(items['custom_value_3']);
                    }
                    break;
                default:
                    break;
            }
        }
    }
    return ''; // Default return if no match is found
}