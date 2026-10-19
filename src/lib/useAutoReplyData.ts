import { useEffect, useRef, useState } from "react";

import axios, { AxiosError } from "axios";
import { File } from "buffer";

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
  loading: boolean;
  error: string;
  // setPhones: Dispatch<SetStateAction<Phone[] | undefined>>;
  save: (data: AutoReplyFormData) => Promise<ResponseResult>;
  deleteById: (id: number, phoneId: string) => Promise<ResponseResult>;
  refetchReply: () => void;
  updatingIds: number[];
  setStatus: (reply: AutoReply, status: "active" | "inactive") => Promise<ResponseResult>;
};
export default function useAutoReplyData(
  token: string,
  phone_id?: string | undefined
): useAutoReplyDataType {
  const [version, setVersion] = useState(0);
  const [rows, setRows] = useState<{ phoneId?: string; data: AutoReply[] }>({ data: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingIds, setUpdatingIds] = useState<number[]>([]);
  const updating = useRef(new Set<number>());
  const refetchReply = () => setVersion(value => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    setRows({ phoneId: phone_id, data: [] });
    setError("");
    if (!phone_id || !token) { setLoading(false); return; }
    setLoading(true);
    void axios.get(`/api/auto_reply?phone_id=${encodeURIComponent(phone_id)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, timeout: 15000,
    }).then(response => {
      if (!controller.signal.aborted) setRows({ phoneId: phone_id, data: response.data });
    }).catch(() => {
      if (!controller.signal.aborted) setError("Balasan Otomatis belum dapat dimuat. Silakan coba lagi.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [version, token, phone_id]);

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
      ["text", "button", "list", "webhook", "ai"].includes(data.type_message) ||
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

        refetchReply();
      } else {
        throw new Error("failed insert");
      }
    } catch (e) {
      result.error = e instanceof AxiosError && e.response?.data?.message ? new Error(e.response.data.message) : e;
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
      refetchReply();
    } catch (e: any) {
      result.error = e;
    }

    return result;
  };

  const setStatus = async (reply: AutoReply, status: "active" | "inactive"): Promise<ResponseResult> => {
    if (updating.current.has(reply.id)) return { success: false, error: undefined, data: undefined };
    updating.current.add(reply.id);
    setUpdatingIds(Array.from(updating.current));
    try {
      const response = await axios.patch(`/api/auto_reply/${reply.id}?phone_id=${encodeURIComponent(reply.phoneId)}`, { reply_status: status }, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      setRows(previous => previous.phoneId === reply.phoneId ? {
        ...previous, data: previous.data.map(row => row.id === reply.id ? { ...row, reply_status: response.data.reply_status } : row),
      } : previous);
      return { success: true, error: undefined, data: response.data };
    } catch (error) {
      return { success: false, error, data: undefined };
    } finally {
      updating.current.delete(reply.id);
      setUpdatingIds(Array.from(updating.current));
    }
  };

  return {
    // phones,
    auto_replies: rows.phoneId === phone_id ? rows.data : [],
    loading,
    error,
    // setPhones,
    save,
    deleteById,
    refetchReply,
    updatingIds,
    setStatus,
  };
}
