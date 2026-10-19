-- AlterTable
ALTER TABLE `wa_dispatches` MODIFY `status` ENUM('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNCERTAIN', 'SUPPRESSED') NOT NULL DEFAULT 'QUEUED';

-- CreateTable
CREATE TABLE `messaging_preferences` (
    `userId` VARCHAR(36) NOT NULL,
    `optOutEnabled` BOOLEAN NOT NULL DEFAULT false,
    `offlineAlertsEnabled` BOOLEAN NOT NULL DEFAULT false,
    `alertEmail` VARCHAR(254) NOT NULL DEFAULT '',
    `offlineDelaySeconds` INTEGER NOT NULL DEFAULT 90,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recipient_suppressions` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `reason` VARCHAR(255) NOT NULL DEFAULT '',
    `source` VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `recipient_suppressions_userId_number_key`(`userId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_send_policies` (
    `phoneId` VARCHAR(36) NOT NULL,
    `dailyLimit` INTEGER NOT NULL DEFAULT 500,
    `minIntervalSeconds` INTEGER NOT NULL DEFAULT 5,
    `adaptiveEnabled` BOOLEAN NOT NULL DEFAULT true,
    `paused` BOOLEAN NOT NULL DEFAULT false,
    `pauseReason` VARCHAR(128) NULL,
    `warmupStartedAt` DATETIME(3) NULL,
    `nextAllowedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`phoneId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_daily_usage` (
    `phoneId` VARCHAR(36) NOT NULL,
    `day` VARCHAR(10) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `failures` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`phoneId`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_alert_states` (
    `phoneId` VARCHAR(36) NOT NULL,
    `offlineAt` DATETIME(3) NULL,
    `notifiedAt` DATETIME(3) NULL,
    `recoveryPending` BOOLEAN NOT NULL DEFAULT false,
    `lastAlertAt` DATETIME(3) NULL,
    `leaseToken` VARCHAR(36) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`phoneId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

