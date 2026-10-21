CREATE TABLE `device_quota_windows` (
  `phoneId` VARCHAR(36) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reachedAt` DATETIME(3) NULL,
  PRIMARY KEY (`phoneId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve the current WIB day's consumption when introducing quota windows.
INSERT INTO `device_quota_windows` (`phoneId`, `attempts`, `startedAt`, `lastAttemptAt`)
SELECT u.`phoneId`, u.`attempts`, UTC_TIMESTAMP(3), COALESCE(p.`lastSendProcessedAt`, UTC_TIMESTAMP(3))
FROM `device_daily_usage` u
LEFT JOIN `phones` p ON p.`id` = u.`phoneId`
WHERE u.`day` = DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR), '%Y-%m-%d');
