-- AlterTable
ALTER TABLE `auto_replies` MODIFY `isi_param_1` ENUM('Sender', 'Recipient', 'Message', 'Quote', 'Custom') NULL,
    MODIFY `isi_param_2` ENUM('Sender', 'Recipient', 'Message', 'Quote', 'Custom') NULL,
    MODIFY `isi_param_3` ENUM('Sender', 'Recipient', 'Message', 'Quote', 'Custom') NULL;

-- AlterTable
ALTER TABLE `inbox_messages` MODIFY `isi_param_1` ENUM('Sender', 'Recipient', 'Message', 'Quote', 'Custom') NULL,
    MODIFY `isi_param_2` ENUM('Sender', 'Recipient', 'Message', 'Quote', 'Custom') NULL,
    MODIFY `isi_param_3` ENUM('Sender', 'Recipient', 'Message', 'Quote', 'Custom') NULL;
