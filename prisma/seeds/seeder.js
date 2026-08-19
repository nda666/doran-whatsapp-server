import { hashSync } from "bcrypt";
import { randomBytes } from "crypto";

// import { prisma } from '@/lib/prisma';
import { PrismaClient } from "@prisma/client";

async function seed() {
  const prisma = new PrismaClient();

  try {
    // Define your seed data
    const seedData = [
      {
        name: "John Doe",
        email: "test@gmail.com",
        password: hashSync("123456", 10),
        token: randomBytes(32).toString("hex"),
        image: "john.jpg",
        emailVerified: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Add more seed data as needed
    ];

    // Insert the seed data into the database
    for (const data of seedData) {
      await prisma.user.create({ data });
    }
  } catch (error) {
    console.error("Error seeding data:", error);
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
