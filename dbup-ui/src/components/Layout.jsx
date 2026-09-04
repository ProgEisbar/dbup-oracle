/**
 * Layout — wraps every page.
 * Top bar with application gradient accent line.
 */
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Notification from './Notification.jsx'

export default function Layout() {
  return (
    <div className="flex min-h-screen" style={{ background: '#111629' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top accent bar — used as a visual accent */}
        <div className="dbup-gradient-bar shrink-0" />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <Notification />
    </div>
  )
}
