import { useEffect, useState } from "react";

import axios, { AxiosError } from "axios";
import { File } from "buffer";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import { AutoReplyFormData } from "@/types/components/IAutoReplyFormModal";
import { AutoReply } from "@prisma/client";

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
  phone_id?: string | undefined
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

      const response = await axios.get(`/api/auto_reply?phone_id=${phone_id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = response.data;
      setAutoReplies(result);
    };

    runRefetchReplies && phone_id && token && fetchAutoReplies();
  }, [runRefetchReplies, token, phone_id]);

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

    const isValidImage = (imageFile: File) => {
      const validImageTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ];

      // Check if the file's MIME type is valid
      return validImageTypes.includes(imageFile.type);
    };

    const uploadImage = async (image: File): Promise<string | null> => {
      const formData = new FormData();
      formData.append("image", image as Blob, image.name);

      const responseImg = await axios.post(
        `/api/image?phone_id=${phone_id}`,
        formData
      );
      if (responseImg.status === 200 && responseImg.data.file) {
        return responseImg.data.file.image[0].newFilename || null;
      }
      return null;
    };

    const isImageMessage = data.type_message === "image";
    let uploadStatus = false;

    // Handle image messages
    if (isImageMessage) {
      if (!data.image || data.image === "") {
        return {
          success: false,
          error: "Image is empty",
          data: undefined,
        };
      }

      if (typeof data.image !== "string" && isValidImage(data.image as File)) {
        data.image_type = "file";

        const imageFile = await uploadImage(data.image as File);
        if (imageFile) {
          data.image = imageFile;
          uploadStatus = true;
        }
      } else if (typeof data.image === "string") {
        data.image_type = "text";
        uploadStatus = true;
      }
    }

    // Handle non-image message types
    if (
      ["text", "button", "webhook"].includes(data.type_message) ||
      uploadStatus
    ) {
      uploadStatus = true;
    }

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
      } else {
        throw new Error("failed insert");
      }
    } catch (e) {
      result.error = e instanceof AxiosError ? e : e;
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
