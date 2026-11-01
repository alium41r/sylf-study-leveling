-- REVIEW PROPOSAL ONLY. Requires explicit approval before any hosted execution.
-- Scope: 96 orphaned test records. Standalone execution always ROLLS BACK. Export every selected row to the private
-- recovery archive and fsync it BEFORE running this transaction.
-- No schema changes, constraint bypass, invented parent records or ledger edits.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public."User", public."FocusParty", public."FocusPartyMember",
  public."FocusSession", public."FocusSessionMember", public."Friendship",
  public."SessionInvite" IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
DECLARE n integer; fingerprint text;
BEGIN
  SELECT count(*)::integer, md5(coalesce(string_agg(md5(to_jsonb(t)::text), ' ' ORDER BY md5(to_jsonb(t)::text)), ''))
    INTO n, fingerprint FROM public."FocusPartyMember" t WHERE NOT EXISTS(SELECT 1 FROM public."FocusParty" p WHERE p.id=t."partyId") OR NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=t."userId");
  IF n <> 16 OR fingerprint <> 'b4d1213886c84fc752733f02501fcb0c' THEN
    RAISE EXCEPTION 'Reviewed FocusPartyMember data changed; abort and audit again';
  END IF;
END $guard$;

DO $guard$
DECLARE n integer; fingerprint text;
BEGIN
  SELECT count(*)::integer, md5(coalesce(string_agg(md5(to_jsonb(t)::text), ' ' ORDER BY md5(to_jsonb(t)::text)), ''))
    INTO n, fingerprint FROM public."FocusSession" t WHERE NOT EXISTS(SELECT 1 FROM public."FocusParty" p WHERE p.id=t."partyId");
  IF n <> 15 OR fingerprint <> 'd7ebf2694e50a5118fa1f84a4b8b1d4e' THEN
    RAISE EXCEPTION 'Reviewed FocusSession data changed; abort and audit again';
  END IF;
END $guard$;

DO $guard$
DECLARE n integer; fingerprint text;
BEGIN
  SELECT count(*)::integer, md5(coalesce(string_agg(md5(to_jsonb(t)::text), ' ' ORDER BY md5(to_jsonb(t)::text)), ''))
    INTO n, fingerprint FROM public."FocusSessionMember" t WHERE NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=t."userId") OR NOT EXISTS(SELECT 1 FROM public."FocusSession" s JOIN public."FocusParty" p ON p.id=s."partyId" WHERE s.id=t."sessionId");
  IF n <> 29 OR fingerprint <> '19bfdac8e975edf6a69462a5276db109' THEN
    RAISE EXCEPTION 'Reviewed FocusSessionMember data changed; abort and audit again';
  END IF;
END $guard$;

DO $guard$
DECLARE n integer; fingerprint text;
BEGIN
  SELECT count(*)::integer, md5(coalesce(string_agg(md5(to_jsonb(t)::text), ' ' ORDER BY md5(to_jsonb(t)::text)), ''))
    INTO n, fingerprint FROM public."Friendship" t WHERE NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=t."userId") OR NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=t."friendId");
  IF n <> 16 OR fingerprint <> '1c7d7216525c4745dd5dc5b6699a1587' THEN
    RAISE EXCEPTION 'Reviewed Friendship data changed; abort and audit again';
  END IF;
END $guard$;

DO $guard$
DECLARE n integer; fingerprint text;
BEGIN
  SELECT count(*)::integer, md5(coalesce(string_agg(md5(to_jsonb(t)::text), ' ' ORDER BY md5(to_jsonb(t)::text)), ''))
    INTO n, fingerprint FROM public."SessionInvite" t WHERE NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=t."senderId") OR NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=t."receiverId") OR (t."partyId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."FocusParty" p WHERE p.id=t."partyId"));
  IF n <> 20 OR fingerprint <> 'a0af3c160a62b4fc02d46bba8a1b4248' THEN
    RAISE EXCEPTION 'Reviewed SessionInvite data changed; abort and audit again';
  END IF;
END $guard$;

DELETE FROM public."FocusSessionMember" t WHERE NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=t."userId") OR NOT EXISTS(SELECT 1 FROM public."FocusSession" s JOIN public."FocusParty" p ON p.id=s."partyId" WHERE s.id=t."sessionId");
DELETE FROM public."FocusSession" t WHERE NOT EXISTS(SELECT 1 FROM public."FocusParty" p WHERE p.id=t."partyId");
DELETE FROM public."FocusPartyMember" t WHERE NOT EXISTS(SELECT 1 FROM public."FocusParty" p WHERE p.id=t."partyId") OR NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=t."userId");
DELETE FROM public."Friendship" t WHERE NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=t."userId") OR NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=t."friendId");
DELETE FROM public."SessionInvite" t WHERE NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=t."senderId") OR NOT EXISTS(SELECT 1 FROM public."User" u WHERE u.id=t."receiverId") OR (t."partyId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."FocusParty" p WHERE p.id=t."partyId"));

-- Validate actual FK relationships, including previously validated constraints.
DO $verify$
DECLARE fk record; invalid boolean;
BEGIN
  FOR fk IN
    SELECT c.conname, c.conrelid::regclass AS child, c.confrelid::regclass AS parent,
      string_agg(format('child.%I IS NOT NULL', a.attname), ' AND ' ORDER BY k.ord) AS nonnull,
      string_agg(format('child.%I = parent.%I', a.attname, b.attname), ' AND ' ORDER BY k.ord) AS matches
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY k(ca, pa, ord)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.ca
    JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=k.pa
    WHERE c.contype='f' AND c.connamespace='public'::regnamespace
    GROUP BY c.oid
  LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s child WHERE %s AND NOT EXISTS(SELECT 1 FROM %s parent WHERE %s))', fk.child, fk.nonnull, fk.parent, fk.matches) INTO invalid;
    IF invalid THEN RAISE EXCEPTION 'Foreign key still violated: %', fk.conname; END IF;
  END LOOP;
END $verify$;

-- The approved executor additionally compares every unaffected row fingerprint
-- before committing. This review file deliberately leaves the hosted data intact.
ROLLBACK;
