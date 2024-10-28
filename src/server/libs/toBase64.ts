import { readFile } from "fs";

const toBase64 = (filePath: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    readFile(filePath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      const base64String = Buffer.from(data);
      resolve(base64String);
    });
  });
};

export default toBase64;