import { NextApiHandler, NextApiRequest } from "next";
import formidable from "formidable";
import path from "path";
import fs from "fs/promises";

export const config = {
  api: {
    bodyParser: false,
  },
};

const readFile = (
  req: NextApiRequest,
  saveLocally?: boolean
): Promise<{ fields: formidable.Fields; files: formidable.Files }> => {
  const options: formidable.Options = {};
  if (saveLocally) {
    options.uploadDir = path.join(process.cwd(), "/public/uploads");
    options.filename = (name, ext, path, form) => {
      let image_extension = path.originalFilename!.split(".").pop();
      return new Date().getTime() + "_" + req.query.phone_id+"."+image_extension;
    };
  }
  options.maxFileSize = 2000 * 1024 * 1024;
  const form = formidable(options);
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      resolve({ fields, files });
    });
  });
};

const handler: NextApiHandler = async (req, res) => {
  try {
    await fs.readdir(path.join(process.cwd() + "/public", "/uploads"));
  } catch (error) {
    await fs.mkdir(path.join(process.cwd() + "/public", "/uploads"));
  }
  const file = await readFile(req, true);
  res.json({ done: "ok", file: file.files });
};

export default handler;