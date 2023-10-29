
import { PrismaClient } from '@prisma/client';
const tableNames = ['users', 'phones', 'accounts','sessions','verification_tokens','auto_replies','_prisma_migrations'];
const prisma = new PrismaClient();
async function main() {
  for (const tableName of tableNames) await prisma.$queryRawUnsafe(`Truncate "${tableName}" restart identity cascade;`);
}

main().finally(async () => {
  await prisma.$disconnect();
});