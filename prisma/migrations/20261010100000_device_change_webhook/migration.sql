CREATE TABLE `device_webhook_settings` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `url` TEXT NOT NULL,
  `secret` TEXT NOT NULL,
  `revision` VARCHAR(36) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

INSERT INTO `device_webhook_settings` (`id`, `enabled`, `url`, `secret`, `revision`, `updatedAt`)
VALUES (1, false, '', '', '00000000-0000-4000-8000-000000000000', CURRENT_TIMESTAMP(3));

CREATE TABLE `device_webhook_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `eventId` VARCHAR(36) NOT NULL,
  `deviceId` VARCHAR(36) NULL,
  `event` VARCHAR(64) NOT NULL,
  `revision` VARCHAR(36) NOT NULL,
  `payload` LONGTEXT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `leaseToken` VARCHAR(36) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `lastError` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deliveredAt` DATETIME(3) NULL,
  UNIQUE INDEX `device_webhook_events_eventId_key` (`eventId`),
  INDEX `device_webhook_events_status_nextAttemptAt_idx` (`status`, `nextAttemptAt`),
  INDEX `device_webhook_events_createdAt_idx` (`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
