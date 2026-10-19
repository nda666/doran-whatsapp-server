-- AlterTable
ALTER TABLE `phones` ADD COLUMN `saveIncomingMessages` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `chat_conversations` (
    `id` VARCHAR(36) NOT NULL,
    `phoneId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `jid` VARCHAR(100) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `lastMessage` TEXT NULL,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unreadCount` INTEGER NOT NULL DEFAULT 0,
    `archived` BOOLEAN NOT NULL DEFAULT false,

    INDEX `chat_conversations_userId_phoneId_lastMessageAt_idx`(`userId`, `phoneId`, `lastMessageAt`),
    UNIQUE INDEX `chat_conversations_phoneId_jid_key`(`phoneId`, `jid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_messages` (
    `id` VARCHAR(36) NOT NULL,
    `conversationId` VARCHAR(36) NOT NULL,
    `waMessageId` VARCHAR(100) NOT NULL,
    `clientRequestId` VARCHAR(36) NULL,
    `requestHash` VARCHAR(64) NULL,
    `sourceMediaId` VARCHAR(36) NULL,
    `direction` VARCHAR(3) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `text` LONGTEXT NOT NULL,
    `quotedText` TEXT NULL,
    `sender` VARCHAR(200) NULL,
    `status` VARCHAR(20) NOT NULL,
    `mediaPath` VARCHAR(100) NULL,
    `mediaMime` VARCHAR(100) NULL,
    `mediaName` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_messages_conversationId_createdAt_id_idx`(`conversationId`, `createdAt`, `id`),
    UNIQUE INDEX `chat_messages_conversationId_waMessageId_key`(`conversationId`, `waMessageId`),
    UNIQUE INDEX `chat_messages_conversationId_clientRequestId_key`(`conversationId`, `clientRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `chat_conversations` ADD CONSTRAINT `chat_conversations_phoneId_fkey` FOREIGN KEY (`phoneId`) REFERENCES `phones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

