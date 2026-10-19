-- NULL means use the global random sending interval, without an additional device floor.
ALTER TABLE `device_send_policies` MODIFY `minIntervalSeconds` INTEGER NULL DEFAULT NULL;
