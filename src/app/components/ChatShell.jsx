"use client";

/**
 * ChatShell — top-level layout wrapper for the chat application.
 * Desktop: Dynamic width sidebar (w-72 expanded, w-16 collapsed) with smooth transitions.
 * Mobile: Slide-over drawer overlay with backdrop blur.
 */
export default function ChatShell({ sidebar, children, sidebarOpen, onCloseSidebar, isCollapsed }) {
  return (
    <div className="flex h-[100dvh] w-full max-w-full overflow-hidden bg-bg text-text">
      {/* Desktop Sidebar Container */}
      <aside
        className={`hidden shrink-0 flex-col overflow-hidden border-r border-border/40 bg-surface md:flex transition-all duration-300 ease-in-out ${
          isCollapsed ? "w-16" : "w-72"
        }`}
      >
        {sidebar}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity animate-backdrop-fade"
            onClick={onCloseSidebar}
            aria-hidden="true"
          />

          {/* Mobile Drawer */}
          <aside className="fixed inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col overflow-hidden border-r border-border/50 bg-surface shadow-2xl transition-transform animate-drawer-slide">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main Content View */}
      <div className="relative flex flex-1 min-w-0 flex-col overflow-hidden bg-bg">
        {children}
      </div>
    </div>
  );
}
