import { Dispatch, SetStateAction, useEffect, useState } from "react";

import axios, { AxiosError } from "axios";

import { PhoneFormData } from "@/components/phone/PhoneFormModal";
import type { Phone, SenderGroup, User } from "@prisma/client";
import type { PhoneCleanupOptions } from "./phoneCleanup";
import type { PhoneConnectionInfo } from "./phoneConnectionStatus";

export type PhoneRow = Phone & { user?: Pick<User, "id" | "name" | "email">; senderGroup?: Pick<SenderGroup, "id" | "name" | "enabled"> | null; connection?: PhoneConnectionInfo };

type ResponseResult = {
  success: boolean;
  error: any;
  data: any;
};
export type usePhoneDataType = {
  phones: PhoneRow[] | undefined;
  setPhones: Dispatch<SetStateAction<PhoneRow[] | undefined>>;
  save: (data: PhoneFormData) => Promise<ResponseResult>;
  deleteById: (phoneId: string, options: PhoneCleanupOptions) => Promise<ResponseResult>;
  isSaveGroup: (
    phoneId: string,
    is_save_group: boolean
  ) => Promise<ResponseResult>;
  toggleActive: (phoneId: string, active: number) => Promise<ResponseResult>;
  generateTokens: (selection: { scope: "selected"; ids: string[] } | { scope: "all" }) => Promise<ResponseResult>;
  refetchPhone: () => void;
  total: number;
  connectionStatusError: boolean;
};

export type SearchPhoneParams = {
  name?: string | undefined | null;
  number?: string | undefined | null;
  is_online?: string | undefined | null;
  active?: string | undefined | null;
  sender_group?: string | undefined | null;
  quota_status?: string | undefined | null;
  sort?: string;
  order?: string;
  page?: number;
  limit?: number;
};
export default function usePhoneData(
  token: string,
  search: SearchPhoneParams
): usePhoneDataType {
  const [runRefetchPhone, setRunRefetchPhone] = useState(0);
  const [phones, setPhones] = useState<PhoneRow[] | undefined>([]);
  const [total, setTotal] = useState(0);
  const [connectionStatusError, setConnectionStatusError] = useState(false);
  // const socketRef = useRef<any>();

  const refetchPhone = () => {
    setRunRefetchPhone(v => v + 1);
  };

  useEffect(() => {
    setRunRefetchPhone(v => v + 1);
  }, [search.page, search.limit, search.sort, search.order]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchPhones = async () => {

      try {
        const response = await axios.get(`/api/phones`, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: {
            page: search.page || 1,
            limit: search.limit || 5,
            sort: search.sort, order: search.order,
            ...(search.name && { name: search.name }),
            ...(search.number && { number: search.number }),
            ...(search.is_online && { is_online: search.is_online }),
            ...(search.active && { active: search.active }),
            ...(search.sender_group && { sender_group: search.sender_group }),
            ...(search.quota_status && { quota_status: search.quota_status }),
          },
        });
        const result = response.data;
        if (controller.signal.aborted) return;
        setConnectionStatusError(false);
        setPhones(result.data);
        setTotal(result.total);
      } catch (e) {
        if (controller.signal.aborted) return;
        setConnectionStatusError(true);
        setPhones(current => current?.map(phone => ({ ...phone, connection: undefined })));
      }
    };
    runRefetchPhone && token && fetchPhones();
    return () => { controller.abort(); };
  }, [runRefetchPhone, token, search.name, search.number, search.is_online, search.active, search.sender_group, search.quota_status, search.page, search.limit, search.sort, search.order]);

  const deleteById = async (phoneId: string, options: PhoneCleanupOptions) => {
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
      const resp = await axios.post(`/api/phones/${phoneId}`, options, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      result.success = true;
      result.data = resp.data;
      setRunRefetchPhone(v => v + 1);
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
      setRunRefetchPhone(v => v + 1);
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
    //
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
      setRunRefetchPhone(v => v + 1);
    } catch (e) {
      if (e instanceof AxiosError) {
        result.error = e;
      } else {
        result.error = e;
      }
    }

    return result;
  };

  const toggleActive = async (phoneId: string, active: number) => {
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
        `/api/phones/${phoneId}/toggle-active`,
        {
          active: active,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      result.success = true;
      result.data = resp.data;
      setRunRefetchPhone(v => v + 1);
    } catch (e) {
      if (e instanceof AxiosError) {
        result.error = e;
      } else {
        result.error = e;
      }
    }

    return result;
  };

  const generateTokens: usePhoneDataType["generateTokens"] = async selection => {
    try {
      const response = await axios.post("/api/phones/generate-token", selection, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Remove stale credentials immediately, then reload the current page.
      setPhones(undefined);
      refetchPhone();
      return { success: true, data: response.data, error: undefined };
    } catch (error) {
      return { success: false, data: undefined, error };
    }
  };

  return {
    total,
    connectionStatusError,
    phones,
    setPhones,
    save,
    deleteById,
    isSaveGroup,
    toggleActive,
    generateTokens,
    refetchPhone,
  };
}

