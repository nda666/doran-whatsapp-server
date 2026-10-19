# Error response metadata

Device API failures now return `result:false`, `message`, and `curl_error:null`. Both public and nonpublic aliases use the same handler. Known errors such as invalid tokens and unsupported methods return JSON instead of an empty body. HTTP status codes otherwise retain their endpoint-specific values.

Jeblast runs Node.js and cannot obtain the PHP client's `curl_error()`. In `SendMessageCommand.php`, the decoded response is normalized with `curl_error`, `curl_errno`, and `http_status`. A local cURL failure fills `curl_error` with the actual captured string; HTTP/API/JSON errors leave it null unless the API explicitly supplied a string. Failure output preserves the API message and appends a nonempty curl_error when it is not already in the message.

Example API failure:
```json
{"result":false,"message":"Token tidak valid","curl_error":null}
```

Example PHP client connection failure:
```json
{"result":false,"message":"cURL error 60: SSL certificate problem","curl_error":"SSL certificate problem","curl_errno":60,"http_status":0}
```

Implemented locally. Not deployed to the Jeblast or kasir production servers. PHP lint, pure response tests, mocked API parity tests, TypeScript, ESLint and API toolkit validation passed. No WhatsApp messages were sent.
