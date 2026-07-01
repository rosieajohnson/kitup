-- ============================================================
--  0008 — campaign cover images
-- ============================================================
--  Schools can give a campaign a cover image: either pick one of the
--  built-in sports images (served from /public/covers, stored here as
--  a path like '/covers/basketball.jpg') or upload their own to the
--  'campaign-images' storage bucket (stored here as a full public URL).
-- ============================================================

alter table public.campaigns
    add column if not exists cover_image text;

-- ------------------------------------------------------------
--  Storage bucket for school-uploaded cover images.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('campaign-images', 'campaign-images', true)
on conflict (id) do nothing;

-- Anyone can view (campaign pages are public).
drop policy if exists "campaign images public read" on storage.objects;
create policy "campaign images public read"
    on storage.objects for select
    using (bucket_id = 'campaign-images');

-- A signed-in user may upload/manage only inside their own folder,
-- i.e. the object name must start with '{their uid}/'. The app uploads
-- to '{school_id}/{uuid}.{ext}'.
drop policy if exists "campaign images owner insert" on storage.objects;
create policy "campaign images owner insert"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'campaign-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "campaign images owner update" on storage.objects;
create policy "campaign images owner update"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'campaign-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "campaign images owner delete" on storage.objects;
create policy "campaign images owner delete"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'campaign-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
