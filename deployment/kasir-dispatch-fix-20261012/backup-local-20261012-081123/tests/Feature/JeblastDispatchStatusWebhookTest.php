<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class JeblastDispatchStatusWebhookTest extends TestCase
{
    private const URL = '/api/webhooks/jeblast/dispatch-status';

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'database.default' => 'dispatch_webhook_test',
            'database.connections.dispatch_webhook_test' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''],
            'services.jeblast_dashboard.webhook_key' => 'test-webhook-key',
            'cache.default' => 'array',
        ]);
        // Hanya skema SQLite di memori, tanpa mengakses database aplikasi.
        $migration = require database_path('migrations/2026_10_11_110000_create_jeblast_dispatch_webhook_tables.php');
        $migration->up();
        Schema::create('xx_send_message', function (Blueprint $table) {
            $table->id();
            $table->integer('tipe');
            $table->string('to');
            $table->integer('run');
            $table->integer('status');
            $table->string('xx_jeblast_job_id')->nullable();
            $table->string('xx_jeblast_state')->nullable();
            $table->timestamp('xx_jeblast_checked_at')->nullable();
            $table->text('status_message')->nullable();
            $table->timestamps();
        });
        DB::table('xx_send_message')->insert([
            'id' => 1, 'tipe' => 1, 'to' => '081234567890', 'run' => 0, 'status' => 0,
            'xx_jeblast_job_id' => '2d47b912-7b58-48cc-94e9-15d4e2c807f9', 'xx_jeblast_state' => 'ACCEPTED',
        ]);
    }

    protected function tearDown(): void
    {
        DB::purge('dispatch_webhook_test');
        parent::tearDown();
    }

    private function payload(string $state = 'DELIVERED', int $sequence = 123): array
    {
        return [
            'event_id' => (string) Str::uuid(), 'sequence' => $sequence,
            'event' => 'dispatch.status_changed', 'occurred_at' => '2026-10-11T03:00:00.000Z',
            'previous_status' => 'SENT',
            'dispatch' => [
                'id' => '2d47b912-7b58-48cc-94e9-15d4e2c807f9', 'job_id' => 'JOB-KASIR-001',
                'device_id' => 'd737fb52-e029-49bb-8ddc-c3d5c3265ff2',
                'user_id' => '79f317fe-61d3-4c8c-b974-56e8c66ed403',
                'transaction_id' => '1', 'store_id' => 'CABANG-01', 'message_key' => 'struk',
                'campaign_id' => null, 'source' => 'API', 'recipient' => '6281234567890',
                'status' => $state, 'message_id' => 'ID-pesan-WhatsApp', 'attempts' => 1, 'error' => null,
                'created_at' => '2026-10-11T02:59:57.000Z', 'updated_at' => '2026-10-11T03:00:00.000Z',
                'sent_at' => '2026-10-11T02:59:59.000Z', 'delivered_at' => '2026-10-11T03:00:00.000Z', 'read_at' => null,
            ],
        ];
    }

    private function send(array $payload)
    {
        return $this->withToken('test-webhook-key')->postJson(self::URL, $payload, ['X-Jeblast-Event-Id' => $payload['event_id']]);
    }

    public static function states(): array
    {
        return [['QUEUED', 0], ['PROCESSING', 0], ['SENT', 1], ['DELIVERED', 1], ['READ', 1], ['FAILED', 2], ['UNCERTAIN', 2]];
    }

    #[DataProvider('states')]
    public function test_persists_event_and_updates_matching_message(string $state, int $status): void
    {
        $payload = $this->payload($state);
        $this->send($payload)->assertOk()->assertJsonPath('data.updated', true)->assertJsonPath('data.messages_updated', 1);
        $this->assertDatabaseHas('xx_jeblast_dispatches', ['id' => $payload['dispatch']['id'], 'sequence' => 123, 'status' => $state]);
        $this->assertDatabaseHas('xx_send_message', ['id' => 1, 'xx_jeblast_state' => $state, 'status' => $status, 'run' => 0]);
        $stored = DB::table('xx_jeblast_dispatch_events')->value('payload');
        $this->assertEquals($payload, json_decode($stored, true));
    }

    public function test_deduplicates_all_received_events_and_ignores_old_or_equal_sequences(): void
    {
        $first = $this->payload('SENT', 123);
        $latest = $this->payload('READ', 125);
        $this->send($first)->assertOk();
        $this->send($latest)->assertOk();
        $this->send($first)->assertOk()->assertJsonPath('data.duplicate', true);
        $this->send($this->payload('FAILED', 124))->assertOk()->assertJsonPath('data.updated', false);
        $this->send($this->payload('FAILED', 125))->assertOk()->assertJsonPath('data.updated', false);
        $this->assertDatabaseCount('xx_jeblast_dispatch_events', 4);
        $this->assertDatabaseHas('xx_jeblast_dispatches', ['sequence' => 125, 'status' => 'READ']);
        $this->assertDatabaseHas('xx_send_message', ['id' => 1, 'xx_jeblast_state' => 'READ']);
    }

    public function test_sequence_is_independent_for_each_dispatch(): void
    {
        $this->send($this->payload('READ', 125))->assertOk();
        $other = $this->payload('QUEUED', 0);
        $other['dispatch']['id'] = (string) Str::uuid();
        $other['dispatch']['job_id'] = null;
        $other['previous_status'] = null;
        $this->send($other)->assertOk()->assertJsonPath('data.updated', true)->assertJsonPath('data.messages_updated', 0);
        $this->assertDatabaseCount('xx_jeblast_dispatches', 2);
    }

    public function test_unknown_dispatch_wrong_recipient_and_busy_message_are_still_persisted(): void
    {
        $unknown = $this->payload();
        $unknown['dispatch']['id'] = (string) Str::uuid();
        $this->send($unknown)->assertOk()->assertJsonPath('data.messages_updated', 0);
        $wrongRecipient = $this->payload('READ', 124);
        $wrongRecipient['dispatch']['recipient'] = '6289999999999';
        $this->send($wrongRecipient)->assertOk()->assertJsonPath('data.messages_updated', 0);
        DB::table('xx_send_message')->update(['run' => 1]);
        $this->send($this->payload('READ', 125))->assertOk()->assertJsonPath('data.messages_updated', 0);
        $this->assertDatabaseCount('xx_jeblast_dispatch_events', 3);
        $this->assertDatabaseHas('xx_send_message', ['id' => 1, 'xx_jeblast_state' => 'ACCEPTED', 'run' => 1]);
    }

    public function test_matches_dispatch_id_even_without_job_id_and_ignores_extra_metadata(): void
    {
        $payload = $this->payload('READ');
        $payload['dispatch']['job_id'] = null;
        $payload['mode'] = 'preview';
        $payload['note'] = 'Metadata tambahan.';
        $this->send($payload)->assertOk()->assertJsonPath('data.messages_updated', 1);
        $this->assertDatabaseHas('xx_send_message', [
            'id' => 1, 'xx_jeblast_state' => 'READ', 'status' => 1,
            'status_message' => 'Jeblast READ; dispatch_id='.$payload['dispatch']['id'],
        ]);
    }

    public function test_job_id_match_alone_does_not_update_message(): void
    {
        $payload = $this->payload();
        DB::table('xx_send_message')->where('id', 1)->update([
            'xx_jeblast_job_id' => $payload['dispatch']['job_id'],
        ]);
        $this->send($payload)->assertOk()->assertJsonPath('data.updated', true)->assertJsonPath('data.messages_updated', 0);
        $this->assertDatabaseHas('xx_send_message', ['id' => 1, 'xx_jeblast_state' => 'ACCEPTED']);
    }

    public function test_transaction_id_must_match_message_id(): void
    {
        foreach (['2', null, 'testing-1', '1invalid'] as $index => $transactionId) {
            $payload = $this->payload('READ', 123 + $index);
            $payload['dispatch']['transaction_id'] = $transactionId;
            $this->send($payload)->assertOk()->assertJsonPath('data.updated', true)->assertJsonPath('data.messages_updated', 0);
        }
        $this->assertDatabaseHas('xx_send_message', ['id' => 1, 'xx_jeblast_state' => 'ACCEPTED']);
    }

    public function test_rejects_missing_or_wrong_key_and_unconfigured_webhook(): void
    {
        $payload = $this->payload();
        $this->postJson(self::URL, $payload)->assertUnauthorized();
        $this->withToken('wrong')->postJson(self::URL, $payload)->assertUnauthorized();
        config(['services.jeblast_dashboard.webhook_key' => '']);
        $this->send($payload)->assertStatus(503);
        $this->assertDatabaseCount('xx_jeblast_dispatch_events', 0);
    }

    public function test_rejects_invalid_header_envelope_status_and_timestamp(): void
    {
        $payload = $this->payload();
        $this->withToken('test-webhook-key')->postJson(self::URL, $payload)->assertUnprocessable();
        $this->withToken('test-webhook-key')->postJson(self::URL, $payload, ['X-Jeblast-Event-Id' => (string) Str::uuid()])->assertUnprocessable();
        foreach (['event' => 'other.event', 'sequence' => -1, 'event_id' => 'invalid', 'occurred_at' => 'yesterday'] as $key => $value) {
            $invalid = $payload;
            $invalid[$key] = $value;
            $this->send($invalid)->assertUnprocessable();
        }
        foreach (['status' => 'OTHER', 'attempts' => -1, 'sent_at' => 'invalid', 'recipient' => 'invalid'] as $key => $value) {
            $invalid = $payload;
            $invalid['dispatch'][$key] = $value;
            $this->send($invalid)->assertUnprocessable();
        }
        $this->assertDatabaseCount('xx_jeblast_dispatch_events', 0);
    }

    public function test_rejects_reuse_of_event_id_for_another_dispatch(): void
    {
        $payload = $this->payload();
        $this->send($payload)->assertOk();
        $payload['dispatch']['id'] = (string) Str::uuid();
        $this->send($payload)->assertStatus(409);
        $this->assertDatabaseCount('xx_jeblast_dispatches', 1);
        $this->assertDatabaseCount('xx_jeblast_dispatch_events', 1);
    }

    public function test_database_failure_rolls_back_event_and_dispatch_instead_of_acknowledging(): void
    {
        Schema::drop('xx_send_message');
        $this->withoutExceptionHandling();
        try {
            $this->send($this->payload());
            $this->fail('Kegagalan penyimpanan tidak boleh menghasilkan HTTP 2xx.');
        } catch (QueryException $e) {
            $this->assertDatabaseCount('xx_jeblast_dispatch_events', 0);
            $this->assertDatabaseCount('xx_jeblast_dispatches', 0);
        }
    }
}
