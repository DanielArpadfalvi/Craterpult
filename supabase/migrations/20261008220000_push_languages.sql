-- Craterpult: push texts in every app language (texts: supabase/functions/notify-turn/message.ts).
-- Languages the app may add later fall back to English until message.ts has them.

alter table public.push_tokens drop constraint if exists push_tokens_lang_check;
alter table public.push_tokens
  add constraint push_tokens_lang_check check (lang in ('en', 'hu', 'de', 'es', 'pt'));

create or replace function public.register_push_token(token text, platform text, lang text)
returns void language sql security definer set search_path = '' as $$
  insert into public.push_tokens (user_id, token, platform, lang)
    values (auth.uid(), left(register_push_token.token, 512), register_push_token.platform,
            case when register_push_token.lang in ('en', 'hu', 'de', 'es', 'pt')
                 then register_push_token.lang else 'en' end)
  on conflict (user_id, token)
    do update set updated_at = now(), platform = excluded.platform, lang = excluded.lang;
$$;
