import sendWaQueue from "../queues/sendWaQueue";

sendWaQueue.process(async (job) => {
  const data = job.data;

  console.log(`Sending email to ` + JSON.stringify(data));

  // Simulasi kirim email, atau logika berat lainnya
});
