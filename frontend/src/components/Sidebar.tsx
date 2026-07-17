import { NavLink } from 'react-router-dom';

type Tab = 'pending' | 'active';

interface SidebarProps {
  activeTab: Tab;
  activeCount: number;
  pendingCount: number;
}

export function Sidebar({ activeTab, activeCount, pendingCount }: SidebarProps) {
  const tabs: { id: Tab; label: string; count: number; to: string }[] = [
    { id: 'pending', label: 'Pending', count: pendingCount, to: '/pending' },
    { id: 'active', label: 'Active', count: activeCount, to: '/active' },
  ];

  return (
    <nav
      aria-label="Rule views"
      className="rounded-xl border border-[#232a33] bg-[#0f141b] p-1.5 max-sm:grid max-sm:grid-cols-2"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.id}
          to={tab.to}
          className={[
            'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition',
            activeTab === tab.id
              ? 'bg-[#161b22] text-[#e6edf3]'
              : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]',
          ].join(' ')}
        >
          <span>{tab.label}</span>
          <span className="text-[11px] tabular-nums text-[#8b949e]">{tab.count}</span>
        </NavLink>
      ))}
    </nav>
  );
}
