-- CreateTable
CREATE TABLE `auto_replies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `phoneId` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,
    `type` ENUM('text', 'image', 'button', 'template', 'list') NOT NULL DEFAULT 'text',
    `reply` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `auto_replies` ADD CONSTRAINT `auto_replies_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auto_replies` ADD CONSTRAINT `auto_replies_phoneId_fkey` FOREIGN KEY (`phoneId`) REFERENCES `phones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
