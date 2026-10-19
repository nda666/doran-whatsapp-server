import Bull from "bull";

// Inisialisasi queue
const sendWaQueue = process.env.QUEUE_ENABLED === "false" ? null : new Bull("sendWaQueue", {
  redis: {
    host: "127.0.0.1",
    port: 6379,
    db: 4,
  },
  prefix: "doran-whatsapp",
});

export default sendWaQueue;
