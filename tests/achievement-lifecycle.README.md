This file documents the regression scope covered by `achievement-lifecycle.test.mjs`:

- all 16 JPEG card assets are present;
- late entry does not unlock RETURN;
- a real missed day followed by seven active days does unlock RETURN;
- the Mini App renders image cards and queues simultaneous awards;
- reactivated awards produce versioned Telegram outbox events.
