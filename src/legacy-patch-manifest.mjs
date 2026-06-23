import { babyLegacyPatchParts } from './features/baby/index.js'
import { calendarLegacyPatchParts } from './features/calendar/index.js'
import { communityLegacyPatchParts } from './features/community/index.js'
import { diaryLegacyPatchParts } from './features/diary/index.js'
import { familyLegacyPatchParts } from './features/family/index.js'
import { homeLegacyPatchParts } from './features/home/index.js'
import { ledgerLegacyPatchParts } from './features/ledger/index.js'
import { restaurantLegacyPatchParts } from './features/restaurant/index.js'
import { travelLegacyPatchParts } from './features/travel/index.js'

export const legacyPatchParts = [
  'shared/legacy-patch/00-bootstrap.js',
  'shared/legacy-patch/01-auth-session.js',
  'shared/legacy-patch/01-account-info-model.js',
  'shared/legacy-patch/01-account-info-view.js',
  'shared/legacy-patch/01-account-info.js',
  calendarLegacyPatchParts.ui,
  'shared/legacy-patch/02-ui-cleanup.js',
  familyLegacyPatchParts.group,
  'shared/legacy-patch/03-refresh-orchestrator.js',
  babyLegacyPatchParts.profileDialogs,
  diaryLegacyPatchParts.composerUi,
  'shared/legacy-patch/04-navigation.js',
  communityLegacyPatchParts.board,
  'shared/legacy-patch/05-home-and-shared-ui.js',
  'shared/legacy-patch/06-api-core.js',
  'shared/legacy-patch/06-place-search.js',
  calendarLegacyPatchParts.api,
  homeLegacyPatchParts.api,
  ledgerLegacyPatchParts.api,
  restaurantLegacyPatchParts.api,
  'shared/legacy-patch/07-form-normalizers.js',
  travelLegacyPatchParts.listView,
  travelLegacyPatchParts.detailView,
  travelLegacyPatchParts.recordView,
  travelLegacyPatchParts.formUi,
  diaryLegacyPatchParts.api,
  travelLegacyPatchParts.apiRenderer,
  calendarLegacyPatchParts.serverPanels,
  travelLegacyPatchParts.serverPanels,
  diaryLegacyPatchParts.serverPanels,
  babyLegacyPatchParts.apiRenderer,
  'shared/legacy-patch/08-server-refresh-and-family.js',
  calendarLegacyPatchParts.scheduleSubmit,
  travelLegacyPatchParts.sync,
  diaryLegacyPatchParts.sync,
  babyLegacyPatchParts.submit,
  'shared/legacy-patch/09-global-events.js',
]
