-- CreateTable
CREATE TABLE `wa_auth_sessions` (
    `phoneId` VARCHAR(36) NOT NULL,
    `leaseToken` VARCHAR(36) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `migratedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`phoneId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wa_auth_keys` (
    `phoneId` VARCHAR(36) NOT NULL,
    `keyHash` CHAR(64) NOT NULL,
    `keyName` VARCHAR(512) NOT NULL,
    `value` LONGTEXT NOT NULL,

    PRIMARY KEY (`phoneId`, `keyHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wa_restrictions` (
    `phoneId` VARCHAR(36) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `reason` VARCHAR(100) NULL,
    `endsAt` DATETIME(3) NULL,
    `checkedAt` DATETIME(3) NULL,
    `newChatCap` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`phoneId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wa_protocol_messages` (
    `phoneId` VARCHAR(36) NOT NULL,
    `keyHash` CHAR(64) NOT NULL,
    `value` LONGTEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `wa_protocol_messages_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`phoneId`, `keyHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recipient_consents` (
    `userId` VARCHAR(36) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `purpose` VARCHAR(24) NOT NULL,
    `source` VARCHAR(100) NOT NULL,
    `evidence` VARCHAR(1000) NOT NULL,
    `grantedAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`, `number`, `purpose`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recipient_consent_events` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `purpose` VARCHAR(24) NOT NULL,
    `action` VARCHAR(16) NOT NULL,
    `source` VARCHAR(100) NOT NULL,
    `evidence` VARCHAR(1000) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `recipient_consent_events_userId_number_createdAt_idx`(`userId`, `number`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
