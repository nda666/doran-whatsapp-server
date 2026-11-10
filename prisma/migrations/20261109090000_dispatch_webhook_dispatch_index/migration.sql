-- Device cleanup joins webhook events to dispatches by this key. Without an
-- index MySQL scans and locks unrelated webhook rows during a device reset.
CREATE INDEX `dispatch_webhook_events_dispatchId_idx` ON `dispatch_webhook_events` (`dispatchId`) ALGORITHM=INPLACE LOCK=NONE;
