<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Requests\Webhook\JeblastDispatchStatusRequest;
use App\Services\JeblastDispatchWebhookService;
use Illuminate\Routing\Controller;

class JeblastDispatchStatusController extends Controller
{
    public function __invoke(JeblastDispatchStatusRequest $request, JeblastDispatchWebhookService $service)
    {
        if ($request->validated('event') === 'dispatch.webhook.test') {
            return response()->json([
                'result' => true,
                'message' => 'Tes webhook status Jeblast berhasil diterima.',
                'data' => ['event_id' => $request->validated('event_id'), 'updated' => false, 'messages_updated' => 0],
            ]);
        }
        $summary = $service->store($request->validated());

        return response()->json([
            'result' => true,
            'message' => 'Event status pengiriman WhatsApp sudah tersimpan.',
            'data' => $summary,
        ]);
    }
}
