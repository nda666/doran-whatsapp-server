-- AlterTable
ALTER TABLE `wa_dispatches` ADD COLUMN `campaignId` VARCHAR(36) NULL,
    ADD COLUMN `mediaId` VARCHAR(36) NULL,
    ADD COLUMN `payload` JSON NULL,
    ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT 'API';

-- AlterTable
ALTER TABLE `users` ADD COLUMN `deviceLimit` INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN `plan` VARCHAR(191) NOT NULL DEFAULT 'Standard',
    ADD COLUMN `role` VARCHAR(16) NOT NULL DEFAULT 'USER',
    ADD COLUMN `subscriptionExpiresAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `phones` ADD COLUMN `readReceipt` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `rejectCall` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `showOnline` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `showTyping` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `webhookUrl` TEXT NULL;

-- AlterTable
ALTER TABLE `auto_replies` ADD COLUMN `delaySeconds` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `sentCount` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `campaigns` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `message` TEXT NOT NULL,
    `phoneIds` JSON NOT NULL,
    `mediaId` VARCHAR(36) NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `delayMin` INTEGER NOT NULL DEFAULT 5,
    `delayMax` INTEGER NOT NULL DEFAULT 15,
    `status` ENUM('WAITING', 'PROCESSING', 'COMPLETED', 'PAUSED', 'CLEARED') NOT NULL DEFAULT 'WAITING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `campaigns_userId_status_createdAt_idx`(`userId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `contact_groups` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,

    UNIQUE INDEX `contact_groups_userId_name_key`(`userId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `contacts` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `groupId` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contacts_userId_groupId_idx`(`userId`, `groupId`),
    UNIQUE INDEX `contacts_userId_number_key`(`userId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `media_assets` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `mime` VARCHAR(100) NOT NULL,
    `size` INTEGER NOT NULL,
    `filename` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `media_assets_filename_key`(`filename`),
    INDEX `media_assets_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `server_settings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `serverType` VARCHAR(191) NOT NULL DEFAULT 'VPS',
    `nodeUrl` VARCHAR(191) NOT NULL DEFAULT 'http://127.0.0.1',
    `nodePort` INTEGER NOT NULL DEFAULT 3000,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `device_contacts` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `phoneId` VARCHAR(36) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `name` VARCHAR(200) NOT NULL,

    INDEX `device_contacts_userId_phoneId_idx`(`userId`, `phoneId`),
    UNIQUE INDEX `device_contacts_phoneId_number_key`(`phoneId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateIndex
CREATE INDEX `wa_dispatches_campaignId_status_idx` ON `wa_dispatches`(`campaignId`, `status`);

-- AddForeignKey
ALTER TABLE `wa_dispatches` ADD CONSTRAINT `wa_dispatches_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wa_dispatches` ADD CONSTRAINT `wa_dispatches_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `contact_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


