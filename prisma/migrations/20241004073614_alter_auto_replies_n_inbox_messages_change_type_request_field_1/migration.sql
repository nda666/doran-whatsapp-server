/*
  Warnings:

  - The values [Get,Post] on the enum `inbox_messages_type_request` will be removed. If these variants are still used in the database, this will fail.
  - The values [Get,Post] on the enum `inbox_messages_type_request` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `auto_replies` MODIFY `type_request` ENUM('GET', 'POST') NULL;

-- AlterTable
ALTER TABLE `inbox_messages` MODIFY `type_request` ENUM('GET', 'POST') NULL;
