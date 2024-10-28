import { AutoReply, Phone } from "@prisma/client";

export interface AutoReplyFormModalRef {
  resetForm: () => void;
}

export interface ImageReply {
  preview?: string;
  file_name?: string;
  raw?: any;
  image_reply?: any;
}

export type ButtonMessage = {
  label?: string;
  name: string;
  value?: string;
};

export type AutoReplyFormData = {
  phoneId?: string;
  whatsapp_account: string;
  type_keyword: string;
  type_message: string;
  keyword: string;
  reply: string;
  image?: any;
  image_type: string;
  url?: string;
  type_request?: string;
  param_1?: string;
  isi_param_1?: string;
  param_2?: string;
  isi_param_2?: string;
  param_3?: string;
  isi_param_3?: string;
  custom_input_1?: string;
  custom_input_2?: string;
  custom_input_3?: string;
  is_save_inbox?: boolean;
  buttons: ButtonMessage[];
};

export interface CollectionCreateFormProps {
  open: boolean;
  onSubmitReply: (values: AutoReplyFormData) => void;
  onChangeImageReply: (values: ImageReply) => void;
  onCancel: () => void;
  title?: string;
  loading?: boolean;
  phoneId?: Phone | undefined;
  editReply?: AutoReply | undefined;
}
