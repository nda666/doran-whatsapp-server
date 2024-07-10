type BaseRequest = {
    url: string;
    method?: "GET" | "POST";
    params?: {[key: string]: string},
    body?: BodyInit | null | undefined;
    headers?: HeadersInit; // TODO: add support for Headers
}

type BaseJson = {
    result: boolean;
    status: boolean;
    message: string;
    data: [] | {}
}

export const BaseRequest = async (args: BaseRequest) => {
    // let result: BaseJson | undefined = undefined;
    const query = args.params ? "?" + serialize(args.params) : "";
    const res = await fetch(`${args.url}${query && query}`,{
        mode: "cors",
        method: args.method,
        body: args.body,
        headers: {
            Accept: "application/json",
            ...args.headers
        }
    });

    return await buildResponse(res);

    // if(res.ok) {
    //     let result = await res.json();
    //     buildResponse(result);
    // }
}

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
        // error: await buildError(response),
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