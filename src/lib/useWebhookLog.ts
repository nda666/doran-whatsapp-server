import {
  Dispatch,
  SetStateAction,
  useEffect,
  useState,
} from 'react';

import axios from 'axios';

import { InboxMessage } from '@prisma/client';

type ResponseResult = {
  success: boolean;
  error: any;
  data: any;
};
export type useWebhookLogType = {
  //   data: InboxMessage[] | undefined;
  data: DataResult;
  setData: Dispatch<SetStateAction<DataResult>>;
  refetch: () => void;
  loading: boolean;
};

export type SearchWebhookLogParams = {
  limit?: number | undefined | null;
  page: number | undefined;
  sender: string | undefined;
  recipient: string | undefined;
};

type DataResult = {
  data: InboxMessage[];
  totalPage: number;
  totalData: number;
  currentPage: number;
};

export default function useWebhookLogData(
  token: string,
  search: SearchWebhookLogParams
): useWebhookLogType {
  const [loading, setLoading] = useState(false);
  const [runRefetchWebhookLog, setRunRefetchWebhookLog] = useState(false);
  const [data, setData] = useState<DataResult>({
    data: [],
    totalPage: 0,
    totalData: 0,
    currentPage: 0,
  });
  // const socketRef = useRef<any>();

  const refetch = () => {
    setRunRefetchWebhookLog(true);
  };

  useEffect(() => {
    setRunRefetchWebhookLog(true);
  }, []);

  useEffect(() => {
    setRunRefetchWebhookLog(true);
  }, [search]);

  const fetchWebhookLogs = async () => {
    setRunRefetchWebhookLog(false);
    try {
      setLoading(true);
      const response = await axios.get(`/api/log`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          ...(search.limit && { limit: search.limit }),
          ...(search.page && { page: search.page }),
          ...(search.sender && { sender: search.sender }),
          ...(search.recipient && { recipient: search.recipient }),
        },
      });
      const result = response.data;
      setData(result);
      setLoading(false);
    } catch (e) {
      console.log(e);
      setLoading(false);
    }
  };

  useEffect(() => {
    runRefetchWebhookLog && token && fetchWebhookLogs();
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runRefetchWebhookLog, token]);

  return {
    loading,
    data,
    setData,
    refetch,
  };
}
