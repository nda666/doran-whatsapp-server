ALTER TABLE `wa_dispatches` ADD COLUMN `requestJobKey` CHAR(64) NULL;
CREATE INDEX `wa_dispatches_requestJobKey_idx` ON `wa_dispatches` (`requestJobKey`);
