import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
export const logger = (saveLocation: string) =>
  pino({
    enabled: true,
    transport: {
      targets: [
        {
          level: "error",
          target: "pino-roll",
          options: {
            file: saveLocation,
            frequency: "daily",
            size: "25m",
            colorize: false,
            mkdir: true,
            dateFormat: "yyyy-MM-dd",
            symlink: process.platform !== "win32",
          },
        },
      ],
    },
    serializers: {
      // Serialize errors to include only stack and location
      error: (err) => {
        return {
          message: err.message,
          stack: err.stack,
        };
      },
    },
  });

