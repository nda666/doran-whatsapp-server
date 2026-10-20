CREATE TABLE `sender_groups` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `sender_groups_userId_name_key` (`userId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `phones`
  ADD COLUMN `senderGroupId` VARCHAR(36) NULL,
  ADD COLUMN `senderPriority` INTEGER NOT NULL DEFAULT 0,
  ADD INDEX `phones_senderGroupId_senderPriority_idx` (`senderGroupId`, `senderPriority`),
  ADD CONSTRAINT `phones_senderGroupId_fkey` FOREIGN KEY (`senderGroupId`) REFERENCES `sender_groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `wa_dispatches`
  ADD COLUMN `senderPhoneId` VARCHAR(36) NULL,
  ADD COLUMN `senderGroupId` VARCHAR(36) NULL,
  ADD INDEX `wa_dispatches_senderPhoneId_messageId_idx` (`senderPhoneId`, `messageId`);

CREATE TABLE `wa_dispatch_attempts` (
  `id` VARCHAR(36) NOT NULL,
  `dispatchId` VARCHAR(36) NOT NULL,
  `phoneId` VARCHAR(36) NOT NULL,
  `messageId` VARCHAR(64) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PROCESSING',
  `error` VARCHAR(128) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  INDEX `wa_dispatch_attempts_dispatchId_startedAt_idx` (`dispatchId`, `startedAt`),
  INDEX `wa_dispatch_attempts_phoneId_messageId_idx` (`phoneId`, `messageId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `wa_dispatch_attempts_dispatchId_fkey` FOREIGN KEY (`dispatchId`) REFERENCES `wa_dispatches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
