<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Requests\Webhook\JeblastDispatchStatusRequest;
use App\Services\JeblastDispatchWebhookService;
use Illuminate\Routing\Controller;

class JeblastDispatchStatusController extends Controller
{
    public function __invoke(JeblastDispatchStatusRequest $request, JeblastDispatchWebhookService $service)
    {
        $summary = $service->store($request->validated());

        return response()->json([
            'result' => true,
            'message' => 'Event status pengiriman WhatsApp sudah tersimpan.',
            'data' => $summary,
        ]);
    }
}
