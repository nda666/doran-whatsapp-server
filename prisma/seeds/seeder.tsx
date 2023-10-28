// import { prisma } from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcrypt';

async function seed() {
  const prisma = new PrismaClient();

  try {
    // Define your seed data
    const seedData = [
      {
        name: 'John Doe',
        email: 'john@example.com',
        password: hashSync('123456', 10),
        token: 'token123',
        image: 'john.jpg',
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      // Add more seed data as needed
    ];

    // Insert the seed data into the database
    for (const data of seedData) {
      await prisma.user.create({ data });
    }
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    await prisma.$disconnect();
  }
}
const prisma = new PrismaClient();
seed()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    // Ensure the Prisma Client is properly disconnected
    await prisma.$disconnect();
  });
  