# Graph Report - laboratorium  (2026-11-15)

## Corpus Check
- 235 files · ~306,420 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3247 nodes · 7540 edges · 188 communities (171 shown, 17 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 286 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f1374592`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- codemirror.js
- javascript.js
- admin.controller.js
- dashboard.js
- api.controller.js
- .focus
- room.js
- getLabPublicConfig
- lab-workbench.js
- cmp
- registerEventHandlers
- getContextBefore
- schedule.service.js
- markText
- ctf-demo.controller.js
- code-workspace.service.js
- proxmox.service.js
- db/index.js
- setup.js
- circuits.service.js
- ConflictError
- access-policy.service.js
- crm.service.js
- groups-chat.js
- clike.js
- code-editor.js
- admin.js
- lab.service.js
- content-builder.js
- theme-engine.js
- app.js
- defineOptions
- public/auth.js
- support.service.js
- laboratorium. — деплой на сервер (Docker)
- lab-tools.js
- telegram-bot.service.js
- api.routes.js
- middleware/auth.js
- marketing.service.js
- task.service.js
- auth.controller.js
- storage.service.js
- getLine
- content.service.js
- conferences.js
- code.controller.js
- chat.service.js
- notifications.js
- payment.service.js
- notification.service.js
- tab-access.service.js
- seed.js
- admin.service.js
- addEditorMethods
- referral.service.js
- admin-traffic-panel.js
- recordings.js
- SEO-аналіз laboratorium. (школа IT / кібербезпеки)
- recording.service.js
- Adversarial security review — Laboratorium
- dependencies
- scripts
- i18n.js
- programs-section.js
- manual.service.js
- git-oauth.service.js
- tunnel.service.js
- admin-crm-panel.js
- admin-owner-panel.js
- admin-person-profile.js
- analytics.js
- portal.js
- python.js
- settings.service.js
- challenge-stage.service.js
- server/index.js
- script.js
- css.js
- challenge.service.js
- admin-attendance-panel.js
- admin-ctf-panel.js
- admin-labs-panel.js
- renderDialog
- closebrackets.js
- group.service.js
- user.service.js
- ctf.service.js
- Проблеми (від критичних до косметичних)
- admin-groups-panel.js
- manual.js
- unified-calendar.js
- conference.service.js
- sandbox.service.js
- article.service.js
- admin-billing-panel.js
- admin-stats-panel.js
- lab-tools-catalog.js
- public/tab-access.js
- web-push
- lab-agent/server.js
- admin-manuals-panel.js
- admin-schedule-panel.js
- manuals.js
- student-profile.js
- conference.controller.js
- chat.controller.js
- ctf-lab/package.json
- ctf-lab/server.js
- admin-access-panel.js
- app-nav.js
- number-inputs.js
- htmlmixed.js
- homework-reminder.service.js
- package.json
- chat-stickers.js
- course.js
- matchbrackets.js
- shell.js
- user-handle.js
- admin-errors-panel.js
- admin-messages-panel.js
- admin-quiz-panel.js
- admin-storage-panel.js
- content-view.js
- site-header.js
- ValidationError
- docker-entrypoint.sh
- public/roles.js
- elite-service.js
- nginx/entrypoint.sh
- site-qr.js
- deploy.sh
- ctf-lab/entrypoint.sh
- express-rate-limit
- circuits-lab.js
- jsonwebtoken
- multer
- nodemailer
- mail.service.js
- i18n-en.js
- restart.sh
- errors.js
- timezone.js
- upload.js
- NotFoundError
- better-sqlite3
- admin-planner-panel.js
- socket/index.js
- config/index.js
- admin-telegram-panel.js
- telegram.service.js
- express

## God Nodes (most connected - your core abstractions)
1. `addEditorMethods()` - 69 edges
2. `cont()` - 61 edges
3. `db` - 60 edges
4. `ValidationError` - 49 edges
5. `config` - 41 edges
6. `getLine()` - 40 edges
7. `NotFoundError` - 39 edges
8. `pass()` - 38 edges
9. `Pos()` - 36 edges
10. `registerEventHandlers()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `chain()` --indirect_call--> `stream()`  [INFERRED]
  public/vendor/codemirror/mode/xml/xml.js → server/controllers/recording.controller.js
- `bufferOverflow()` --calls--> `icon()`  [EXTRACTED]
  server/controllers/ctf-demo.controller.js → public/icons.js
- `crackmeCheck()` --calls--> `icon()`  [EXTRACTED]
  server/controllers/ctf-demo.controller.js → public/icons.js
- `flagRevealPage()` --calls--> `icon()`  [EXTRACTED]
  server/controllers/ctf-demo.controller.js → public/icons.js
- `pageLayout()` --calls--> `icon()`  [EXTRACTED]
  server/controllers/ctf-demo.controller.js → public/icons.js

## Import Cycles
- 3-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/challenge-stage.service.js -> server/db/index.js`
- 3-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/challenge.service.js -> server/db/index.js`
- 3-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/lab-agent.service.js -> server/db/index.js`
- 3-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/settings.service.js -> server/db/index.js`
- 3-file cycle: `server/services/ctf-demo.service.js -> server/services/lab-agent.service.js -> server/utils/publicUrl.js -> server/services/ctf-demo.service.js`
- 4-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/challenge-stage.service.js -> server/services/bounty.service.js -> server/db/index.js`
- 4-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/challenge-stage.service.js -> server/services/ctf-activity.service.js -> server/db/index.js`
- 4-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/challenge.service.js -> server/services/challenge-stage.service.js -> server/db/index.js`
- 4-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/challenge.service.js -> server/services/ctf-activity.service.js -> server/db/index.js`
- 4-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/lab-agent.service.js -> server/services/settings.service.js -> server/db/index.js`
- 4-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/utils/publicUrl.js -> server/services/ctf-demo.service.js -> server/db/index.js`
- 4-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/utils/publicUrl.js -> server/services/settings.service.js -> server/db/index.js`
- 4-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/utils/publicUrl.js -> server/services/tunnel.service.js -> server/db/index.js`
- 5-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/challenge.service.js -> server/services/challenge-stage.service.js -> server/services/bounty.service.js -> server/db/index.js`
- 5-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/challenge.service.js -> server/services/challenge-stage.service.js -> server/services/ctf-activity.service.js -> server/db/index.js`
- 5-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/lab-agent.service.js -> server/utils/publicUrl.js -> server/services/ctf-demo.service.js -> server/db/index.js`
- 5-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/lab-agent.service.js -> server/utils/publicUrl.js -> server/services/settings.service.js -> server/db/index.js`
- 5-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/services/lab-agent.service.js -> server/utils/publicUrl.js -> server/services/tunnel.service.js -> server/db/index.js`
- 5-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/utils/publicUrl.js -> server/services/ctf-demo.service.js -> server/services/lab-agent.service.js -> server/db/index.js`
- 5-file cycle: `server/db/index.js -> server/services/ctf.service.js -> server/utils/publicUrl.js -> server/services/tunnel-url.service.js -> server/services/settings.service.js -> server/db/index.js`

## Communities (188 total, 17 thin omitted)

### Community 0 - "codemirror.js"
Cohesion: 0.04
Nodes (86): buildCollapsedSpan(), buildLineContent(), buildLineElement(), buildToken(), buildTokenBadBidi(), classTest(), clearEmptySpans(), collapsedSpanAround() (+78 more)

### Community 1 - "javascript.js"
Cohesion: 0.09
Nodes (92): afterExport(), afterImport(), afterprop(), afterType(), arrayLiteral(), arrowBody(), arrowBodyNoComma(), block() (+84 more)

### Community 2 - "admin.controller.js"
Cohesion: 0.02
Nodes (3): getOverview(), listApplications(), isAdminRole()

### Community 3 - "dashboard.js"
Cohesion: 0.06
Nodes (75): addPortFlow(), ALL_TABS, APPLICATION_STATUS_LABELS, applyCtfFilters(), ARTICLE_STATUS_LABELS, bindCtfFiltersOnce(), clearCtfTimers(), clearTaskTimers() (+67 more)

### Community 4 - "api.controller.js"
Cohesion: 0.04
Nodes (19): approveTask(), completeChallenge(), enroll(), escapeXml(), getDashboard(), getLeaderboard(), getSitemap(), getStudentPublicProfile() (+11 more)

### Community 5 - ".focus"
Cohesion: 0.09
Nodes (25): activeElt(), addClass(), CodeMirror(), copyableRanges(), copyObj(), disableBrowserMagic(), docMethodOp(), endOperation() (+17 more)

### Community 6 - "room.js"
Cohesion: 0.06
Nodes (56): addChatMessage(), addSystemMessage(), applyAllTracks(), audioCtx(), bindSlots(), buildRecordingStream(), camStreamLocal, chatInput (+48 more)

### Community 7 - "getLabPublicConfig"
Cohesion: 0.23
Nodes (21): listCtfForUser(), startChallenge(), getPublicInfra(), deployDocker(), restoreDockerBackup(), stopDocker(), getLabPublicConfig(), appBaseUrl() (+13 more)

### Community 8 - "lab-workbench.js"
Cohesion: 0.06
Nodes (50): addFinding(), analyzeEmailHeaders(), analyzeHeaders(), ATTACK_SIGNATURES, b64urlDecode(), b64urlFromBytes(), base64ToText(), calcCidr() (+42 more)

### Community 9 - "cmp"
Cohesion: 0.10
Nodes (32): applyTextInput(), bidiSimplify(), cmp(), contains(), deleteNearSelection(), drawSelectionRange(), ensureCursorVisible(), extendRange() (+24 more)

### Community 10 - "registerEventHandlers"
Cohesion: 0.07
Nodes (41): addModifierNames(), clearDragCursor(), clickInGutter(), clickRepeat(), contextMenuInGutter(), delayBlurEvent(), dispatchKey(), dispatchKeyInner() (+33 more)

### Community 11 - "getContextBefore"
Cohesion: 0.20
Nodes (15): bind(), callBlankLine(), copyState(), save(), getContextBefore(), getLineStyles(), highlightLine(), highlightWorker() (+7 more)

### Community 12 - "schedule.service.js"
Cohesion: 0.07
Nodes (36): conferenceEvent(), lessonEvent(), listStudentEvents(), requestedMonth(), createLesson(), deleteLesson(), notifyGroupAboutLesson(), updateLesson() (+28 more)

### Community 13 - "markText"
Cohesion: 0.09
Nodes (44): addLineWidget(), addToScrollTop(), adjustScrollWhenAboveVisible(), adjustView(), buildViewArray(), changeLine(), collapsedSpanAtEnd(), collapsedSpanAtSide() (+36 more)

### Community 14 - "ctf-demo.controller.js"
Cohesion: 0.10
Nodes (44): BLOCK_PALETTE, esc(), GRADIENTS, renderBlock(), renderCardIcon(), renderPage(), renderSectionIcon(), textToHtml() (+36 more)

### Community 15 - "code-workspace.service.js"
Cohesion: 0.09
Nodes (56): assertCanUse(), assertRunRateLimit(), canUseSandbox(), clearWorkspaceFiles(), create(), createGitCommit(), DEFAULT_FILES, ensureGitRepository() (+48 more)

### Community 16 - "proxmox.service.js"
Cohesion: 0.28
Nodes (25): agentExec(), agentListDir(), agentReadFile(), agentWriteFile(), cfg(), cloneVm(), createSnapshot(), deleteSnapshot() (+17 more)

### Community 17 - "db/index.js"
Cohesion: 0.08
Nodes (9): db, dbDir, SCHEMA, log(), logPublished(), PRIORITIES, STATUSES, like() (+1 more)

### Community 18 - "setup.js"
Cohesion: 0.15
Nodes (23): api(), createUserDirect(), __dirname, loginAs(), randSuffix(), scratchDbDir, setTestEnv(), startServer() (+15 more)

### Community 19 - "circuits.service.js"
Cohesion: 0.13
Nodes (15): assertCanUse(), canUseCircuits(), create(), createFromTemplate(), diagnose(), getInfo(), getOne(), getOwned() (+7 more)

### Community 20 - "ConflictError"
Cohesion: 0.39
Nodes (7): areConnected(), follow(), getFollowCounts(), getStudentByHandle(), isFollowing(), unfollow(), ConflictError

### Community 21 - "access-policy.service.js"
Cohesion: 0.23
Nodes (13): getAccessPolicy(), resetAccessPolicy(), saveAccessPolicy(), assertEnum(), deepMerge(), DEFAULT_POLICY, ENUMS, getPolicy() (+5 more)

### Community 22 - "crm.service.js"
Cohesion: 0.10
Nodes (21): ACTIVITY_TYPES, addActivity(), createCompany(), createContact(), createOpportunity(), getCompany(), getContact(), getOpportunity() (+13 more)

### Community 23 - "groups-chat.js"
Cohesion: 0.13
Nodes (35): appendMessage(), bindCompose(), closePanels(), renderGifHistory(), sendGifFromInput(), uploadChatFile(), bindGroupShellEvents(), bindMembersEvents() (+27 more)

### Community 24 - "clike.js"
Cohesion: 0.08
Nodes (16): esc(), number(), renderMarketingPanel(), contains(), cpp11StringHook(), cTypes(), def(), isTopScope() (+8 more)

### Community 25 - "code-editor.js"
Cohesion: 0.12
Nodes (44): addFile(), appendConsole(), bindMainEvents(), buildLivePreviewHtml(), cloneFromRemote(), createGitCommit(), createWorkspace(), currentWorkspace() (+36 more)

### Community 26 - "admin.js"
Cohesion: 0.12
Nodes (33): ADMIN_ROLES, adminNavBadges, bindEvents(), bindTabHandlers(), ctfAdminData, isAttendanceTab(), isErrorsTab(), isScheduleTab() (+25 more)

### Community 27 - "lab.service.js"
Cohesion: 0.11
Nodes (26): addExposedPort(), adminListLabs(), deleteDockerBackup(), deleteVmBackup(), getLabOverview(), getUserLab(), getVmSystemInfo(), linkExistingVm() (+18 more)

### Community 28 - "content-builder.js"
Cohesion: 0.13
Nodes (29): addBlock(), bindCanvasDelegation(), bindPropEvents(), defaultBlock(), ensureSections(), getSelectedBlock(), isStaff, levelSelected() (+21 more)

### Community 29 - "theme-engine.js"
Cohesion: 0.15
Nodes (25): EDGES, ensureCanvas(), ensureFaviconLink(), FACES, initFavicon(), parseRgb(), renderFavicon(), rgba() (+17 more)

### Community 30 - "app.js"
Cohesion: 0.13
Nodes (21): createApp(), __dirname, escapeHtml(), injectAssetVersion(), publicDir, renderCourseBlock(), renderCourseContent(), sendCoursePage() (+13 more)

### Community 31 - "defineOptions"
Cohesion: 0.08
Nodes (44): alignHorizontally(), attachDoc(), calculateScrollPos(), clearCaches(), clearLineMeasurementCache(), clearLineMeasurementCacheFor(), compensateForHScroll(), configureMouse() (+36 more)

### Community 32 - "public/auth.js"
Cohesion: 0.16
Nodes (23): api(), clearSession(), getHomeForRole(), getSiteHome(), getToken(), getUser(), guardSite(), handleSessionError() (+15 more)

### Community 33 - "support.service.js"
Cohesion: 0.21
Nodes (12): cleanText(), createTemplate(), createThread(), escapeHtml(), getOwnerThread(), getUserThread(), listMessages(), replyAsOwner() (+4 more)

### Community 34 - "laboratorium. — деплой на сервер (Docker)"
Cohesion: 0.06
Nodes (30): 1. Клонування та `.env`, 2. Запуск (одна команда), 3. Архітектура контейнерів, 4. HTTPS та оновлення сертифікатів, 5. CTF-образ (якщо потрібен), 6. Дані та бекапи, 7. Оновлення версії, 8. Типові проблеми (+22 more)

### Community 35 - "lab-tools.js"
Cohesion: 0.19
Nodes (25): activeProject(), chainOptionsHtml(), chainTextFor(), DIFF, downloadProject(), esc(), FINDERS, findingSummary() (+17 more)

### Community 36 - "telegram-bot.service.js"
Cohesion: 0.22
Nodes (24): adminReply(), cfg(), getAdminOverview(), getTemplate(), handleAdminCommand(), handleCallback(), handlePayAsk(), handleUpdate() (+16 more)

### Community 37 - "api.routes.js"
Cohesion: 0.36
Nodes (6): getContentEditor(), getContentStatus(), parseTarget(), saveContent(), uploadTaskSubmission, router

### Community 38 - "middleware/auth.js"
Cohesion: 0.21
Nodes (11): authRequired(), loadAccessFlags(), optionalAuth(), requireUnrestricted(), uploadChatMedia, authLimiter, router, router (+3 more)

### Community 39 - "marketing.service.js"
Cohesion: 0.16
Nodes (22): ACCESS_RETENTION_DAYS, ACCESS_SORT, accessFilter(), analyticsDimension(), analyticsPath(), BOT_PATTERNS, clickDetail(), createCampaign() (+14 more)

### Community 40 - "task.service.js"
Cohesion: 0.23
Nodes (18): approveTask(), assertStudentAssignment(), assertTeacherCanManageAssignment(), createTask(), deleteSubmissionFiles(), deleteTask(), getAssignment(), getSubmissionFiles() (+10 more)

### Community 41 - "auth.controller.js"
Cohesion: 0.15
Nodes (14): completeGoogleCallback(), cookieValue(), createHashSha256(), fetchGoogleKeys(), googleFlows, googleGrants, login(), pruneExpired() (+6 more)

### Community 42 - "storage.service.js"
Cohesion: 0.05
Nodes (41): attrContinuedState(), attrEqState(), attrState(), attrValueState(), closeState(), closeStateErr(), closeTagNameState(), doctype() (+33 more)

### Community 43 - "getLine"
Cohesion: 0.05
Nodes (64): addChangeToHistory(), addSelectionToHistory(), adjustForChange(), attachLocalSpans(), badPos(), changeEnd(), cleanUpLine(), clearSelectionEvents() (+56 more)

### Community 44 - "content.service.js"
Cohesion: 0.06
Nodes (51): buildSections(), buildTrackCourse(), callout(), cards(), COURSES, heading(), run(), text() (+43 more)

### Community 45 - "conferences.js"
Cohesion: 0.14
Nodes (16): allConferences, closeCreateModal(), confCardHTML(), DAYS_SHORT, loadConferences(), modal, MONTHS, openCreateModal() (+8 more)

### Community 47 - "chat.service.js"
Cohesion: 0.20
Nodes (19): assertChannelAccess(), canStartDm(), ensureGroupChannel(), getGroupChannel(), getGroupRanking(), getInbox(), getLastMessage(), getMessages() (+11 more)

### Community 48 - "notifications.js"
Cohesion: 0.23
Nodes (18): connectSocket(), esc(), fmtTime(), initNotificationBell(), loadAudienceOptions(), loadInitial(), loadMore(), notifications (+10 more)

### Community 49 - "payment.service.js"
Cohesion: 0.21
Nodes (16): addDays(), assertPlatformAccess(), BYPASS_ROLES, clampBillingDay(), dueDate(), endOfDay(), getAccessStatus(), getPaymentRecord() (+8 more)

### Community 50 - "notification.service.js"
Cohesion: 0.21
Nodes (9): runCheck(), startBillingReminderScheduler(), emitToUser(), hasNotificationLike(), insertOne(), listNotifications(), mapNotification(), notifyUser() (+1 more)

### Community 51 - "tab-access.service.js"
Cohesion: 0.21
Nodes (18): requireAnyTab(), requireTab(), ALL_KEYS, assertAnyTabAccess(), assertTabAccess(), BYPASS_ROLES, currentDirectionIds(), getAllowedTabs() (+10 more)

### Community 52 - "seed.js"
Cohesion: 0.21
Nodes (16): announceOwnerCredentials(), bootstrapAdmin(), CHALLENGES, ensureAllPrograms(), ensureDirections(), ensureExtraPrograms(), ensureOwner(), ensureTestStudent() (+8 more)

### Community 53 - "admin.service.js"
Cohesion: 0.13
Nodes (18): assertCanTargetUser(), deleteUser(), getDeveloperInfo(), getOwnerDashboard(), getPersonProfile(), getPlatformStats(), listApplications(), listUsers() (+10 more)

### Community 54 - "addEditorMethods"
Cohesion: 0.07
Nodes (56): addEditorMethods(), addMarkedSpan(), attachMarkedSpans(), boxIsAfter(), charCoords(), charWidth(), clipLine(), cmpCoords() (+48 more)

### Community 55 - "referral.service.js"
Cohesion: 0.19
Nodes (11): assignReferrerToUser(), awardForApprovedApplication(), ensureProgramCode(), ensureReferralCode(), getReferrer(), getSettings(), getStudentSummary(), listStudentReferralPrograms() (+3 more)

### Community 56 - "admin-traffic-panel.js"
Cohesion: 0.28
Nodes (13): bars(), bindTrafficPanel(), DEVICE_LABELS, donut(), esc(), EVENT_LABELS, label(), lineChart() (+5 more)

### Community 57 - "recordings.js"
Cohesion: 0.28
Nodes (15): escapeHtml(), flushWatchProgress(), formatDuration(), formatTimestamp(), handleNoteAction(), load(), loadRecording(), playableRecordings() (+7 more)

### Community 58 - "SEO-аналіз laboratorium. (школа IT / кібербезпеки)"
Cohesion: 0.29
Nodes (6): SEO-аналіз laboratorium. (школа IT / кібербезпеки), Висновок, Пріоритетні запити (семантика), Чого свідомо уникали, Що вже прокачано в коді, Що дає ріст у видачі далі (поза кодом)

### Community 59 - "recording.service.js"
Cohesion: 0.21
Nodes (10): assertCanAccessRecording(), canAccessRecording(), create(), enrichRecording(), getById(), getFilePath(), hasPlayableFile(), list() (+2 more)

### Community 60 - "Adversarial security review — Laboratorium"
Cohesion: 0.13
Nodes (14): 10. Low — Login timing side-channel (email enumeration), 1. Critical — Hardcoded default credentials, always re-seeded, 2. Critical — Default JWT secret enables full auth forgery, 3. Critical — OS command injection via Docker `image` field, 4. Critical — Stored XSS via chat upload extension/MIME-type confusion, 5. High — CTF flag oracle: hardcoded flags leak via mock demo pages, 6. High — Mass assignment in conference creation, 7. Medium — IDOR: any user can read/stream/annotate any recording (+6 more)

### Community 61 - "dependencies"
Cohesion: 0.13
Nodes (15): bcryptjs, cors, dotenv, helmet, dependencies, bcryptjs, cors, dotenv (+7 more)

### Community 62 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, ctf:build, ctf:deploy, deploy, dev, docker:build, docker:down, docker:prod:build (+7 more)

### Community 63 - "i18n.js"
Cohesion: 0.18
Nodes (10): applyTranslations(), bindLangSwitch(), currentLocale, DICTS, initI18n(), interpolate(), LOCALES, setLocale() (+2 more)

### Community 64 - "programs-section.js"
Cohesion: 0.27
Nodes (14): bindDossierToggles(), DIR_ACCENTS, DIR_ICONS, dirAccent(), directionsData, dirIcon(), esc(), initProgramsSection() (+6 more)

### Community 65 - "manual.service.js"
Cohesion: 0.20
Nodes (21): addComment(), assertCanManage(), assertManualCommentAccess(), create(), deleteComment(), getById(), getBySlug(), getForActor() (+13 more)

### Community 66 - "git-oauth.service.js"
Cohesion: 0.18
Nodes (14): completeOAuth(), exchangeGithub(), exchangeGitlab(), flows, getAccessToken(), getAccount(), providerConfig(), prune() (+6 more)

### Community 67 - "tunnel.service.js"
Cohesion: 0.21
Nodes (16): router, tunnelLimiter, agentRelayRequest(), directProxyRequest(), ensureAccessToken(), handleTunnelProxy(), isPrivateHost(), lookupToken() (+8 more)

### Community 68 - "admin-crm-panel.js"
Cohesion: 0.29
Nodes (15): bindCrmPanelEvents(), esc(), INTENT_LABELS, loadCrmData(), money(), refresh(), renderCard(), renderCompanies() (+7 more)

### Community 69 - "admin-owner-panel.js"
Cohesion: 0.25
Nodes (12): bindOwnerPanelEvents(), esc(), hostDisplay(), isLinkedVm(), mailFailMessage(), renderDirectionsPanel(), renderLinkedServersSidebar(), renderProgramsPanel() (+4 more)

### Community 70 - "admin-person-profile.js"
Cohesion: 0.32
Nodes (12): APPLICATION_STATUS_LABELS, BILLING_STATUS_LABELS, BILLING_STATUS_PILL, esc(), fmtDate(), openPersonProfile(), renderApplications(), renderBilling() (+4 more)

### Community 71 - "analytics.js"
Cohesion: 0.24
Nodes (12): appendAttributionToLink(), appendAttributionToLinks(), ATTRIBUTION_KEYS, clickTarget(), currentAttribution(), currentPath, getAnalyticsAttribution(), safeDimension() (+4 more)

### Community 72 - "portal.js"
Cohesion: 0.36
Nodes (13): dateLocale(), esc(), fmtConfTime(), fmtScheduleDate(), greeting(), init(), loadConferences(), loadSchedule() (+5 more)

### Community 73 - "python.js"
Cohesion: 0.29
Nodes (11): dedent(), formatStringFactory(), tokenNestedExpr(), tokenString(), pushBracketScope(), pushPyScope(), tokenBase(), tokenBaseInner() (+3 more)

### Community 74 - "settings.service.js"
Cohesion: 0.19
Nodes (18): envDefaults(), getLabPublicSettingsPublic(), getProxmoxConfig(), getProxmoxSettingsPublic(), getSmtpConfig(), getSmtpSettingsPublic(), getTelegramConfig(), getTelegramSettingsPublic() (+10 more)

### Community 75 - "challenge-stage.service.js"
Cohesion: 0.29
Nodes (10): assertStageUnlockedForUser(), assertUnlocked(), getAttachmentsRaw(), getChallenge(), getStagesAdmin(), getStagesRaw(), getUserStageView(), replaceStages() (+2 more)

### Community 76 - "server/index.js"
Cohesion: 0.22
Nodes (8): app, io, server, runAutoBackupCycle(), startBackupScheduler(), schedule(), isAgentEnabled(), setIo()

### Community 77 - "script.js"
Cohesion: 0.19
Nodes (9): animateCounters(), draw(), escHtml(), heroStats, lines, loadLeaderboard(), project(), rotate() (+1 more)

### Community 78 - "css.js"
Cohesion: 0.23
Nodes (6): pass(), popAndPass(), ret(), tokenBase(), tokenParenthesized(), tokenString()

### Community 79 - "challenge.service.js"
Cohesion: 0.05
Nodes (33): assertConferenceManage(), computeUserAttendance(), getConferenceAttendance(), getGroupAttendanceOverview(), assertCanManage(), assertOwnership(), complete(), deleteAdmin() (+25 more)

### Community 80 - "admin-attendance-panel.js"
Cohesion: 0.29
Nodes (8): esc(), fmtDur(), fmtLessonDate(), renderAttendancePanel(), renderConferenceDetail(), renderConferenceRow(), STATUS_LABELS, STATUS_PILL_CLASS

### Community 81 - "admin-ctf-panel.js"
Cohesion: 0.26
Nodes (9): bindCtfPanelEvents(), addStageRow(), recalcTotal(), resetForm(), CATEGORIES, esc(), helpPanelHtml(), renderCtfPanel() (+1 more)

### Community 82 - "admin-labs-panel.js"
Cohesion: 0.39
Nodes (11): bindLabsPanelEvents(), dockerRow(), esc(), fmtDate(), isLinkedVm(), loadDockerHistory(), loadVmHistory(), renderBackupList() (+3 more)

### Community 83 - "renderDialog"
Cohesion: 0.36
Nodes (11): esc(), renderDialog(), finish(), onKey(), showAlert(), showConfirm(), showCopyDialog(), finish() (+3 more)

### Community 84 - "closebrackets.js"
Cohesion: 0.38
Nodes (11): charsAround(), contractSelection(), ensureBound(), getConfig(), getOption(), handleBackspace(), handleChar(), handleEnter() (+3 more)

### Community 85 - "group.service.js"
Cohesion: 0.29
Nodes (13): addGroupMembers(), assertTeacherAccess(), createGroup(), deleteGroup(), getGroupById(), getUserGroups(), listAvailableStudents(), listGroupMembers() (+5 more)

### Community 86 - "user.service.js"
Cohesion: 0.26
Nodes (16): create(), notifyOwnersAboutLead(), generatePassword(), adminCreateUser(), DUMMY_PASSWORD_HASH, findByEmail(), findByHandle(), findById() (+8 more)

### Community 87 - "ctf.service.js"
Cohesion: 0.23
Nodes (7): MULTISTAGE_EXAMPLES, CTF_IMAGE(), ensureChallengeStages(), ensureCtfMetadata(), ensureExampleChallenges(), EXTRA_PORT_SPECS, LEGACY_IMAGES

### Community 89 - "Проблеми (від критичних до косметичних)"
Cohesion: 0.18
Nodes (10): 1. Низький контраст muted-тексту на темному фоні — ВИПРАВЛЕНО, 2. Успіх відправки форми лише на кнопці — ВИПРАВЛЕНО, 3. Обов’язковість компанії залежить від intent — ВИПРАВЛЕНО, 4. Hero CTA «Обговорити» і «Обрати програму» конкурують без ієрархії для B2B-байєра, 5. Навігація «Для компаній» веде в середину сторінки — немає окремого landing state, 6. Stats-стрічка після hero може відволікати від основної CTA, Nielsen heuristics audit — marketing home + B2B contact, Адмін CRM (`/admin.html?tab=crm`) — короткий follow-up (+2 more)

### Community 90 - "admin-groups-panel.js"
Cohesion: 0.36
Nodes (9): bindGroupsPanelEvents(), esc(), openGroupModal(), renderGroupCard(), renderGroupsPanel(), renderHomeworkReminderSettings(), renderHomeworkReviewPanel(), renderReviewQueue() (+1 more)

### Community 91 - "manual.js"
Cohesion: 0.27
Nodes (10): esc(), load(), loadComments(), params, renderComments(), renderNotFound(), root, showCommentError() (+2 more)

### Community 92 - "unified-calendar.js"
Cohesion: 0.44
Nodes (10): dayKey(), escapeHtml(), mountUnifiedCalendar(), load(), render(), renderEvents(), sourceLabel(), parseIso() (+2 more)

### Community 93 - "conference.service.js"
Cohesion: 0.16
Nodes (12): assertCanAccessConference(), canAccessConference(), cancel(), conferenceVisibilitySql(), create(), end(), generateRoomCode(), getById() (+4 more)

### Community 94 - "sandbox.service.js"
Cohesion: 0.31
Nodes (13): allocatePort(), execFileAsync, isSandboxEnabled(), LANGUAGES, runExec(), runInSandbox(), runTests(), safeFileName() (+5 more)

### Community 95 - "article.service.js"
Cohesion: 0.36
Nodes (9): assertAuthorAccess(), create(), getById(), listForUser(), listSubmittedForTeacher(), mapArticle(), studentCanWriteArticles(), submit() (+1 more)

### Community 96 - "admin-billing-panel.js"
Cohesion: 0.29
Nodes (7): esc(), formatDate(), MONTHS, renderBillingPanel(), renderBillingRow(), STATUS_CLASS, STATUS_LABELS

### Community 97 - "admin-stats-panel.js"
Cohesion: 0.42
Nodes (8): bindStatsPanelEvents(), esc(), openStatsModal(), renderQuizDetail(), renderStatsPanel(), renderStudentDetail(), renderTaskDetail(), statusLabel()

### Community 98 - "lab-tools-catalog.js"
Cohesion: 0.36
Nodes (8): CATEGORIES, DIFFICULTIES, filterTools(), pathProgress(), PATHS, SCENARIO, scoreScenario(), TOOLS

### Community 99 - "public/tab-access.js"
Cohesion: 0.29
Nodes (7): canAccessTab(), DASH_TAB_MAP, dashTabAllowed(), firstAllowedDashTab(), pageAllowed(), PORTAL_TAB_MAP, portalHrefAllowed()

### Community 101 - "lab-agent/server.js"
Cohesion: 0.25
Nodes (4): app, buildTargetUrl(), ipToPublicHost(), PORT

### Community 102 - "admin-manuals-panel.js"
Cohesion: 0.42
Nodes (7): bindManualsPanelEvents(), directionOptions(), esc(), groupOptions(), renderManualsPanel(), rowData(), statusPill()

### Community 103 - "admin-schedule-panel.js"
Cohesion: 0.39
Nodes (7): bindSchedulePanelEvents(), esc(), fmtLessonDate(), renderBarChart(), renderSchedulePanel(), renderStudentBars(), toLocalInput()

### Community 104 - "manuals.js"
Cohesion: 0.44
Nodes (8): createManual(), esc(), load(), renderFilters(), renderManuals(), renderMine(), showToast(), STATUS_LABELS

### Community 105 - "student-profile.js"
Cohesion: 0.27
Nodes (10): article, bindProfileActions(), error, escapeHtml(), handle, loading, loadProfile(), params (+2 more)

### Community 106 - "conference.controller.js"
Cohesion: 0.18
Nodes (3): getByCode(), getById(), getMessages()

### Community 107 - "chat.controller.js"
Cohesion: 0.22
Nodes (3): createDm(), getGroupChannel(), getMessages()

### Community 108 - "ctf-lab/package.json"
Cohesion: 0.25
Nodes (7): dependencies, express, express, name, private, type, version

### Community 109 - "ctf-lab/server.js"
Cohesion: 0.29
Nodes (6): app, comments, esc(), handlers, page(), PORT

### Community 110 - "admin-access-panel.js"
Cohesion: 0.36
Nodes (10): bindAccessPanelEvents(), collectPolicy(), collectRules(), esc(), loadAccessAdminData(), renderAccessPanel(), renderPolicyPanel(), renderRuleCard() (+2 more)

### Community 111 - "app-nav.js"
Cohesion: 0.36
Nodes (6): ADMIN_LINKS, getAppNavLinks(), linkAllowed(), refreshAppNav(), renderAppNavLinks(), STUDENT_LINKS

### Community 112 - "number-inputs.js"
Cohesion: 0.46
Nodes (7): clampValue(), enhanceNumberInputs(), initNumberInputs(), parseStep(), shouldEnhance(), stepValue(), wrapWithStepper()

### Community 113 - "htmlmixed.js"
Cohesion: 0.43
Nodes (6): findMatchingMode(), getAttrRegexp(), getAttrValue(), getTagRegexp(), html(), maybeBackup()

### Community 114 - "homework-reminder.service.js"
Cohesion: 0.29
Nodes (7): getSettings(), logReminder(), pendingAssignments(), recentlyReminded(), runCheck(), saveSettings(), startHomeworkReminderScheduler()

### Community 115 - "package.json"
Cohesion: 0.29
Nodes (6): description, engines, node, name, type, version

### Community 116 - "chat-stickers.js"
Cohesion: 0.38
Nodes (6): getNftSticker(), NFT_STICKERS, pixelArt(), renderNftSticker(), STICKER_THEMES, THEMES

### Community 117 - "course.js"
Cohesion: 0.38
Nodes (6): levelMeterHtml(), load(), params, programId, renderNotFound(), root

### Community 118 - "matchbrackets.js"
Cohesion: 0.52
Nodes (5): bracketRegex(), doMatchBrackets(), findMatchingBracket(), matchBrackets(), scanForBracket()

### Community 119 - "shell.js"
Cohesion: 0.57
Nodes (5): tokenBase(), tokenHeredoc(), tokenize(), tokenString(), tokenStringStart()

### Community 120 - "user-handle.js"
Cohesion: 0.83
Nodes (3): esc(), handleLink(), profileUrl()

### Community 122 - "admin-errors-panel.js"
Cohesion: 0.47
Nodes (3): esc(), fmtDate(), renderErrorsPanel()

### Community 123 - "admin-messages-panel.js"
Cohesion: 0.47
Nodes (3): dateLabel(), esc(), renderMessagesPanel()

### Community 124 - "admin-quiz-panel.js"
Cohesion: 0.53
Nodes (4): bindQuizzesPanelEvents(), esc(), questionBlock(), renderQuizzesPanel()

### Community 125 - "admin-storage-panel.js"
Cohesion: 0.60
Nodes (3): bindStoragePanelEvents(), esc(), renderStoragePanel()

### Community 126 - "content-view.js"
Cohesion: 0.40
Nodes (3): params, targetId, targetType

### Community 127 - "site-header.js"
Cohesion: 0.53
Nodes (5): bindSiteSearch(), initSiteHeader(), MAIN_LINKS, renderMainNavLinks(), renderSiteHeader()

### Community 128 - "ValidationError"
Cohesion: 0.21
Nodes (19): buildDemoLabUrl(), agentRequest(), allocatePorts(), backupContainer(), collectUsedPorts(), deleteBackupImage(), deployContainer(), ensureCtfImageBuilt() (+11 more)

### Community 129 - "docker-entrypoint.sh"
Cohesion: 0.50
Nodes (3): HOME, docker-entrypoint.sh script, USER

### Community 139 - "circuits-lab.js"
Cohesion: 0.42
Nodes (11): createFromLink(), createFromTemplate(), esc(), initCircuitsLab(), renderList(), renderMain(), renderShell(), runDiagnose() (+3 more)

### Community 143 - "mail.service.js"
Cohesion: 0.36
Nodes (7): getTransporter(), sendMail(), sendNewLeadEmail(), sendPasswordResetEmail(), sendWelcomeCredentialsEmail(), testSmtp(), transportFingerprint()

### Community 176 - "errors.js"
Cohesion: 0.18
Nodes (7): BYPASS_ROLES, requirePlatformAccess(), uploadRecording, router, ForbiddenError, PaymentRequiredError, UnauthorizedError

### Community 177 - "timezone.js"
Cohesion: 0.39
Nodes (5): formatInSiteTz(), getSiteLocale(), getSiteTimeZone(), LOCALE_TZ, timezoneLabel()

### Community 178 - "upload.js"
Cohesion: 0.12
Nodes (12): requireRole(), CHAT_MIME_EXT, chatStorage, CTF_BLOCKED_EXTENSIONS, ctfStorage, DANGEROUS_UPLOAD_EXT, ensureDir(), storage (+4 more)

### Community 179 - "NotFoundError"
Cohesion: 0.31
Nodes (8): adminSendNewPassword(), adminSendPasswordReset(), createResetToken(), generateToken(), hashToken(), requestPasswordReset(), resetPassword(), NotFoundError

### Community 181 - "admin-planner-panel.js"
Cohesion: 0.43
Nodes (6): bindPlannerPanelEvents(), esc(), loadPlannerData(), PRIORITY_LABEL, renderPlannerPanel(), STATUS_LABEL

### Community 182 - "socket/index.js"
Cohesion: 0.67
Nodes (6): broadcastRoom(), getOnlineParticipants(), getRoom(), initSocket(), leaveRoom(), roomSockets

### Community 183 - "config/index.js"
Cohesion: 0.09
Nodes (13): config, __dirname, INSECURE_JWT_SECRETS, jwtSecret, root, hash, password, targetEmail (+5 more)

### Community 190 - "telegram.service.js"
Cohesion: 0.60
Nodes (5): answerCallbackQuery(), call(), getTelegramConfig(), getUpdates(), sendMessage()

## Knowledge Gaps
- **346 isolated node(s):** `__dirname`, `markerPath`, `repoRoot`, `./server/config/index.js`, `PORT` (+341 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `db` connect `db/index.js` to `ValidationError`, `api.controller.js`, `schedule.service.js`, `ctf-demo.controller.js`, `code-workspace.service.js`, `circuits.service.js`, `ConflictError`, `access-policy.service.js`, `crm.service.js`, `lab.service.js`, `support.service.js`, `telegram-bot.service.js`, `middleware/auth.js`, `marketing.service.js`, `task.service.js`, `storage.service.js`, `content.service.js`, `chat.service.js`, `payment.service.js`, `notification.service.js`, `NotFoundError`, `tab-access.service.js`, `admin.service.js`, `config/index.js`, `referral.service.js`, `telegram.controller.js`, `recording.service.js`, `manual.service.js`, `git-oauth.service.js`, `tunnel.service.js`, `settings.service.js`, `challenge-stage.service.js`, `server/index.js`, `challenge.service.js`, `group.service.js`, `user.service.js`, `ctf.service.js`, `conference.service.js`, `article.service.js`, `homework-reminder.service.js`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `ValidationError` connect `ValidationError` to `admin.controller.js`, `api.controller.js`, `schedule.service.js`, `code-workspace.service.js`, `proxmox.service.js`, `db/index.js`, `circuits.service.js`, `ConflictError`, `access-policy.service.js`, `crm.service.js`, `lab.service.js`, `support.service.js`, `api.routes.js`, `marketing.service.js`, `task.service.js`, `storage.service.js`, `content.service.js`, `chat.service.js`, `errors.js`, `payment.service.js`, `NotFoundError`, `tab-access.service.js`, `admin.service.js`, `referral.service.js`, `config/index.js`, `telegram.controller.js`, `recording.service.js`, `manual.service.js`, `git-oauth.service.js`, `settings.service.js`, `challenge-stage.service.js`, `challenge.service.js`, `group.service.js`, `user.service.js`, `ctf.service.js`, `conference.service.js`, `sandbox.service.js`, `article.service.js`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `NotFoundError` connect `NotFoundError` to `admin.controller.js`, `api.controller.js`, `schedule.service.js`, `code-workspace.service.js`, `db/index.js`, `circuits.service.js`, `ConflictError`, `crm.service.js`, `lab.service.js`, `support.service.js`, `task.service.js`, `storage.service.js`, `content.service.js`, `chat.service.js`, `errors.js`, `payment.service.js`, `notification.service.js`, `admin.service.js`, `referral.service.js`, `recording.service.js`, `manual.service.js`, `git-oauth.service.js`, `challenge-stage.service.js`, `challenge.service.js`, `group.service.js`, `user.service.js`, `ctf.service.js`, `conference.service.js`, `article.service.js`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `addEditorMethods()` (e.g. with `onKeyDown()` and `onKeyUp()`) actually correct?**
  _`addEditorMethods()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `__dirname`, `markerPath`, `repoRoot` to the rest of the system?**
  _346 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `codemirror.js` be split into smaller, more focused modules?**
  _Cohesion score 0.038644688644688646 - nodes in this community are weakly interconnected._
- **Should `javascript.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08878602987586787 - nodes in this community are weakly interconnected._