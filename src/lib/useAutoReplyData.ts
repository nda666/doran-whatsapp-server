import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { prisma } from "./prisma";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { AutoReply, Phone } from "@prisma/client";
import axios, { AxiosError } from "axios";
import { AutoReplyFormData } from "@/components/auto-reply/AutoReplyFormModal";
import { File } from "buffer";
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
  deleteById: (id: number, phoneId: string) => Promise<ResponseResult>;
  refetchReply: () => void;
};
export default function useAutoReplyData(
  token: string,
  phone_id?: string | undefined,
  user_id?: string
): useAutoReplyDataType {
  const [runRefetchReplies, setRunRefetchReplies] = useState(false);
  //   const [phones, setPhones] = useState<Phone[] | undefined>([]);
  const [auto_replies, setAutoReplies] = useState<AutoReply[] | undefined>([]);
  // const socketRef = useRef<any>();
  const { data: session } = useSession();
  const router = useRouter();
  const imgExt = ["jpg", "jpeg", "png", "gif"];
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
        user_id: user_id ? user_id : session?.user?.id,
        phone_id: phone_id ? phone_id : router.query.phone_id,
      };
      const response = await axios.get(
        `/api/auto_reply?user_id=${user_id}&phone_id=${phone_id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
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
    let uploadStatus = false;
    const result: ResponseResult = {
      success: false,
      error: undefined,
      data: undefined,
    };

    // return result;
    if (data.type_message == "image") {
      if (data.image !== null && (data.image as File)) {
        //
        data.image_type = "file";
        const imgFile: File = data.image as File;
        let image_extension = imgFile!.name.split(".").pop();
        if (imgExt.includes(image_extension!)) {
          const formData = new FormData();
          // let change_name = new Date().getTime()+"_"+phone_id+"."+image_extension;
          formData.append("image", data.image);

          const responseImg = await axios.post(
            `/api/image?phone_id=${phone_id}`,
            formData
          );
          // result.data = responseImg;
          if (responseImg.status == 200) {
            const { file } = responseImg.data;
            let change_name: string = "";
            if (file) {
              for (let imgFile of file.image) {
                change_name = imgFile.newFilename;
              }
            }
            // return result;
            data.image = change_name && change_name;
            uploadStatus = true;
          }
        }
      } else if (data.image !== null && (data.image as string)) {
        data.image_type = "text";
        data.image = data.image && data.image;
        uploadStatus = true;
      }
    }

    if (data.type_message == "text" || data.type_message == "button" || data.type_message == "webhook")
      uploadStatus = true;
    try {
      if (uploadStatus) {
        const resp = await axios.post(`/api/auto_reply`, data, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        result.success = true;
        result.data = resp.data;

        setRunRefetchReplies(true);
        // uploadStatus = false;
      } else {
        throw new Error("failed insert");
      }
    } catch (e) {
      if (e instanceof AxiosError) {
        result.error = e;
      } else {
        result.error = e;
      }
    }

    return result;
  };

  const deleteById = async (id: number, phoneId: string) => {
    const result: {
      success: boolean;
      error: any;
      data: any;
    } = {
      success: false,
      error: undefined,
      data: undefined,
    };

    try {
      const resp = await axios.delete(
        `/api/auto_reply/${id}?phone_id=${phoneId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      result.success = true;
      // result.data = resp.json();
      result.data = resp.data;
      //
      setRunRefetchReplies(true);
    } catch (e: any) {
      result.error = e;
    }

    return result;
  };

  return {
    // phones,
    auto_replies,
    // setPhones,
    save,
    deleteById,
    refetchReply,
  };
}
