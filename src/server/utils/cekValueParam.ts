import { AutoReply } from '@prisma/client';

type RecipientSenderType = {
  recipient?: string;
  sender?: string | number | null;
  message?: string;
  quote?: string;
};

export const CekValueParam = (
  items: AutoReply,
  isi_param: keyof AutoReply,
  recipientSender: RecipientSenderType
): string => {
  const { recipient, sender, message, quote } = recipientSender;

  // Map known values from recipientSender
  const paramMapping: { [key: string]: string | number | null | undefined } = {
    Recipient: recipient,
    Sender: sender,
    Message: message,
    Quote: quote,
  };

  // Extract the suffix number from 'isi_param' (e.g., 1, 2, 3)
  const paramIndex = isi_param.split("_")[2];

  // Dynamically generate custom value keys
  const customValueKey = `custom_value_${paramIndex}` as keyof AutoReply;
  const isiParamValue = items[isi_param]; // Get the value of the current 'isi_param'

  // Check if isi_param corresponds to one of the known keys
  if (isiParamValue && typeof isiParamValue === "string") {
    const mappedValue = paramMapping[isiParamValue];
    if (mappedValue !== undefined) {
      return String(mappedValue); // Return the corresponding recipientSender value
    }

    // If not found in paramMapping, return the custom value
    return String(items[customValueKey] ?? "");
  }

  return ""; // Default return if no match is found
};
