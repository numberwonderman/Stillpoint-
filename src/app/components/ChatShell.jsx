"use client";

/**
 * ChatShell — top-level application layout.
 * Desktop: persistent sidebar rail + central chat area.
 * Mobile: slide-over sidebar drawer with backdrop overlay.
 */
export default function ChatShell({ sidebar, children, sidebarOpen, onCloseSidebar }) {
  return (
    <div className="flex h-[100dvh] w-full max-w-full overflow-hidden bg-bg text-text">
      {/* Desktop Sidebar Rail */}
      <aside className="hidden w-72 shrink-0 flex-col overflow-hidden border-r border-border bg-surface md:flex">
        {sidebar}
      </aside>

      {/* Mobile Drawer Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseSidebar}
            aria-hidden="true"
          />

          {/* Drawer container */}
          <aside className="fixed inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col overflow-hidden border-r border-border bg-surface shadow-2xl transition-transform">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="relative flex flex-1 min-w-0 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
