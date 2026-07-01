-- ============================================================
--  0007 — link purchases to their Stripe Checkout session
-- ============================================================
--  Payments record purchases from the Stripe webhook. Tag each
--  purchase with its Checkout session id and make (session, item)
--  unique, so Stripe's webhook retries can't create duplicates.
--  Nullable so manually-created / legacy purchases are unaffected.
-- ============================================================

alter table public.purchases
    add column if not exists stripe_checkout_session_id text;

create unique index if not exists purchases_session_item_uidx
    on public.purchases (stripe_checkout_session_id, item_id)
    where stripe_checkout_session_id is not null;
