-- AlterTable
ALTER TABLE
    `inbox_messages`
ADD
    COLUMN `status` INTEGER NULL,
MODIFY
    `quote` TEXT NULL;

ALTER TABLE
    `inbox_messages`
ADD
    COLUMN `keterangan` TEXT NULL;