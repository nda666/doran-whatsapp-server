import {
  readFile,
  stat,
} from 'fs/promises';
import type {
  NextApiRequest,
  NextApiResponse,
} from 'next';
import path from 'path';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query;
  const imagePathRelative = Array.isArray(id) ? path.join(...id) : id;
  const imagePath = path.join(
    process.cwd(),
    "storage",
    imagePathRelative as string
  );

  const storageDir = path.join(process.cwd(), "storage");
  if (!imagePath.startsWith(storageDir)) {
    return res.status(400).json({ error: "Invalid image path" });
  }

  try {
    // Check if the file exists
    await stat(imagePath);

    // Set the appropriate headers for the image
    res.setHeader("Content-Type", "image/jpeg"); // Change this if your images are in a different format
    res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache the image for a year

    // Read and send the image file
    const imageBuffer = await readFile(imagePath);
    res.status(200).send(imageBuffer);
  } catch (error) {
    res.status(404).json({ error: "Image not found" });
  }
};

export default handler;
