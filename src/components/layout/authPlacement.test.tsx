import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';
import type { AuthContextValue } from '../../contexts/AuthContext';
import { TopNavBar } from './TopNavBar';
import { Sidebar } from './Sidebar';
import {
  NotificationSettings,
  ThemePreferences,
} from '../../types/calendar';
import { buildCategoryMap, getCategoryTagsByScope } from '../../constants/categories';

const mockUseAuth = vi.fn<() => AuthContextValue>();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

function makeAuthState(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    session: null,
    loading: false,
    isConfigured: true,
    authError: null,
    clearAuthError: vi.fn(),
    signInWithGoogle: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeFakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    app_metadata: {},
    user_metadata: {
      avatar_url: 'https://example.com/avatar.png',
      email: 'alex@example.com',
    },
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    email: 'alex@example.com',
    ...overrides,
  } as User;
}

const noop = () => {};
const defaultNotificationSettings: NotificationSettings = {
  soundEnabled: true,
  desktopEnabled: true,
  hasRequestedPermission: false,
};
const defaultThemePreferences: ThemePreferences = {
  globalTheme: 'light',
  monthThemes: {},
  weekThemes: {},
};
const categoryMap = buildCategoryMap([]);
const eventCategories = getCategoryTagsByScope('event', []).map(
  (t) => categoryMap[t.id]
);
const taskCategories = getCategoryTagsByScope('task', []).map(
  (t) => categoryMap[t.id]
);

function renderTopNavBar(unsyncedCount = 0): string {
  return renderToStaticMarkup(
    <TopNavBar
      view="week"
      currentDate={new Date('2026-11-11T09:00:00')}
      activeTheme="light"
      activeThemeSource="global"
      themeOverrideCount={0}
      searchQuery=""
      allEvents={[]}
      categoryMap={categoryMap}
      permissionStatus="default"
      notificationSettings={defaultNotificationSettings}
      upcomingReminders={[]}
      unsyncedCount={unsyncedCount}
      isSyncing={false}
      onRetrySync={noop}
      onToggleSidebar={noop}
      onChangeView={noop}
      onNavigatePrev={noop}
      onNavigateNext={noop}
      onJumpToday={noop}
      onSearchChange={noop}
      onJumpToSearchResult={noop}
      onOpenThemeStudio={noop}
      onRequestNotificationPermission={noop}
      onUpdateNotificationSettings={noop}
      onTriggerPreviewAlert={noop}
      onScheduleLiveTenMinDemo={noop}
    />
  );
}

function renderSidebar(isOpen = true, isMobileDrawerOpen = false): string {
  return renderToStaticMarkup(
    <Sidebar
      isOpen={isOpen}
      isMobileDrawerOpen={isMobileDrawerOpen}
      currentDate={new Date('2026-11-11T09:00:00')}
      selectedDate={new Date('2026-11-11T09:00:00')}
      occurrences={[]}
      eventCategories={eventCategories}
      taskCategories={taskCategories}
      visibleCategories={['class-sched', 'academic']}
      visibleScopes={['event', 'task']}
      themePrefs={defaultThemePreferences}
      onCloseMobileDrawer={noop}
      onCreateEvent={noop}
      onSelectMiniDate={noop}
      onToggleCategory={noop}
      onToggleScope={noop}
      onSetScopeFilter={noop}
      onAddCustomCategory={() => ({
        id: 'custom-1',
        label: 'Custom',
        color: '#ff0000',
        isCustom: true,
        scope: 'event',
      })}
      onDeleteCustomCategory={noop}
      onSetGlobalTheme={noop}
      onOpenThemeStudio={noop}
      onApplySplitWeekDemo={noop}
    />
  );
}

