<?php

namespace Tests\Feature;

use App\Services\JeblastDashboardService;
use App\Services\JeblastDeviceTokenService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\TestCase;

class JeblastDeviceTokenServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['database.default' => 'token_recovery_test', 'database.connections.token_recovery_test' => [
            'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '',
        ]]);
        Schema::create('xx_wa_phones', function (Blueprint $table) {
            $table->id();
            $table->string('wa_sender');
            $table->string('wa_key');
            $table->string('id_device')->nullable();
        });
        Schema::create('mastergudang', function (Blueprint $table) {
            $table->id();
            $table->integer('xx_wa_phone_id');
            $table->string('xx_wa_doran_key');
        });
        DB::table('xx_wa_phones')->insert(['id' => 1, 'wa_sender' => '628111111111', 'wa_key' => 'stale-key', 'id_device' => 'device-1']);
        DB::table('mastergudang')->insert(['id' => 319, 'xx_wa_phone_id' => 1, 'xx_wa_doran_key' => 'stale-key']);
    }

    protected function tearDown(): void
    {
        DB::purge('token_recovery_test');
        parent::tearDown();
    }

    private function lookup(array $devices): void
    {
        $api = Mockery::mock(JeblastDashboardService::class);
        $api->shouldReceive('searchByPhone')->with('628111111111')->once()->andReturn($devices);
        $this->app->instance(JeblastDashboardService::class, $api);
    }

    private function device(): array
    {
        return ['id' => 'device-1', 'number' => '628111111111', 'token' => 'fresh-key'];
    }

    public function test_refreshes_only_matching_device_and_updates_store_mirror(): void
    {
        DB::table('xx_wa_phones')->insert(['id' => 2, 'wa_sender' => '628222222222', 'wa_key' => 'other-key', 'id_device' => 'device-2']);
        $this->lookup([$this->device()]);
        $this->assertSame('fresh-key', app(JeblastDeviceTokenService::class)->refresh('628111111111', 'stale-key'));
        $this->assertDatabaseHas('xx_wa_phones', ['id' => 1, 'wa_key' => 'fresh-key']);
        $this->assertDatabaseHas('mastergudang', ['id' => 319, 'xx_wa_doran_key' => 'fresh-key']);
        $this->assertDatabaseHas('xx_wa_phones', ['id' => 2, 'wa_key' => 'other-key']);
    }

    public function test_rejects_ambiguous_wrong_device_missing_token_and_unchanged_token(): void
    {
        $cases = [[], [$this->device(), $this->device()],
            [array_replace($this->device(), ['id' => 'wrong-device'])],
            [array_replace($this->device(), ['number' => '628222222222'])],
            [array_replace($this->device(), ['token' => null])],
            [array_replace($this->device(), ['token' => 'stale-key'])]];
        foreach ($cases as $devices) {
            $this->lookup($devices);
            $this->assertNull(app(JeblastDeviceTokenService::class)->refresh('628111111111', 'stale-key'));
            $this->assertDatabaseHas('xx_wa_phones', ['id' => 1, 'wa_key' => 'stale-key']);
            $this->assertDatabaseHas('mastergudang', ['id' => 319, 'xx_wa_doran_key' => 'stale-key']);
        }
    }

    public function test_does_not_overwrite_token_changed_by_concurrent_webhook(): void
    {
        DB::table('xx_wa_phones')->where('id', 1)->update(['wa_key' => 'newer-key']);
        $this->lookup([$this->device()]);
        $this->assertNull(app(JeblastDeviceTokenService::class)->refresh('628111111111', 'stale-key'));
        $this->assertDatabaseHas('xx_wa_phones', ['id' => 1, 'wa_key' => 'newer-key']);
    }
}
