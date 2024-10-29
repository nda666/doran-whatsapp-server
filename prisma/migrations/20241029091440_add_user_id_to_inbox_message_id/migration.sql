-- AlterTable
ALTER TABLE
    `inbox_messages`
ADD
    COLUMN `userId` VARCHAR(191) NULL
AFTER
    `id`;

-- AddForeignKey
ALTER TABLE
    `inbox_messages`
ADD
    CONSTRAINT `inbox_messages_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE
SET
    NULL ON UPDATE CASCADE;