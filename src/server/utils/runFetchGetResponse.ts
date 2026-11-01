import { safeHttpRequest } from "./safeHttpRequest";

type BaseRequest = {
  url: string;
  method?: "GET" | "POST";
  params?: { [key: string]: string };
  body?: BodyInit | null | undefined;
  headers?: HeadersInit;
};

type BaseJson = {
  result: boolean;
  status: boolean;
  message: string;
  data: [] | {};
};

export const runFetchGetResponse = async (args: BaseRequest) => {
  if (args.method === "GET" && args.params) {
    // Delete specific keys from params
    const { detail, ...remainingParams } = args.params;
    args.params = remainingParams; // Update args.params without the 'detail' key
  }
  const query = args.params ? "?" + serialize(args.params) : "";
  try {
    // Auto-reply webhook URLs are user supplied: never reach private addresses or follow redirects.
    const res = await safeHttpRequest(`${args.url}${query && query}`, {
      method: args.method === "POST" ? "POST" : "GET",
      ...(args.method == "POST" ? { body: JSON.stringify(args.body) } : {}),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(args.headers as Record<string, string> | undefined),
      },
    });
    return buildResponse(res);
  } catch (e: any) {
    return { result: undefined, error: e.message };
  }
};

export const buildResponse = (response: { status: number; body: string }) => {
  let result: BaseJson | undefined = undefined;
  if (response.status >= 200 && response.status < 300) {
    try { result = JSON.parse(response.body); }
    catch { return { result: undefined, error: "INVALID_WEBHOOK_JSON" }; }
    return {
      result,
      error: undefined,
    };
  } else {
    return {
      result: undefined,
      error: `HTTP error! Status: ${response.status}`,
    };
  }
};

function serialize(obj: any, prefix: string = ""): string {
  var str = [],
    p;
  for (p in obj) {
    if (obj.hasOwnProperty(p)) {
      var k = prefix ? prefix + "[" + p + "]" : p,
        v = obj[p];
      str.push(
        v !== null && typeof v === "object"
          ? serialize(v, k)
          : encodeURIComponent(k) + "=" + encodeURIComponent(v)
      );
    }
  }
  return str.join("&");
}
