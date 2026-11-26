import { NavLink, useNavigate } from 'react-router';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import { useAuth } from './AuthContext';
import logoFull from './assets/cortex-hub-logo.png';
import logoMark from './assets/cortex-hub-mark.png';
import './navbar.css';

const Icon = ({ children }) => (
    <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);

const links = [
    { to: '/Home', label: 'Dashboard', icon: (
        <Icon><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></Icon>) },
    { to: '/Ai', label: 'Ai Agent', icon: (
        <Icon><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></Icon>) },
    { to: '/Task', label: 'Task Manager', icon: (
        <Icon><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M8 12l3 3 5-6" /></Icon>) },
    { to: '/Note', label: 'Note', icon: (
        <Icon><path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Icon>) },
    { to: '/Prompt', label: 'Prompt Library', icon: (
        <Icon><path d="M4 5h16v11H9l-5 4V5z" /><path d="M8.5 10l2 1.5-2 1.5M13 13h3" /></Icon>) },
    { to: '/FileManager', label: 'File Manager', icon: (
        <Icon><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></Icon>) },
];

function Navbar() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const name = user?.displayName || 'User';
    const initial = name.trim().charAt(0).toUpperCase();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/Login');
        } catch (err) {
            console.error('Logout failed:', err);
        }
    };

    return (
        <nav className="navbar" aria-label="Main">
            <h3 className="brand">
                {/* full logo on wide screens, icon-only mark on the 64px rail */}
                <picture className="brand-logo">
                    <source media="(max-width: 900px)" srcSet={logoMark} />
                    <img src={logoFull} alt="Cortex Hub – Your AI Workspace" />
                </picture>
            </h3>

            <ul>
                {links.map(({ to, label, icon }) => (
                    <li key={to}>
                        <NavLink to={to} title={label}
                            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                            {icon}
                            <span className="nav-text">{label}</span>
                        </NavLink>
                    </li>
                ))}
            </ul>

            <div className="profile">
                {user?.photoURL ? (
                    <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
                ) : (
                    <div className="avatar avatar-fallback" aria-hidden="true">{initial}</div>
                )}
                <div className="profile-info">
                    <strong>{name.split(' ')[0]}</strong>
                    <span>{user?.email}</span>
                </div>
                <button type="button" className="logout-btn" onClick={handleLogout}
                    title="Logout" aria-label="Logout">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9" />
                    </svg>
                </button>
            </div>
        </nav>
    );
}

export default Navbar;