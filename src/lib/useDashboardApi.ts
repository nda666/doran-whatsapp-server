import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import axios from "axios";
export function useDashboardApi<T = any>(url: string, poll = 0) {
  const { data: session } = useSession();
  const token = session?.user?.token;
  const [data, setData] = useState<T>(); const [error, setError] = useState(""); const [version, setVersion] = useState(0);
  useEffect(() => {
    setData(undefined);
    if (!token || !url) return;
    const controller = new AbortController(); let busy = false;
    const fetchData = async () => {
      if (busy) return; busy = true;
      try { const r = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, timeout: 15000 }); setData(r.data); setError(""); }
      catch (e: any) { if (!controller.signal.aborted) setError(e.response?.data?.message || "Data belum dapat dimuat."); }
      finally { busy = false; }
    };
    void fetchData(); const timer = poll ? setInterval(fetchData, poll) : undefined;
    return () => { controller.abort(); if (timer) clearInterval(timer); };
  }, [token, url, version, poll]);
  return { data, error, reload: () => setVersion(v => v + 1), headers: { Authorization: `Bearer ${token || ""}` } };
}
