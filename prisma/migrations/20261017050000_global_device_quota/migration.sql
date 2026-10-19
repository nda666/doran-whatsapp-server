ALTER TABLE `device_send_policies`
  MODIFY `dailyLimit` INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN `useGlobalQuota` BOOLEAN NOT NULL DEFAULT true;

UPDATE `device_send_policies` SET `dailyLimit` = 200, `useGlobalQuota` = true;
