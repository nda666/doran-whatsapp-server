-- CreateTable
CREATE TABLE `wa_dispatches` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `phoneId` VARCHAR(36) NOT NULL,
    `storeId` VARCHAR(64) NOT NULL,
    `transactionId` VARCHAR(128) NOT NULL,
    `messageKey` VARCHAR(64) NOT NULL,
    `recipient` VARCHAR(32) NOT NULL,
    `dedupeKey` CHAR(64) NOT NULL,
    `payloadHash` CHAR(64) NOT NULL,
    `message` TEXT NOT NULL,
    `image` LONGTEXT NULL,
    `status` ENUM('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNCERTAIN') NOT NULL DEFAULT 'QUEUED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `leaseToken` VARCHAR(36) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `messageId` VARCHAR(64) NULL,
    `lastError` VARCHAR(128) NULL,
    `sentAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wa_dispatches_dedupeKey_key`(`dedupeKey`),
    UNIQUE INDEX `wa_dispatches_messageId_key`(`messageId`),
    INDEX `wa_dispatches_status_nextAttemptAt_createdAt_idx`(`status`, `nextAttemptAt`, `createdAt`),
    INDEX `wa_dispatches_phoneId_status_createdAt_idx`(`phoneId`, `status`, `createdAt`),
    INDEX `wa_dispatches_phoneId_storeId_transactionId_idx`(`phoneId`, `storeId`, `transactionId`),
    INDEX `wa_dispatches_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `wa_sender_leases` (
    `phoneId` VARCHAR(36) NOT NULL,
    `leaseToken` VARCHAR(36) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `nextSendAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`phoneId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

