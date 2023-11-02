import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { prisma } from "./prisma";
import { AutoReply, Phone } from "@prisma/client";
import axios, { AxiosError } from "axios";
import { AutoReplyFormData } from "@/components/auto-reply/AutoReplyFormModal";
// import { PhoneFormData } from "@/components/phone/PhoneFormModal";

type ResponseResult = {
  success: boolean;
  error: any;
  data: any;
};
// export type usePhoneDataType = {
//   phones: Phone[] | undefined;
//   auto_replies: AutoReply[] | undefined;
//   setPhones: Dispatch<SetStateAction<Phone[] | undefined>>;
//   save: (data: PhoneFormData) => Promise<ResponseResult>;
//   deleteById: (phoneId: string) => Promise<ResponseResult>;
//   refetchReply: () => void;
// };

export type useAutoReplyDataType = {
    // phones: Phone[] | undefined;
    auto_replies: AutoReply[] | undefined;
    // setPhones: Dispatch<SetStateAction<Phone[] | undefined>>;
    save: (data: AutoReplyFormData) => Promise<ResponseResult>;
    // deleteById: (phoneId: string) => Promise<ResponseResult>;
    refetchReply: () => void;
}
export default function useAutoReplyData(token: string, phone_id?: string | undefined, user_id?: string): useAutoReplyDataType {
  const [runRefetchReplies, setRunRefetchReplies] = useState(false);
//   const [phones, setPhones] = useState<Phone[] | undefined>([]);
  const [auto_replies, setAutoReplies] = useState<AutoReply[] | undefined>([]);
  // const socketRef = useRef<any>();

  const refetchReply = () => {
    setRunRefetchReplies(true);
  };

  useEffect(() => {
    setRunRefetchReplies(true);
  }, []);

  useEffect(() => {
    const fetchAutoReplies = async () => {
      setRunRefetchReplies(false);
      const params = {
        user_id: user_id,
        phone_id: phone_id,
      }
      const response = await axios.get(`/api/auto_reply?user_id=${user_id}&phone_id=${phone_id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = response.data;
      setAutoReplies(result);
    };

    runRefetchReplies && token && fetchAutoReplies();
  }, [runRefetchReplies, token]);

//   const deleteById = async (phoneId: string) => {
//     const result: {
//       success: boolean;
//       error: any;
//       data: any;
//     } = {
//       success: false,
//       error: undefined,
//       data: undefined,
//     };
//     try {
//       const resp = await axios.delete(`/api/phones/${phoneId}`, {
//         headers: {
//           Authorization: `Bearer ${token}`,
//         },
//       });
//       result.success = true;
//       result.data = resp.data;
//       setRunRefetchPhone(true);
//     } catch (e) {
//       if (e instanceof AxiosError) {
//         result.error = e;
//       } else {
//         result.error = e;
//       }
//     }
//     return result;
//   };
  const save = async (data: AutoReplyFormData) => {
    const result: ResponseResult = {
      success: false,
      error: undefined,
      data: undefined,
    };

    try {
      const resp = await axios.post(`/api/auto_reply`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      result.success = true;
      result.data = resp.data;
      setRunRefetchReplies(true);
    } catch (e) {
      if (e instanceof AxiosError) {
        result.error = e;
      } else {
        result.error = e;
      }
    }
    return result;
  };

  return {
    // phones,
    auto_replies,
    // setPhones,
    save,
    // deleteById,
    refetchReply,
  };
}
