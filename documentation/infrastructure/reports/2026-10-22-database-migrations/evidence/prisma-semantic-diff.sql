-- CreateIndex
CREATE UNIQUE INDEX "PlannerPreference_userId_preferenceType_planless_key" ON "PlannerPreference"("userId", "preferenceType") WHERE ("planId" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "PlannerFrictionEvent_userId_planId_itemKey_reasonCode_planless_" ON "PlannerFrictionEvent"("userId", "planId", "itemKey", "reasonCode") WHERE ("revisionId" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "SessionInvite_party_receiver_pending_idx" ON "SessionInvite"("partyId", "receiverId") WHERE ((status = 'PENDING'::"InviteStatus") AND ("partyId" IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX "focus_session_single_active_per_party" ON "FocusSession"("partyId") WHERE ("endedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "planner_attempt_one_running_planning" ON "PlannerAttempt"("userId") WHERE ((state = 'RUNNING'::text) AND (kind <> 'RESEARCH_ADVICE'::text));

