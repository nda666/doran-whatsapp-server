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
  // let result: BaseJson | undefined = undefined;
  const query = args.params ? "?" + serialize(args.params) : "";
  try {
    const res = await fetch(`${args.url}${query && query}`, {
      mode: "cors",
      method: args.method,
      ...(args.method == "POST" ? { body: JSON.stringify(args.body) } : {}),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...args.headers,
      },
    });
    return await buildResponse(res);
  } catch (e: any) {
    return { result: undefined, error: e.message };
  }
};

export const buildResponse = async (response: Response) => {
  let result: BaseJson | undefined = undefined;
  if (response.ok) {
    result = await response.json();
    return {
      result,
      error: undefined,
    };
  } else {
    // const errorJson = await res.json();
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
