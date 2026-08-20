import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import fs from "fs";
import path from "path";
import axios from "axios";
import { getRateLimitMs, getWebhookUrls } from "@/services/webhookService";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check auth via session token or Bearer token
  const token = await getToken({ req });
  const authHeader = req.headers.authorization;
  const isBearerAuth =
    authHeader &&
    authHeader.startsWith("Bearer ") &&
    authHeader.substring(7).trim() === process.env.API_TOKEN?.trim();

  if (!token && !isBearerAuth) {
    return res.status(401).json({
      result: false,
      message: "Unauthorized",
    });
  }

  if (req.method === "GET") {
    const urls = getWebhookUrls();
    return res.status(200).json({
      result: true,
      data: {
        webhookUrls: urls,
        apiToken: process.env.API_TOKEN || "",
        rateLimitMs: getRateLimitMs(),
      },
    });
  }

  if (req.method === "POST") {
    const { action, url, webhookUrls, apiToken, rateLimitMs } = req.body;

    // Action: Test Webhook URL
    if (action === "test") {
      const targetUrl = url || (Array.isArray(webhookUrls) ? webhookUrls[0] : webhookUrls);
      if (!targetUrl || (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://"))) {
        return res.status(400).json({
          result: false,
          message: "Invalid Webhook URL for testing",
        });
      }

      const startTime = Date.now();
      try {
        const testPayload = {
          event: "phone.status.test",
          timestamp: new Date().toISOString(),
          data: {
            message: "Test webhook event from Doran WhatsApp Server",
            isOnline: true,
            status: "OPEN",
            test: true,
          },
        };

        const response = await axios.post(targetUrl, testPayload, {
          timeout: 7000,
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Doran-WhatsApp-Server-Webhook/1.0",
          },
        });

        const durationMs = Date.now() - startTime;
        return res.status(200).json({
          result: true,
          statusCode: response.status,
          statusText: response.statusText,
          durationMs,
          data: response.data,
          message: `Webhook test succeeded (${response.status} ${response.statusText} in ${durationMs}ms)`,
        });
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const statusCode = err.response?.status || 500;
        return res.status(200).json({
          result: false,
          statusCode,
          durationMs,
          error: err.message,
          data: err.response?.data || null,
          message: `Webhook test failed: ${err.message}`,
        });
      }
    }

    // Action: Save Webhook URLs & Rate Limit
    let parsedUrls: string[] = [];
    if (Array.isArray(webhookUrls)) {
      parsedUrls = webhookUrls
        .map((u) => String(u).trim())
        .filter((u) => u.length > 0 && (u.startsWith("http://") || u.startsWith("https://")));
    } else if (typeof webhookUrls === "string") {
      parsedUrls = webhookUrls
        .split(",")
        .map((u) => u.trim())
        .filter((u) => u.length > 0 && (u.startsWith("http://") || u.startsWith("https://")));
    }

    const joinedUrls = parsedUrls.join(",");
    process.env.WEBHOOK_URLS = joinedUrls;

    if (typeof apiToken === "string" && apiToken.trim().length > 0) {
      process.env.API_TOKEN = apiToken.trim();
    }

    if (rateLimitMs && !isNaN(Number(rateLimitMs))) {
      process.env.WEBHOOK_RATE_LIMIT_MS = String(Math.max(500, Number(rateLimitMs)));
    }

    // Persist to .env file
    try {
      const envPath = path.resolve(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, "utf-8");

        // Update or append WEBHOOK_URLS
        if (/^WEBHOOK_URLS=.*$/m.test(envContent)) {
          envContent = envContent.replace(/^WEBHOOK_URLS=.*$/m, `WEBHOOK_URLS="${joinedUrls}"`);
        } else {
          envContent += `\nWEBHOOK_URLS="${joinedUrls}"`;
        }

        // Update API_TOKEN if provided
        if (typeof apiToken === "string" && apiToken.trim().length > 0) {
          if (/^API_TOKEN=.*$/m.test(envContent)) {
            envContent = envContent.replace(/^API_TOKEN=.*$/m, `API_TOKEN="${apiToken.trim()}"`);
          } else {
            envContent += `\nAPI_TOKEN="${apiToken.trim()}"`;
          }
        }

        // Update WEBHOOK_RATE_LIMIT_MS if provided
        if (rateLimitMs && !isNaN(Number(rateLimitMs))) {
          const limitStr = String(Math.max(500, Number(rateLimitMs)));
          if (/^WEBHOOK_RATE_LIMIT_MS=.*$/m.test(envContent)) {
            envContent = envContent.replace(/^WEBHOOK_RATE_LIMIT_MS=.*$/m, `WEBHOOK_RATE_LIMIT_MS="${limitStr}"`);
          } else {
            envContent += `\nWEBHOOK_RATE_LIMIT_MS="${limitStr}"`;
          }
        }

        fs.writeFileSync(envPath, envContent, "utf-8");
      }
    } catch (fsErr: any) {
      console.error("[Settings API] Failed to write to .env:", fsErr);
    }

    return res.status(200).json({
      result: true,
      message: "Webhook settings saved successfully",
      data: {
        webhookUrls: parsedUrls,
        apiToken: process.env.API_TOKEN || "",
        rateLimitMs: getRateLimitMs(),
      },
    });
  }

  return res.status(405).json({
    result: false,
    message: "Method Not Allowed",
  });
}
