<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class JeblastMessageStatusService
{
    public function checkAndUpdate(int $id): string
    {
        $message = DB::table('xx_send_message')->where('id', $id)->where('tipe', 1)
            ->first(['id', 'to', 'status', 'run', 'updated_at', 'xx_jeblast_job_id',
                'xx_jeblast_sender', 'xx_jeblast_state']);
        abort_unless($message, 404, 'Pesan WhatsApp tidak ditemukan.');

        if ($message->run != 0) {
            $this->fail('Pesan sedang diproses. Coba cek status kembali sesaat lagi.');
        }
        $jobId = (string) $message->xx_jeblast_job_id;
        if ($jobId === '') {
            $this->fail('Pesan belum memiliki Job ID Jeblast.');
        }
        // Gunakan perangkat yang mengirim job, meskipun perangkat toko sudah berganti.
        $token = DB::table('xx_wa_phones')->where('wa_sender', $message->xx_jeblast_sender)
            ->value('wa_key');
        if (empty($message->xx_jeblast_sender) || empty($token)) {
            $this->fail('Token perangkat pengirim job tidak tersedia.');
        }

        try {
            $response = Http::withToken($token)->acceptJson()->connectTimeout(5)->timeout(10)
                ->get('https://dashboard.jeblast.com/api/send-status', ['id' => $jobId, 'page' => 1]);
        } catch (ConnectionException $e) {
            $this->fail('Tidak dapat terhubung ke Jeblast. Coba kembali sesaat lagi.');
        }
        $payload = $response->json();
        if (! $response->successful() || ! is_array($payload)
            || ($payload['result'] ?? false) !== true || ! is_array($payload['data'] ?? null)) {
            $this->fail('Pengecekan status Jeblast gagal (HTTP '.$response->status().').');
        }

        $job = collect($payload['data'])->first(function ($job) use ($jobId, $message) {
            return is_array($job) && ($job['id'] ?? null) === $jobId
                && is_string($job['recipient'] ?? null)
                && $this->normalizeRecipient($job['recipient']) === $this->normalizeRecipient((string) $message->to);
        });
        if (! $job || ! is_string($job['status'] ?? null)) {
            $this->fail('Job ID dan penerima tidak ditemukan pada respons Jeblast.');
        }
        $state = strtoupper($job['status']);
        if (! in_array($state, ['REQUESTING', 'UNKNOWN', 'ACCEPTED', 'QUEUED', 'PROCESSING', 'SENDING',
            'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNCERTAIN'], true)) {
            $this->fail('Status dari Jeblast belum dikenali.');
        }
        $status = in_array($state, ['SENT', 'DELIVERED', 'READ'], true) ? 1
            : (in_array($state, ['FAILED', 'UNCERTAIN'], true) ? 2 : 0);

        // Request API dilakukan di luar transaksi; cek ulang sebelum menulis hasilnya.
        DB::transaction(function () use ($message, $jobId, $state, $status) {
            $current = DB::table('xx_send_message')->where('id', $message->id)->lockForUpdate()->first();
            if (! $current || $current->run != 0 || $current->tipe != 1
                || $current->xx_jeblast_job_id !== $message->xx_jeblast_job_id
                || $current->xx_jeblast_sender !== $message->xx_jeblast_sender
                || $current->xx_jeblast_state !== $message->xx_jeblast_state
                || $current->status != $message->status || $current->to !== $message->to
                || $current->updated_at !== $message->updated_at) {
                $this->fail('Data pesan berubah saat pengecekan. Muat ulang tabel dan cek kembali.');
            }
            DB::table('xx_send_message')->where('id', $message->id)->update([
                'xx_jeblast_state' => $state,
                'xx_jeblast_checked_at' => now(),
                'status' => $status,
                'status_message' => 'Jeblast '.$state.'; job_id='.$jobId,
                'updated_at' => now(),
            ]);
        });

        return $state;
    }

    private function normalizeRecipient(string $number): string
    {
        $number = preg_replace('/\D/', '', $number);

        return str_starts_with($number, '0') ? '62'.substr($number, 1) : $number;
    }

    private function fail(string $message): void
    {
        throw ValidationException::withMessages(['id' => $message]);
    }
}
