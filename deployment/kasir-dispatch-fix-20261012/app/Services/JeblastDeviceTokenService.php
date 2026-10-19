<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class JeblastDeviceTokenService
{
    public function refresh(string $sender, string $rejectedKey): ?string
    {
        $number = JeblastDashboardService::normalizePhone($sender);
        if ($number === null) {
            return null;
        }
        // Endpoint dashboard memakai credential integrasi, bukan token perangkat yang ditolak.
        $devices = array_values(array_filter(app(JeblastDashboardService::class)->searchByPhone($number),
            fn (array $device) => JeblastDashboardService::normalizePhone($device['number'] ?? null) === $number));
        if (count($devices) !== 1) {
            return null;
        }
        $device = $devices[0];
        $key = $device['token'] ?? $device['api_key'] ?? null;
        $deviceId = $device['id'] ?? $device['phoneId'] ?? null;
        if (! is_string($key) || trim($key) === '' || strlen($key) > 50 || ! is_string($deviceId) || $deviceId === '') {
            return null;
        }
        if (hash_equals($rejectedKey, $key)) {
            return null;
        }

        return DB::transaction(function () use ($sender, $deviceId, $key, $rejectedKey) {
            $phones = DB::table('xx_wa_phones')->where('wa_sender', $sender)->lockForUpdate()
                ->get(['id', 'id_device', 'wa_key']);
            if ($phones->isEmpty() || $phones->contains(fn ($phone) => ! empty($phone->id_device) && $phone->id_device !== $deviceId)
                || $phones->contains(fn ($phone) => $phone->wa_key !== $rejectedKey && $phone->wa_key !== $key)) {
                return null;
            }
            foreach ($phones as $phone) {
                DB::table('xx_wa_phones')->where('id', $phone->id)->update(['wa_key' => $key, 'id_device' => $deviceId]);
                DB::table('mastergudang')->where('xx_wa_phone_id', $phone->id)->update(['xx_wa_doran_key' => $key]);
            }

            return $key;
        }, 3);
    }
}
