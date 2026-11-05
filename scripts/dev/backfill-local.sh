#!/bin/sh
# Backfills a believable month of study history for the seeded student into a LOCAL disposable database (the API cannot backdate a session).
# Usage: scripts/dev/backfill-local.sh <docker container> <database>
C="$1"; DB="$2"
case "$C" in sylf-backend-*) ;; *) echo "Only a disposable sylf-backend-* container."; exit 1;; esac
docker exec -i "$C" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
SET session_replication_role = replica;
DELETE FROM "StudySession" WHERE "userId" = (SELECT id FROM "User" WHERE username='alice');
INSERT INTO "StudySession" ("userId","subjectId","durationMinutes","durationSeconds","focusRate","startedAt","endedAt","rewardsClaimed","breakSeconds","executionState","executionVersion")
SELECT u.id, s.id, m, m*60, 80 + (d % 15),
       (date_trunc('day', now()) - (d || ' days')::interval + ((9 + (d % 8)) || ' hours')::interval),
       (date_trunc('day', now()) - (d || ' days')::interval + ((9 + (d % 8)) || ' hours')::interval + (m || ' minutes')::interval),
       true, 120, 'ENDED', 2
FROM "User" u
CROSS JOIN LATERAL (SELECT generate_series(1, 27) d) days
JOIN LATERAL (SELECT id FROM "Subject" WHERE "userId"=u.id ORDER BY id OFFSET (days.d % 4) LIMIT 1) s ON true
CROSS JOIN LATERAL (SELECT 25 + (days.d * 7) % 60 m) mm
WHERE u.username='alice' AND days.d % 5 <> 0;
UPDATE "User" SET level = 7, "currentXP" = 340, "xpToNextLevel" = 620, "streakDays" = 4, sylph = 1280, "hunterRank" = 'D',
  "totalStudyMinutes" = (SELECT coalesce(sum("durationMinutes"),0) FROM "StudySession" WHERE "userId"="User".id),
  "totalStudySeconds" = (SELECT coalesce(sum("durationSeconds"),0) FROM "StudySession" WHERE "userId"="User".id)
WHERE username='alice';
SET session_replication_role = DEFAULT;
SELECT count(*) AS sessions, sum("durationMinutes") AS minutes FROM "StudySession" WHERE "userId"=(SELECT id FROM "User" WHERE username='alice');
SQL
