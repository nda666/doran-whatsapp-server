// env.d.ts
declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    NEXTAUTH_SECRET: string;
    APP_URL: string;
    PORT: string;
    NEXT_PUBLIC_APP_URL: string;

    WHATSAPP_AUTH_FOLDER: string;
    WHATSAPP_LOG: string;
    WEBSITE_LOG: string;

    API_TOKEN?: string;
    WEBHOOK_URLS?: string;
    WEBHOOK_RATE_LIMIT_MS?: string;
  }
}
