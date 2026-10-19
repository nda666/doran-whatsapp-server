const path = require('node:path');
const app = '/home/jeblast/repos/doran-whatsapp-server';
process.chdir(app);
require(path.join(app, 'node_modules/@next/env')).loadEnvConfig(app);
const { PrismaClient } = require(path.join(app, 'node_modules/@prisma/client'));
const prisma = new PrismaClient();
(async () => {
  const config = await prisma.deviceWebhookSetting.findUnique({where:{id:1}});
  if (config.url !== 'https://kasir.doran.id/api/webhooks/jeblast/wa-phone') throw new Error('Unexpected endpoint');
  const phone = await prisma.phone.findFirst({where:{number:'6281217357535'}});
  console.log('AUTH_TOKEN_MATCHES_SPECIFIED_DEVICE', config.secret === phone?.token);
  const event = await prisma.deviceWebhookEvent.findFirst({where:{event:'device.webhook.test'},orderBy:{id:'desc'}});
  if (!event?.payload) throw new Error('No pending test payload');
  const response = await fetch(config.url, {method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+config.secret,'Content-Type':'application/json',Accept:'application/json','X-Jeblast-Event-Id':event.eventId},body:JSON.stringify({...JSON.parse(event.payload),sequence:event.id})});
  let data; try { data = await response.json(); } catch { data = {}; }
  const message = typeof data.message === 'string' ? data.message.replaceAll(config.secret,'[redacted]').slice(0,300) : undefined;
  console.log(JSON.stringify({status:response.status,message,validation_fields:Object.keys(data.errors || {})}));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