describe('Auth controls moved from TopNavBar to Sidebar footer', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('removes Sign in and Log out/Sign out controls from TopNavBar in both auth states', () => {
    mockUseAuth.mockReturnValue(makeAuthState({ user: null }));
    const signedOutHeader = renderTopNavBar();
    expect(signedOutHeader).not.toContain('Sign in');
    expect(signedOutHeader).not.toContain('Sign out');
    expect(signedOutHeader).not.toContain('Log out');

    mockUseAuth.mockReturnValue(
      makeAuthState({ user: makeFakeUser() })
    );
    const signedInHeader = renderTopNavBar(2);
    expect(signedInHeader).not.toContain('Sign in');
    expect(signedInHeader).not.toContain('Sign out');
    expect(signedInHeader).not.toContain('Log out');
    expect(signedInHeader).not.toContain('alex@example.com');
    // Unsynced sync status indicator in header remains intact
    expect(signedInHeader).toContain('Not synced');
  });

  it('renders Sign in button inside the Sidebar bottom footer when signed out', () => {
    mockUseAuth.mockReturnValue(makeAuthState({ user: null }));
    const html = renderSidebar(true, false);

    expect(html).toContain('sidebar-shell flex flex-col h-full');
    expect(html).toContain('<footer class="mt-auto shrink-0 border-t border-theme-border');
    expect(html).toContain('Sign in');
    expect(html).not.toContain('Log out');

    // Footer comes after Category Tags
    const tagsIdx = html.indexOf('Category Tags');
    const footerIdx = html.indexOf('<footer');
    const signInIdx = html.indexOf('Sign in');
    expect(tagsIdx).toBeGreaterThan(-1);
    expect(footerIdx).toBeGreaterThan(tagsIdx);
    expect(signInIdx).toBeGreaterThan(footerIdx);
  });

  it('renders user email, avatar fallback, and Log out button inside the Sidebar bottom footer when signed in', () => {
    mockUseAuth.mockReturnValue(makeAuthState({ user: makeFakeUser() }));
    const htmlWithAvatar = renderSidebar(true, false);

    expect(htmlWithAvatar).toContain('<footer class="mt-auto shrink-0 border-t border-theme-border');
    expect(htmlWithAvatar).toContain('alex@example.com');
    expect(htmlWithAvatar).toContain('https://example.com/avatar.png');
    expect(htmlWithAvatar).toContain('Log out');
    expect(htmlWithAvatar).not.toContain('Sign in');

    mockUseAuth.mockReturnValue(
      makeAuthState({
        user: makeFakeUser({
          email: 'sam@example.com',
          user_metadata: {},
        }),
      })
    );
    const htmlWithoutAvatar = renderSidebar(true, false);
    expect(htmlWithoutAvatar).toContain('sam@example.com');
    expect(htmlWithoutAvatar).toContain('>S</span>');
    expect(htmlWithoutAvatar).toContain('Log out');
    expect(htmlWithoutAvatar).not.toContain('Sign in');
  });

  it('collapses desktop sidebar cleanly when closed and shows auth controls in mobile drawer when open', () => {
    mockUseAuth.mockReturnValue(makeAuthState({ user: null }));
    const closedHtml = renderSidebar(false, false);

    expect(closedHtml).toContain('width:0px');
    expect(closedHtml).toContain('opacity:0');
    expect(closedHtml).toContain('pointer-events-none');
    expect(closedHtml).not.toContain('fixed inset-0 z-50 lg:hidden flex');

    const mobileOpenHtml = renderSidebar(false, true);
    expect(mobileOpenHtml).toContain('fixed inset-0 z-50 lg:hidden flex');
    expect(mobileOpenHtml.match(/<footer/g)).toHaveLength(2);
    expect(mobileOpenHtml.match(/>Sign in</g)).toHaveLength(2);
  });

  it('displays authError alert inside the Sidebar footer when present', () => {
    mockUseAuth.mockReturnValue(
      makeAuthState({
        user: null,
        authError: 'Supabase is not configured.',
      })
    );
    const html = renderSidebar(true, false);

    const footerIdx = html.indexOf('<footer');
    const errIdx = html.indexOf('Supabase is not configured.');
    expect(footerIdx).toBeGreaterThan(-1);
    expect(errIdx).toBeGreaterThan(footerIdx);
    expect(html).toContain('Dismiss sign-in message');
  });
});
