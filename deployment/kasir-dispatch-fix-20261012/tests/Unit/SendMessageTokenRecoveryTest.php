<?php

namespace Tests\Unit;

use App\Console\Commands\SendMessageCommand;
use Mockery;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class SendMessageTokenRecoveryTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function command()
    {
        return Mockery::mock(SendMessageCommand::class)->makePartial()->shouldAllowMockingProtectedMethods();
    }

    private function payload(): array
    {
        return ['api_key' => 'stale-key', 'sender' => '628111111111', 'number' => '6281234567890',
            'job_id' => 'stable-request-id', 'transaction_id' => '5558236', 'message' => 'Test'];
    }

    private function invoke($command): object
    {
        return (new ReflectionMethod(SendMessageCommand::class, 'sendJeblastWithTokenRecovery'))
            ->invoke($command, $this->payload(), '628111111111');
    }

    public function test_refreshes_after_explicit_token_rejection_and_retries_same_payload_once(): void
    {
        $command = $this->command();
        $rejected = (object) ['result' => false, 'http_status' => 200, 'message' => 'Token tidak valid'];
        $accepted = (object) ['result' => true, 'queued' => true];
        $command->shouldReceive('sendJeblastRequest')->with($this->payload())->once()->ordered()->andReturn($rejected);
        $command->shouldReceive('refreshWaKey')->with('628111111111', 'stale-key')->once()->ordered()->andReturn('fresh-key');
        $next = $this->payload();
        $next['api_key'] = 'fresh-key';
        $command->shouldReceive('sendJeblastRequest')->with($next)->once()->ordered()->andReturn($accepted);
        $this->assertSame($accepted, $this->invoke($command));
    }

    public function test_does_not_retry_timeout_server_failure_conflict_or_success(): void
    {
        foreach ([
            ['result' => false, 'http_status' => 0, 'curl_errno' => 28, 'message' => 'Timeout'],
            ['result' => false, 'http_status' => 503, 'message' => 'Token tidak valid'],
            ['result' => false, 'http_status' => 409, 'message' => 'Konflik payload'],
            ['result' => true, 'http_status' => 200],
        ] as $response) {
            $command = $this->command();
            $res = (object) $response;
            $command->shouldReceive('sendJeblastRequest')->with($this->payload())->once()->andReturn($res);
            $command->shouldNotReceive('refreshWaKey');
            $this->assertSame($res, $this->invoke($command));
        }
    }

    public function test_no_second_refresh_if_replacement_token_is_also_rejected(): void
    {
        $command = $this->command();
        $res = (object) ['result' => false, 'http_status' => 401, 'message' => 'Token tidak valid'];
        $command->shouldReceive('sendJeblastRequest')->twice()->andReturn($res);
        $command->shouldReceive('refreshWaKey')->with('628111111111', 'stale-key')->once()->andReturn('fresh-key');
        $this->assertSame($res, $this->invoke($command));
    }

    public function test_does_not_retry_when_token_cannot_be_refreshed_or_has_not_changed(): void
    {
        foreach ([null, 'stale-key'] as $key) {
            $command = $this->command();
            $res = (object) ['result' => false, 'http_status' => 200, 'message' => 'Token tidak valid'];
            $command->shouldReceive('sendJeblastRequest')->once()->andReturn($res);
            $command->shouldReceive('refreshWaKey')->once()->andReturn($key);
            $this->assertSame($res, $this->invoke($command));
        }
    }
}
