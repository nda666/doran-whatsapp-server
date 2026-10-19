<?php

namespace App\Console\Commands;

use App\Models\SendMessage;
use App\Models\Setting;
use App\Models\Store;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class SendMessageCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'doran:sendmessage';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Send Whatsapp Order to Customer';

    /**
     * Create a new command instance.
     *
     * @return void
     */
    public function __construct()
    {
        parent::__construct();
    }

    /**
     * Execute the console command.
     *
     * @return mixed
     */

    /** @var array<string, string|null> */
    private array $waKeys = [];

    /**
     * Batasan shard (dipakai command turunan agar beberapa proses paralel
     * tidak menyentuh grup dan nomor pengirim yang sama):
     * - $onlyGroups !== null: hanya proses grup dengan id di daftar ini.
     * - $exceptGroups: grup dengan id di daftar ini selalu dilewati.
     * - $storeParity !== null: di dalam grup, hanya proses toko dengan
     *   crc32(kode) % 2 === $storeParity (0 atau 1).
     * Default (semua null/kosong) = proses semua grup dan semua toko.
     *
     * @var array<int>|null
     */
    protected ?array $onlyGroups = null;

    /** @var array<int> */
    protected array $exceptGroups = [];

    protected ?int $storeParity = null;

    public function handle()
    {
        $started = microtime(true);
        // Cache hanya berlaku selama satu eksekusi command.
        $this->waKeys = [];

        $ids = DB::table('xx_store_group')
            ->whereNotNull('cc_wa')
            ->when($this->onlyGroups !== null, function ($query) {
                $query->whereIn('id', $this->onlyGroups);
            })
            ->when($this->exceptGroups !== [], function ($query) {
                $query->whereNotIn('id', $this->exceptGroups);
            })
            ->pluck('id');

        if ($this->onlyGroups !== null || $this->exceptGroups !== [] || $this->storeParity !== null) {
            $this->line('Shard: grup=' . $ids->implode(',')
                . ', partisi toko=' . ($this->storeParity === null ? 'semua' : $this->storeParity));
        }

        foreach ($ids as $id) {
            try {
                $this->wa_doran_new($id);
            } catch (\Throwable $e) {
                $this->error('Group=' . $id . ': proses grup gagal (' . get_class($e) . ').');
            }
        }

        $this->line('Runtime: ' . round(microtime(true) - $started, 2) . ' sec');
    }

    public function wa_doran_new($id)
    {
        $max_retry = 9;
        // Mode testing terpisah dari pemilihan ID pesan.
        $isTesting = false;
        $id_table = null;
        $testingSender = '6281217357535';
        $testingRecipient = '085231194683';

        $stores = Store::select('mastergudang.kode', 'wa_utama.wa_sender as wa_sender_utama')
            ->leftJoin('xx_wa_phones as wa_utama', 'wa_utama.id', '=', 'mastergudang.xx_wa_phone_id')
            ->whereNotNull('mastergudang.xx_wa_phone_id')
            ->where('mastergudang.xx_store_group_id', $id)
            ->get();

        $wa_robot = [];
        foreach ($stores as $store) {
            if (!empty($store->wa_sender_utama)) {
                $wa_robot[$store->kode] = $store->wa_sender_utama;
            }
        }

        // Shard per toko: tiap toko punya sender sendiri, jadi pembagian
        // berdasarkan crc32(kode) tetap menjaga pacing per nomor pengirim.
        if ($this->storeParity !== null) {
            $wa_robot = array_filter($wa_robot, function ($kode) {
                return crc32((string) $kode) % 2 === $this->storeParity;
            }, ARRAY_FILTER_USE_KEY);
        }

        if (empty($wa_robot)) {
            $this->line('Group=' . $id . ': tidak ada pengirim, grup dilewati.');
            return;
        }

        // Limit normal mengikuti jumlah toko dalam grup.
        $totalStore = $stores->count();
        $multiplier = match (true) {
            $totalStore >= 70 => 4,
            $totalStore >= 40 => 3,
            $totalStore >= 20 => 2,
            default => 1,
        };

        $limit = $isTesting ? 1 : min(27, 9 * $multiplier);

        $this->line('Group=' . $id . ', Store=' . count($wa_robot) . ', Limit=' . $limit
            . ', Mode=' . ($isTesting ? 'testing' : 'normal'));

        if ($isTesting && $id_table) {
            // ID testing hanya diproses oleh grup yang memiliki toko pesan tersebut.
            $messages = SendMessage::where('id', $id_table)
                ->whereIn('store_id', array_keys($wa_robot))
                ->where('to_length', '>', 7)
                ->get();
        } else {
            $query = SendMessage::query()
                ->where('tipe', 1)
                ->whereIn('store_id', array_keys($wa_robot))
                ->where('to_length', '>', 7);

            if (!$isTesting) {
                $query->where(function ($query) {
                    $query->whereNull('xx_jeblast_state')->orWhere('xx_jeblast_state', 'FAILED');
                })->where(function ($query) {
                    // Beri jeda untuk penolakan sementara, termasuk rate limit.
                    $query->whereNull('xx_jeblast_requested_at')
                        ->orWhere('xx_jeblast_requested_at', '<=', Carbon::now()->subMinute());
                })->where('run', 0)
                    ->where('status', 0)
                    ->where('retry', '<', $max_retry)
                    ->where('created_at', '>=', Carbon::now()->subDays(3));
            }

            // Ambil kolom ID saja, agar next query tidak lagi memproses data SendMessage yang besar.
            $ids = $query->orderBy('id', 'desc')->limit($limit)->pluck('id');
            if ($ids->isEmpty()) {
                $this->line('Tidak ada pesan yang memenuhi filter.');
                return;
            }
            $messages = SendMessage::whereIn('id', $ids)->orderBy('id', 'desc')->get();
        }

        $counts = ['accepted' => 0, 'failed' => 0, 'skipped' => 0];
        foreach ($messages as $contact) {
            $sender = $isTesting ? $testingSender : ($wa_robot[$contact->store_id] ?? null);
            $recipient = $isTesting ? $testingRecipient : $contact->to;
            if (!$sender) {
                $counts['skipped']++;
                continue;
            }
            try {
                $result = $this->processMessage($contact, $sender, $recipient, $isTesting);
                $counts[$result]++;
                if (!$isTesting && $result === 'failed') {
                    // Rotasi dapat mengganti sender untuk pesan berikutnya dalam grup ini.
                    $wa_robot[$contact->store_id] = $this->getStoreSender($contact->store_id);
                }
            } catch (\Throwable $e) {
                $this->error('ID=' . $contact->id . ': proses pesan gagal (' . get_class($e) . ').');
                continue;
            }
            if ($result !== 'skipped') {
                usleep(random_int(300000, 500000));
            }
        }

        $this->line('Percobaan=' . ($counts['accepted'] + $counts['failed'])
            . ', diterima API=' . $counts['accepted'] . ', gagal=' . $counts['failed']
            . ', dilewati=' . $counts['skipped']);
    }



    protected function syncJeblastStatuses($groupId = null, int $limit = 50, int $reviewHours = 24, int $budgetSeconds = 45): void
    {
        $started = microtime(true);
        $query = SendMessage::query()
            ->whereIn('xx_jeblast_state', ['REQUESTING', 'UNKNOWN', 'ACCEPTED', 'QUEUED', 'SENDING', 'SENT'])
            ->where(function ($query) {
                $query->whereNull('xx_jeblast_requested_at')
                    ->orWhere('xx_jeblast_requested_at', '<=', Carbon::now()->subMinute());
            })
            ->where(function ($query) {
                $query->whereNull('xx_jeblast_checked_at')
                    ->orWhere('xx_jeblast_checked_at', '<=', Carbon::now()->subMinute());
            });
        if ($groupId !== null) {
            $query->whereIn('store_id', Store::select('kode')->where('xx_store_group_id', $groupId));
        }
        // Jangan membaca isi pesan pelanggan untuk pengecekan status.
        $messages = $query->select(['id', 'store_id', 'to', 'status', 'xx_jeblast_job_id',
            'xx_jeblast_state', 'xx_jeblast_sender', 'xx_jeblast_requested_at', 'created_at'])
            ->orderBy('xx_jeblast_checked_at')->orderBy('id')->limit($limit)->get();
        foreach ($messages as $contact) {
            if (microtime(true) - $started >= $budgetSeconds) {
                break;
            }
            try {
                $this->syncJeblastMessage($contact, $reviewHours);
            } catch (\Throwable $e) {
                $this->warn('ID=' . $contact->id . ': pemeriksaan status gagal (' . get_class($e) . ').');
            }
        }
    }

    protected function fetchJeblastStatus(string $key, string $jobId): object
    {
        $response = Http::withToken($key)->connectTimeout(5)->timeout(10)
            ->get('https://dashboard.jeblast.com/api/send-status', ['id' => $jobId, 'page' => 1]);
        return $this->decodeJeblastResponse($response->body(), $response->status(), 0, '');
    }

    private function syncJeblastMessage(SendMessage $contact, int $reviewHours = 24): void
    {
        $originalState = $contact->xx_jeblast_state;
        $jobId = (string) $contact->xx_jeblast_job_id;
        $updates = ['xx_jeblast_checked_at' => Carbon::now()];
        try {
            if ($jobId === '') {
                $this->warn('ID=' . $contact->id . ': job lama belum memiliki Job ID, ditahan untuk pemeriksaan.');
                return;
            }
            $sender = (string) $contact->xx_jeblast_sender;
            $key = $sender !== '' ? $this->getWaKey($sender) : null;
            if (!$key) {
                $this->warn('ID=' . $contact->id . ': token pengirim job tidak tersedia.');
                return;
            }
            $response = $this->fetchJeblastStatus($key, $jobId);
            if (($response->result ?? false) !== true || !is_array($response->data ?? null)) {
                $this->warn('ID=' . $contact->id . ': status Jeblast belum dapat diperiksa.');
                return;
            }
            foreach ($response->data as $job) {
                if (!is_object($job) || ($job->id ?? null) !== $jobId
                    || $this->normalizeJeblastRecipient((string) ($job->recipient ?? ''))
                        !== $this->normalizeJeblastRecipient((string) $contact->to)) {
                    continue;
                }
                $mapped = $this->jeblastStateUpdates((string) ($job->status ?? ''), $jobId);
                if ($mapped) {
                    $updates = array_merge($updates, $mapped);
                    break;
                }
            }
        } finally {
            $since = $contact->xx_jeblast_requested_at ?: $contact->created_at;
            // Hasil final tetap diterapkan walaupun diperoleh setelah batas pemeriksaan.
            $state = $updates['xx_jeblast_state'] ?? $originalState;
            if ($since && Carbon::parse($since)->lte(Carbon::now()->subHours($reviewHours))
                && in_array($state, ['REQUESTING', 'UNKNOWN', 'ACCEPTED', 'QUEUED', 'SENDING', 'SENT'], true)) {
                $updates = array_merge($updates, [
                    'xx_jeblast_state' => 'REVIEW',
                    'status' => $state === 'SENT' ? 1 : 2,
                    'run' => 0,
                    'status_message' => 'Perlu pemeriksaan manual: status Jeblast ' . $state
                        . ' melewati ' . $reviewHours . ' jam; job_id=' . $jobId,
                ]);
            }
            $changed = SendMessage::where('id', $contact->id)
                ->where('xx_jeblast_job_id', $contact->xx_jeblast_job_id)
                ->where('xx_jeblast_state', $originalState)->update($updates);
            if ($changed && ($updates['xx_jeblast_state'] ?? null) === 'REVIEW') {
                $this->notifyJeblastReview($contact, $updates['status_message']);
            } elseif ($changed && isset($updates['xx_jeblast_state'])) {
                $this->line('ID=' . $contact->id . ': Jeblast ' . $updates['xx_jeblast_state'] . '.');
            }
        }
    }

    protected function notifyJeblastReview(SendMessage $contact, string $reason): void
    {
        // Peringatan operasional tanpa isi pesan, nomor pelanggan, atau token.
        Log::warning('Antrean WhatsApp perlu pemeriksaan manual.', [
            'message_id' => $contact->id, 'store_id' => $contact->store_id,
            'job_id' => $contact->xx_jeblast_job_id, 'reason' => $reason,
        ]);
        $this->warn('ID=' . $contact->id . ': ' . $reason);
    }

    private function jeblastStateUpdates(string $state, string $jobId): array
    {
        $state = strtoupper($state);
        if (!in_array($state, ['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNCERTAIN'], true)) {
            return [];
        }
        return [
            'xx_jeblast_state' => $state,
            'status' => in_array($state, ['SENT', 'DELIVERED', 'READ'], true) ? 1
                : (in_array($state, ['FAILED', 'UNCERTAIN'], true) ? 2 : 0),
            'run' => 0,
            'status_message' => 'Jeblast ' . $state . '; job_id=' . $jobId,
        ];
    }

    private function normalizeJeblastRecipient(string $number): string
    {
        $number = preg_replace('/\D/', '', $number);
        return str_starts_with($number, '0') ? '62' . substr($number, 1) : $number;
    }

    protected function getStoreSender($storeId): ?string
    {
        return Store::query()
            ->leftJoin('xx_wa_phones as wa', 'wa.id', '=', 'mastergudang.xx_wa_phone_id')
            ->where('mastergudang.kode', $storeId)
            ->value('wa.wa_sender');
    }

    protected function getWaKey(string $sender): ?string
    {
        if (!array_key_exists($sender, $this->waKeys)) {
            $this->waKeys[$sender] = DB::table('xx_wa_phones')
                ->where('wa_sender', $sender)
                ->value('wa_key');
        }

        return $this->waKeys[$sender];
    }

    protected function claimMessage(SendMessage $contact): bool
    {
        // Cek status lagi agar data lama tidak mengirim pesan yang sudah diproses.
        $updated = SendMessage::where('id', $contact->id)
            ->where('run', 0)
            ->where('status', 0)
            ->where(function ($query) {
                $query->whereNull('xx_jeblast_state')->orWhere('xx_jeblast_state', 'FAILED');
            })
            ->update([
                'run' => 1,
                'xx_jeblast_state' => 'REQUESTING',
                'xx_jeblast_sender' => $contact->xx_jeblast_sender,
                'xx_jeblast_job_id' => $contact->xx_jeblast_job_id,
                'xx_jeblast_requested_at' => Carbon::now(),
            ]);

        if (!$updated) {
            return false;
        }

        // Sinkronkan nilai klaim agar save berikutnya benar-benar menulis run=0.
        $contact->run = 1;
        $contact->syncOriginalAttribute('run');
        return true;
    }

    protected function releaseMessage(SendMessage $contact): void
    {
        SendMessage::where('id', $contact->id)->where('run', 1)->update(['run' => 0]);
    }

    private function processMessage(SendMessage $contact, string $sender, string $recipient, bool $isTesting): string
    {
        $claimed = false;
        $saved = false;
        $requestStarted = false;
        $resultContact = $isTesting ? clone $contact : $contact;
        try {
            $filteredMessage = $this->removeNonKeyboardChars((string) $contact->message);
            $invalidReason = trim($filteredMessage) === ''
                ? 'Pesan gagal: isi pesan kosong setelah filter karakter.'
                : null;
            if (!$invalidReason && !preg_match('/^[1-9][0-9]{7,14}$/', $this->normalizeJeblastRecipient($recipient))) {
                $invalidReason = 'Pesan gagal: nomor tujuan tidak valid.';
            }
            if ($invalidReason) {
                if (!$isTesting && !$this->failInvalidMessage($contact, $invalidReason)) {
                    return 'skipped';
                }
                $this->error('ID=' . $contact->id . ': ' . $invalidReason);
                return 'failed';
            }
            $key = $this->getWaKey($sender);
            if (empty($key)) {
                $this->error('ID=' . $contact->id . ': API key tidak ditemukan untuk pengirim ' . $sender . '.');
                return 'skipped';
            }
            $data = [
                'api_key' => $key,
                'sender' => $sender,
                'number' => $recipient,
                'message' => $filteredMessage,
                'store_id' => (string) $contact->mastergudang?->nama,
                'transaction_id' => (string) $contact->id,
                'message_key' => 'send-message',
            ];
            // Testing membuat job sendiri agar tidak memakai job antrean pelanggan.
            $resultContact->xx_jeblast_job_id = $isTesting
                ? (string) Str::uuid()
                : ($contact->xx_jeblast_job_id ?: (string) Str::uuid());
            if ($isTesting) {
                $data['transaction_id'] = 'testing-' . $resultContact->xx_jeblast_job_id;
            }
            $data = $this->withJeblastJobId($data, $resultContact);
            // Pastikan payload valid sebelum status REQUESTING ditulis.
            json_encode($data, JSON_THROW_ON_ERROR);
            if (!$isTesting) {
                $resultContact->xx_jeblast_sender = $sender;
                if (!$this->claimMessage($resultContact)) {
                    $this->line('ID=' . $contact->id . ': sedang diproses atau menunggu status Jeblast.');
                    return 'skipped';
                }
                $claimed = true;
                $resultContact->xx_jeblast_state = 'REQUESTING';
            }
            $this->line('ID=' . $contact->id . ', sender=' . $sender . ', tujuan=' . $recipient);
            $requestStarted = true;
            $res = $this->sendJeblastRequest($data);
            $accepted = ($res->result ?? false) === true && empty($res->dry_run);
            if ($accepted) {
                $this->recordJeblastAccepted($resultContact, $res);
            } else {
                $reason = $res->message ?? 'Respons Jeblast tidak tersedia.';
                $kind = $this->classifyJeblastFailure($res);
                $resultContact->status = 0;
                $resultContact->xx_jeblast_state = 'FAILED';
                if ($kind === 'UNKNOWN') {
                    $resultContact->xx_jeblast_state = 'UNKNOWN';
                } elseif (in_array($kind, ['AUTH', 'REVIEW'], true)) {
                    $resultContact->xx_jeblast_state = 'REVIEW';
                    $resultContact->status = 2;
                } elseif ($kind === 'INVALID') {
                    $resultContact->xx_jeblast_state = 'INVALID';
                    $resultContact->status = 2;
                } elseif (!$isTesting) {
                    $resultContact = $this->handleFailedSend($resultContact, $kind === 'DEVICE');
                }
                $resultContact->status_message = $reason;
                $this->error('ID=' . $contact->id . ', tujuan=' . $recipient . ': ' . $reason);
            }
            if (!$isTesting) {
                $resultContact->run = 0;
                if (!$resultContact->save()) {
                    throw new \RuntimeException('Status pesan tidak berhasil disimpan.');
                }
                $saved = true;
                if ($resultContact->xx_jeblast_state === 'REVIEW') {
                    $this->notifyJeblastReview($resultContact, 'Penolakan API memerlukan pemeriksaan konfigurasi/job.');
                }
            } else {
                $this->line('Testing: data antrean asli tidak diubah.');
            }
            return $accepted ? 'accepted' : 'failed';
        } catch (\Throwable $e) {
            $this->error('ID=' . $contact->id . ', tujuan=' . $recipient
                . ': proses gagal (' . get_class($e) . ').');
            if ($claimed && $requestStarted) {
                $this->warn('Request mungkin sudah diterima; pesan ditahan untuk pemeriksaan, tidak dikirim ulang otomatis.');
            }
            return 'failed';
        } finally {
            if ($claimed && !$saved) {
                try {
                    // REQUESTING tetap tersimpan sehingga pelepasan run tidak mengizinkan kirim ulang.
                    $this->releaseMessage($resultContact);
                } catch (\Throwable $e) {
                    $this->error('ID=' . $contact->id . ': gagal melepas run (' . get_class($e) . ').');
                }
            }
        }
    }

    protected function sendJeblastRequest(array $data): object
    {
        $payload = json_encode($data, JSON_THROW_ON_ERROR);
        $curl = curl_init();
        try {
            curl_setopt_array($curl, [
                CURLOPT_URL => 'https://dashboard.jeblast.com/api/public/send-message',
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_ENCODING => '',
                CURLOPT_MAXREDIRS => 10,
                CURLOPT_CONNECTTIMEOUT => 5,
                // CURLOPT_TIMEOUT => 30,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                CURLOPT_CUSTOMREQUEST => 'POST',
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            ]);
            $response = curl_exec($curl);
            $curlErrno = curl_errno($curl);
            $curlError = curl_error($curl);
            $httpStatus = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
            $this->line('Jeblast HTTP=' . $httpStatus . ', cURL=' . $curlErrno
                . ', bytes=' . (is_string($response) ? strlen($response) : 0));
            return $this->decodeJeblastResponse($response, $httpStatus, $curlErrno, $curlError);
        } finally {
            curl_close($curl);
        }
    }

    private function decodeJeblastResponse($response, int $httpStatus, int $curlErrno, string $curlError): object
    {
        if ($response === false || $curlErrno !== 0) {
            return (object) ['result' => false, 'result_is_valid' => false, 'curl_error' => $curlError, 'curl_errno' => $curlErrno, 'http_status' => $httpStatus, 'message' => 'cURL error ' . $curlErrno . ': ' . $curlError];
        }
        if ($response === '') {
            return (object) ['result' => false, 'result_is_valid' => false, 'curl_error' => null, 'curl_errno' => 0, 'http_status' => $httpStatus, 'message' => 'Respons Jeblast kosong (HTTP ' . $httpStatus . ').'];
        }
        $res = json_decode($response);
        if (json_last_error() !== JSON_ERROR_NONE || !is_object($res)) {
            return (object) ['result' => false, 'result_is_valid' => false, 'curl_error' => null, 'curl_errno' => 0, 'http_status' => $httpStatus, 'message' => 'Respons Jeblast bukan objek JSON valid (HTTP ' . $httpStatus . '): ' . json_last_error_msg()];
        }
        // curl_error dari PHP lokal; pesan kegagalan API tetap dari Jeblast.
        $res->curl_error = isset($res->curl_error) && is_string($res->curl_error) ? $res->curl_error : null;
        $res->curl_errno = 0;
        $res->http_status = $httpStatus;
        $res->result_is_valid = isset($res->result) && is_bool($res->result);
        if ($httpStatus < 200 || $httpStatus >= 300) {
            $res->result = false;
            $res->message = 'HTTP ' . $httpStatus . ': ' . ($res->message ?? 'Request ditolak Jeblast.');
        } elseif (!isset($res->result) || !is_bool($res->result)) {
            $res->result = false;
            $res->message = $res->message ?? 'Field result pada respons Jeblast tidak valid.';
        }
        return $res;
    }

    private function withJeblastJobId(array $data, SendMessage $contact): array
    {
        // Job ID dikirim kembali agar Jeblast mengenali job yang sudah dibuat.
        if (!empty($contact->xx_jeblast_job_id)) {
            $data['job_id'] = $contact->xx_jeblast_job_id;
        }

        return $data;
    }


    private function recordJeblastAccepted($contact, object $res): void
    {
        $job = is_array($res->data ?? null) ? ($res->data[0] ?? null) : null;
        $jobId = $job->id ?? null;
        if (is_string($jobId) && trim($jobId) !== '') {
            $contact->xx_jeblast_job_id = trim($jobId);
        }
        $mapped = $this->jeblastStateUpdates((string) ($job->status ?? ''),
            (string) $contact->xx_jeblast_job_id);
        if ($mapped) {
            foreach ($mapped as $field => $value) {
                $contact->$field = $value;
            }
        } else {
            $contact->status = 0;
            $contact->xx_jeblast_state = ($res->queued ?? false) === true ? 'QUEUED' : 'ACCEPTED';
            $contact->status_message = 'Jeblast ' . $contact->xx_jeblast_state
                . '; job_id=' . ($contact->xx_jeblast_job_id ?: '-');
        }
        $this->line('Request diterima API: ' . $contact->status_message);
    }

    private function classifyJeblastFailure(object $res): string
    {
        $http = $res->http_status ?? null;
        if (!empty($res->curl_errno) || $http === 0 || ($http !== null && $http >= 500)
            || ($res->result_is_valid ?? is_bool($res->result ?? null)) !== true) {
            return 'UNKNOWN';
        }
        if (in_array($http, [400, 413, 422], true)) {
            return 'INVALID';
        }
        if (in_array($http, [401, 403], true)) {
            return 'AUTH';
        }
        if ($http === 429) {
            return 'THROTTLED';
        }
        // Konflik 409 saja belum membuktikan perangkat pengirim bermasalah.
        $message = strtolower((string) ($res->message ?? ''));
        if (preg_match('/(device|perangkat|sender|pengirim).*(inactive|not active|offline|disconnect|nonaktif|tidak aktif|belum terhubung)/', $message)) {
            return 'DEVICE';
        }
        return 'REVIEW';
    }

    protected function failInvalidMessage(SendMessage $contact, string $reason): bool
    {
        return SendMessage::where('id', $contact->id)->where('run', 0)->where('status', 0)
            ->where(function ($query) {
                $query->whereNull('xx_jeblast_state')->orWhere('xx_jeblast_state', 'FAILED');
            })->update(['status' => 2, 'run' => 0, 'xx_jeblast_state' => 'INVALID',
                'status_message' => $reason]) > 0;
    }

    private function handleFailedSend($data, bool $rotateDevice = true)
    {
        $data->retry += 1;

        $retry = $data->retry;

        /*
        retry:
        1-3   => nomor utama
        4-5   => cadangan 1
        6-7   => cadangan 2
        8-9   => cadangan 3
        */

        $needRotate = false;

        if ($retry == 3) {
            $needRotate = true;
        }

        if ($retry == 5) {
            $needRotate = true;
        }

        if ($retry == 7) {
            $needRotate = true;
        }

        if ($rotateDevice && $needRotate) {
            $hasBackup = $this->rotateWaNumber($data);

            if ($hasBackup && !$hasBackup->xx_wa_cadangan1_id) {
                $this->notifyAdminNoBackup($data, $hasBackup);
            }
        }

        if ($retry >= 9) {
            if ($rotateDevice) {
                $this->rotateWaNumber($data);
            }

            // if (!$hasBackup->xx_wa_phone_id) {
            //     $this->notifyAdminNoBackup($data);
            // }

            $data->status_message = '';
            $data->status = 2;
        }

        return $data;
    }


    private function rotateWaNumber($data)
    {
        // Kunci toko selama perubahan nomor saja; request notifikasi di luar transaksi.
        return DB::transaction(function () use ($data) {
            $store = Store::where('kode', $data->store_id)->lockForUpdate()->first();
            if (!$store) {
                $this->warn('Rotasi dilewati: toko ' . $data->store_id . ' tidak ditemukan.');
                return false;
            }
            // Pesan dari snapshot sender lama tidak boleh merotasi sender yang baru.
            if (!empty($data->xx_jeblast_sender)) {
                $currentSender = DB::table('xx_wa_phones')->where('id', $store->xx_wa_phone_id)->value('wa_sender');
                if ($currentSender !== $data->xx_jeblast_sender) {
                    return false;
                }
            }
            if (!$store->xx_wa_cadangan1_id) {
                return false;
            }
            $store->xx_wa_phone_id = $store->xx_wa_cadangan1_id;
            $store->xx_wa_cadangan1_id = $store->xx_wa_cadangan2_id;
            $store->xx_wa_cadangan2_id = $store->xx_wa_cadangan3_id;
            $store->xx_wa_cadangan3_id = null;
            if (!$store->save()) {
                throw new \RuntimeException('Rotasi pengirim tidak berhasil disimpan.');
            }
            return $store;
        });
    }

    public function notifyAdminNoBackup($data, ?Store $store = null)
    {
        // Gunakan objek hasil rotasi jika tersedia.
        $store = $store ?? Store::where('kode', $data->store_id)->first();
        if (!$store) {
            $this->warn('Notifikasi dilewati: toko ' . $data->store_id . ' tidak ditemukan.');
            return;
        }
        $setting = Setting::where('key', 'wa_info_cadangan')->first();
        if (!$setting || trim((string) $setting->value) === '') {
            $this->warn('Notifikasi dilewati: setting wa_info_cadangan belum diisi.');
            return;
        }
        $telps = array_unique(array_filter(array_map('trim', explode(',', $setting->value)),
            fn ($phone) => $phone !== ''));
        if (empty($telps)) {
            $this->warn('Notifikasi dilewati: daftar nomor admin kosong.');
            return;
        }

        foreach ($telps as $telp) {
            if (!$this->send_wa_aptana($telp, $store->xx_name)) {
                $this->warn('Notifikasi Aptana gagal untuk toko ' . $data->store_id . '.');
            }
        }
    }

    public function send_wa_aptana($phone, $store_name)
    {
        try {
            $number = preg_replace('/\D/', '', (string) $phone);
            if ($number === '') {
                return false;
            }
            if (str_starts_with($number, '0')) {
                $number = '62' . substr($number, 1);
            } elseif (!str_starts_with($number, '62')) {
                $number = '62' . $number;
            }
            if (!preg_match('/^628[0-9]{7,11}$/', $number)) {
                return false;
            }

            $token = config('services.aptana.token');
            if (empty($token)) {
                $this->warn('Notifikasi Aptana dilewati: APTANA_API_TOKEN belum dikonfigurasi.');
                return false;
            }

            $template = 'info_wa_cadangan_rev';
            $sender = '62882022724431'; // Doran Sukses Indonesia

            $headers = [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
                'Api-Token' => $token,
            ];

            $curlopt_url = 'https://api-multichannel.aptana.co.id/api/v1/messages';

            $data = [
                'channel' => 'wa',
                'sender' => $sender,
                'recipient' => $number,
                'type' => 'template',
                'template' => [
                    'name' => $template,
                    'language' => [
                        'code' => 'id',
                    ],
                    'components' => [
                        [
                            'type' => 'body',
                            'parameters' => [
                                [
                                    'type' => 'text',
                                    'text' => (string) $store_name,
                                ],
                            ],
                        ],
                    ],
                ],
            ];

            $response = Http::withHeaders($headers)
                ->connectTimeout(5)
                // ->timeout(30)
                ->timeout(15)
                ->post($curlopt_url, $data);

            $accepted = $this->isAptanaAccepted($response->status(), $response->body());
            if (!$accepted) {
                $this->warn('Aptana menolak request (HTTP ' . $response->status() . ').');
            }
            return $accepted;
        } catch (\Throwable $e) {
            // Jangan cetak exception yang mungkin memuat token atau payload.
            $this->warn('Request Aptana gagal (' . get_class($e) . ').');
            return false;
        }
    }

    private function isAptanaAccepted(int $httpStatus, string $body): bool
    {
        if ($httpStatus < 200 || $httpStatus >= 300) {
            return false;
        }
        $response = json_decode($body);
        if (json_last_error() !== JSON_ERROR_NONE || !is_object($response)) {
            return false;
        }
        if (!empty($response->error) || !empty($response->errors)) {
            return false;
        }
        if (property_exists($response, 'success') && $response->success !== true) {
            return false;
        }
        // Modul Aptana lain di proyek memakai status numerik pada respons JSON.
        if (property_exists($response, 'status')) {
            return is_numeric($response->status)
                && (int) $response->status >= 200 && (int) $response->status < 300;
        }

        return ($response->success ?? false) === true;
    }

    public function removeNonKeyboardChars($text)
    {
        // Pola regex untuk karakter yang diizinkan (karakter keyboard umum)
        $pattern = '/[^a-zA-Z0-9\s!@#$%^&*()\-_=\[\]{}|<>?\/;:.,]/';

        // Mengganti karakter yang tidak diizinkan dengan string kosong
        $cleaned_text = preg_replace($pattern, '', $text);

        return $cleaned_text;
    }

}
