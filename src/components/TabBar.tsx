import { t } from '~/i18n/strings.ts';

const TABS = [
  { href: '/', icon: '◆', label: t.nav.home },
  { href: '/course', icon: '≡', label: t.nav.course },
  { href: '/review', icon: '↻', label: t.nav.review },
  { href: '/dictionary', icon: '⌕', label: t.nav.dictionary },
  { href: '/settings', icon: '⚙', label: t.nav.settings },
] as const;

export function TabBar({ path }: { path: string }) {
  return (
    <nav class="tabbar" aria-label="Primary">
      {TABS.map((tab) => {
        const active = tab.href === '/' ? path === '/' : path.startsWith(tab.href);
        return (
          <a key={tab.href} href={`#${tab.href}`} aria-current={active ? 'page' : undefined}>
            <span class="tab-icon" aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
