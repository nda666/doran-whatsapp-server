import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { prisma } from "./prisma";
import { Phone } from "@prisma/client";
import axios, { AxiosError } from "axios";
import { PhoneFormData } from "@/components/phone/PhoneFormModal";

type ResponseResult = {
  success: boolean;
  error: any;
  data: any;
};
export type usePhoneDataType = {
  phones: Phone[] | undefined;
  setPhones: Dispatch<SetStateAction<Phone[] | undefined>>;
  save: (data: PhoneFormData) => Promise<ResponseResult>;
  deleteById: (phoneId: string) => Promise<ResponseResult>;
  isSaveGroup: (
    phoneId: string,
    is_save_group: boolean
  ) => Promise<ResponseResult>;
  refetchPhone: () => void;
};
export default function usePhoneData(token: string): usePhoneDataType {
  const [runRefetchPhone, setRunRefetchPhone] = useState(false);
  const [phones, setPhones] = useState<Phone[] | undefined>([]);
  // const socketRef = useRef<any>();

  const refetchPhone = () => {
    setRunRefetchPhone(true);
  };

  useEffect(() => {
    setRunRefetchPhone(true);
  }, []);

  useEffect(() => {
    console.log("runRefetchPhone", runRefetchPhone);
    const fetchPhones = async () => {
      setRunRefetchPhone(false);
      const response = await axios.get(`/api/phones`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = response.data;
      setPhones(result);
    };

    runRefetchPhone && token && fetchPhones();
    return () => {};
  }, [runRefetchPhone, token]);

  const deleteById = async (phoneId: string) => {
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
      const resp = await axios.delete(`/api/phones/${phoneId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      result.success = true;
      result.data = resp.data;
      setRunRefetchPhone(true);
    } catch (e) {
      if (e instanceof AxiosError) {
        result.error = e;
      } else {
        result.error = e;
      }
    }
    return result;
  };
  const save = async (data: PhoneFormData) => {
    const result: ResponseResult = {
      success: false,
      error: undefined,
      data: undefined,
    };

    try {
      const resp = await axios.post(`/api/phones`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      result.success = true;
      result.data = resp.data;
      setRunRefetchPhone(true);
    } catch (e) {
      if (e instanceof AxiosError) {
        result.error = e;
      } else {
        result.error = e;
      }
    }
    return result;
  };
  const isSaveGroup = async (phoneId: string, is_save_group: boolean) => {
    // console.log(phoneId);
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
      const resp = await axios.patch(
        `/api/phones/${phoneId}/toggle-group`,
        {
          is_save_group: is_save_group,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      result.success = true;
      result.data = resp.data;
      setRunRefetchPhone(true);
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
    phones,
    setPhones,
    save,
    deleteById,
    isSaveGroup,
    refetchPhone,
  };
}
