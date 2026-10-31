-- Optional schema for trafficGuard.ts. Not applied by this audit or added to automatic migrations.
CREATE TABLE `wa_send_traffic` (
  `id` VARCHAR(36) NOT NULL,
  `phoneId` VARCHAR(36) NOT NULL,
  `logicalId` VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `contentHash` CHAR(64) NOT NULL,
  `admittedAt` DATETIME(3) NOT NULL,
  INDEX `wa_send_traffic_phone_time_idx` (`phoneId`, `admittedAt`),
  INDEX `wa_send_traffic_phone_content_time_idx` (`phoneId`, `contentHash`, `admittedAt`),
  INDEX `wa_send_traffic_time_idx` (`admittedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `wa_send_recovery` (
  `phoneId` VARCHAR(36) NOT NULL,
  `connectedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`phoneId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
