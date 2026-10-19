<?php

namespace App\Http\Requests\Webhook;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class JeblastDispatchStatusRequest extends FormRequest
{
    public const STATUSES = ['QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNCERTAIN'];

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $rules = [
            'event_id' => ['required', 'uuid'],
            'sequence' => ['required', 'integer', 'min:0', 'max:'.PHP_INT_MAX],
            'event' => ['required', Rule::in(['dispatch.status_changed', 'dispatch.webhook.test'])],
            'previous_status' => ['present', 'nullable', Rule::in(self::STATUSES)],
            'dispatch' => ['required', 'array:id,job_id,device_id,user_id,transaction_id,store_id,message_key,campaign_id,source,recipient,status,message_id,attempts,error,created_at,updated_at,sent_at,delivered_at,read_at'],
            'dispatch.id' => ['required', 'uuid'],
            'dispatch.device_id' => ['required', 'uuid'],
            'dispatch.user_id' => ['required', 'uuid'],
            'dispatch.recipient' => ['required', 'string', 'regex:/^[0-9]{8,15}$/'],
            'dispatch.status' => ['required', Rule::in(self::STATUSES)],
            'dispatch.source' => ['required', 'string', 'max:50'],
            'dispatch.attempts' => ['required', 'integer', 'min:0', 'max:2147483647'],
            'dispatch.error' => ['present', 'nullable', 'string', 'max:10000'],
        ];
        if ($this->input('event') === 'dispatch.webhook.test') {
            return array_merge(array_intersect_key($rules, array_flip(['event_id', 'sequence', 'event', 'previous_status'])), [
                'previous_status' => ['present', 'prohibited'],
                'dispatch' => ['present', 'prohibited'],
                'occurred_at' => ['required', 'date', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/'],
            ]);
        }
        foreach (['job_id', 'transaction_id', 'store_id', 'message_key', 'campaign_id', 'message_id'] as $field) {
            $rules['dispatch.'.$field] = ['present', 'nullable', 'string', 'max:191'];
        }
        foreach (['occurred_at', 'dispatch.created_at', 'dispatch.updated_at', 'dispatch.sent_at', 'dispatch.delivered_at', 'dispatch.read_at'] as $field) {
            $nullable = in_array($field, ['dispatch.sent_at', 'dispatch.delivered_at', 'dispatch.read_at'], true);
            $rules[$field] = [$nullable ? 'present' : 'required', $nullable ? 'nullable' : 'filled', 'date',
                'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/'];
        }

        return $rules;
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if (! $this->isJson()) {
                $validator->errors()->add('payload', 'Content-Type harus application/json.');
            }
            if (! is_string($this->input('event_id')) || $this->header('X-Jeblast-Event-Id') !== $this->input('event_id')) {
                $validator->errors()->add('event_id', 'X-Jeblast-Event-Id wajib sama dengan event_id pada payload.');
            }
        });
    }
}
