import React, { useState, useEffect, useRef } from 'react';
import { NAV_ITEMS, ADMIN_NAV_ITEM } from './constants';
import { Role, Mission, User, Notification, Language, Theme } from './types';
import { translations } from './translations';
import { Dashboard } from './components/Dashboard';
import { MissionControl } from './components/MissionControl';
import { NotificationSystem } from './components/NotificationSystem';
import { AdminPanel } from './components/AdminPanel';
import { toolsService } from './services/apiService';
import { ReconView, VulnerabilitiesView, ReportsView } from './components/FunctionalViews';
import { Shield, LogOut, ChevronRight, User as UserIcon, Lock, Menu, X, Plus, Languages, Sun, Moon, Trash2, Users } from 'lucide-react';

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLang] = useState<Language>('en'); // Default Language
  const [theme, setTheme] = useState<Theme>('dark'); // Default Theme

  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [showUsersDropdown, setShowUsersDropdown] = useState(false);
  const usersDropdownRef = useRef<HTMLDivElement>(null);
  
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (usersDropdownRef.current && !usersDropdownRef.current.contains(event.target as Node)) {
        setShowUsersDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (usersDropdownRef.current && !usersDropdownRef.current.contains(event.target as Node)) {
        setShowUsersDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const [activeView, setActiveView] = useState('dashboard');
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // Modals
  const [showProfile, setShowProfile] = useState(false);
  const [showNewMission, setShowNewMission] = useState(false);

  // Login Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // Password Change State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // New Mission State
  const [newMissionName, setNewMissionName] = useState('');
  const [newMissionTarget, setNewMissionTarget] = useState('');

  const t = translations[lang];

  // Load user data and missions if token exists
  useEffect(() => {
      const token = localStorage.getItem('token');
      const username = localStorage.getItem('username');
      if (token && username) {
          toolsService.getMe().then(userData => {
              setUser({ id: userData.id, username: userData.username, role: userData.role || Role.VIEWER, lastLogin: new Date().toISOString(), password: '', isTempPassword: false });
              fetchMissions();
          }).catch(() => {
              localStorage.removeItem('token');
              localStorage.removeItem('username');
              setUser(null);
          });
      }
  }, []);

  
  useEffect(() => {
    let ws: WebSocket | null = null;
    if (user && user.username) {
        let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws/users/${user.username}`;
        
        try {
            ws = new WebSocket(wsUrl);

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'sync_users') {
                        setActiveUsers(data.users);
                    } else if (data.type === 'user_connected') {
                        setActiveUsers(data.users);
                        if (data.username !== user.username) {
                            addNotification('info', `${data.username} s'est connecté(e)`);
                        }
                    } else if (data.type === 'user_disconnected') {
                        setActiveUsers(data.users);
                    }
                } catch (e) {}
            };
            
            ws.onerror = (e) => {
                console.error("WS Error:", e);
            };
        } catch (e) {}

        return () => {
            if (ws) ws.close();
        };
    }
  }, [user]);

  const fetchMissions = async () => {
      try {
          const data = await toolsService.getMissions();
          setMissions(data);
      } catch (e) {
          console.error("Failed to load missions", e);
      }
  };

  // Apply theme to body body class for global styles if needed, but wrapping div works best with tailwind 'class' mode
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Notification Logic
  const addNotification = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, message, duration: 5000 }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const toggleLanguage = () => {
      setLang(prev => prev === 'en' ? 'fr' : 'en');
  };

  const toggleTheme = () => {
      setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        const data = await toolsService.login(username, password);
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('username', username);
        
        const userData = await toolsService.getMe();
        
        const loggedUser: User = { 
            id: userData.id, 
            username: username, 
            role: userData.role || Role.VIEWER, 
            lastLogin: new Date().toISOString(), 
            password: '', 
            isTempPassword: false 
        };
        setUser(loggedUser);
        setLoginError('');
        addNotification('success', `${t.welcome}, ${username}!`);
        fetchMissions();
    } catch (err) {
        setLoginError(t.loginFailed);
        addNotification('error', t.loginFailed);
    }
  };

  const handlePasswordChange = (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmPassword) {
          addNotification('error', t.pwMismatch);
          return;
      }
      if (newPassword.length < 5) {
          addNotification('error', t.pwShort);
          return;
      }
      if (user) {
          const updatedUser = { ...user, password: newPassword, isTempPassword: false };
          const updatedUsers = users.map(u => u.id === user.id ? updatedUser : u);
          setUsers(updatedUsers);
          setUser(updatedUser);
          setShowProfile(false);
          setNewPassword('');
          setConfirmPassword('');
          addNotification('success', t.pwUpdated);
      }
  };

  const handleCreateMission = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMissionName || !newMissionTarget) {
          addNotification('error', t.fillAllFields);
          return;
      }
      
      try {
          const newMission = await toolsService.createMission({
              name: newMissionName,
              target: newMissionTarget,
              status: 'Planning',
              progress: 0
          });
          
          setMissions([...missions, newMission]);
          setShowNewMission(false);
          setNewMissionName('');
          setNewMissionTarget('');
          addNotification('success', t.missionCreated);
          setSelectedMission(newMission);
      } catch (e: any) {
          console.error("Mission creation error:", e);
          addNotification('error', e.message || 'Failed to create mission');
      }
  };

  const handleDeleteMission = async (e: React.MouseEvent, id: any) => {
      e.stopPropagation(); // Prevent opening the mission
      if (!confirm(t.confirmDelete || 'Are you sure you want to delete this mission?')) return;
      
      try {
          await toolsService.deleteMission(id);
          setMissions(prev => prev.filter(m => m.id !== id));
          addNotification('success', 'Mission deleted');
      } catch (err) {
          addNotification('error', 'Failed to delete mission');
      }
  };

  // Login Screen
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] dark:from-slate-800 dark:via-slate-950 dark:to-slate-950 px-4 transition-colors duration-300">
        <NotificationSystem notifications={notifications} removeNotification={removeNotification} />
        <div className="w-full max-w-md p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl animate-scaleIn relative transition-colors duration-300">
          
          <div className="absolute top-4 right-4 flex gap-2">
            <button onClick={toggleTheme} className="text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={toggleLanguage} className="text-slate-500 hover:text-slate-900 dark:hover:text-white text-xs uppercase font-bold tracking-wider pt-1">
                {lang === 'en' ? 'FR' : 'EN'}
            </button>
          </div>

          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-100 dark:bg-blue-600/10 rounded-full border border-blue-200 dark:border-blue-500/20">
                <Shield size={48} className="text-blue-600 dark:text-blue-500" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-center text-slate-900 dark:text-white mb-2">PentestManager Pro</h1>
          <p className="text-center text-slate-500 dark:text-slate-400 mb-8">{t.secureGateway}</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.username}</label>
                <div className="relative group">
                    <UserIcon className="absolute left-3 top-3 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500 dark:group-focus-within:text-blue-400 transition-colors" size={18} />
                    <input 
                        type="text" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder={t.enterUsername}
                    />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t.password}</label>
                <div className="relative group">
                    <Lock className="absolute left-3 top-3 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500 dark:group-focus-within:text-blue-400 transition-colors" size={18} />
                    <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="••••••••"
                    />
                </div>
            </div>
            
            {loginError && <p className="text-red-500 dark:text-red-400 text-sm text-center animate-fadeIn">{loginError}</p>}
            
            <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 text-white font-semibold py-3 rounded-lg shadow-lg hover:shadow-blue-500/20 transition-all hover:scale-[1.02]"
            >
                {t.authenticate}
            </button>
          </form>
          
          <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-600">
            {t.authorizedOnly}
          </p>
        </div>
      </div>
    );
  }

  // Force Password Change Screen
  if (user.isTempPassword) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
             <NotificationSystem notifications={notifications} removeNotification={removeNotification} />
             <div className="w-full max-w-md p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl animate-scaleIn">
                <div className="text-center mb-6">
                    <Lock size={48} className="text-orange-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t.securityUpdate}</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">{t.updatePwDesc}</p>
                </div>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                    <input 
                        type="password"
                        placeholder={t.newPw}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    />
                    <input 
                        type="password"
                        placeholder={t.confirmPw}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    />
                    <button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-orange-500/20 transition-all">
                        {t.updatePwBtn}
                    </button>
                </form>
             </div>
        </div>
      );
  }

  const allNavItems = user.role === Role.ADMIN ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  // Main Layout
  return (
    <div className={`flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 animate-fadeIn transition-colors duration-300`}>
      <NotificationSystem notifications={notifications} removeNotification={removeNotification} />
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
            className="fixed inset-0 bg-black/60 z-20 md:hidden animate-fadeIn"
            onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-30 h-full w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <Shield className="text-blue-600 dark:text-blue-500" size={28} />
                <h1 className="font-bold text-slate-900 dark:text-white tracking-tight">PentestManager</h1>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                <X size={24} />
            </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {allNavItems.map((item) => {
             const Icon = item.icon;
             const isActive = activeView === item.id;
             // Use translation key dynamically
             const label = t[item.id as keyof typeof t] || item.label;

             return (
                <button
                    key={item.id}
                    onClick={() => {
                        setActiveView(item.id);
                        setSelectedMission(null);
                        setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                    <Icon size={18} />
                    {label}
                </button>
             );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
           {/* Theme Toggle */}
           <button 
                onClick={toggleTheme}
                className="w-full flex items-center gap-3 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors"
           >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                <span>{t.changeTheme || "Theme"}</span>
           </button>

           {/* Language Toggle */}
           <button 
                onClick={toggleLanguage}
                className="w-full flex items-center gap-3 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors"
           >
                <Languages size={18} />
                <span className="uppercase">{lang}</span>
           </button>

          <div 
            className="flex items-center gap-3 px-4 py-3 mb-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors group"
            onClick={() => setShowProfile(true)}
          >
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-lg group-hover:scale-105 transition-transform">
                {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate capitalize group-hover:text-indigo-500 dark:group-hover:text-indigo-300 transition-colors">{user.username}</p>
                <p className="text-xs text-slate-500 truncate">{user.role}</p>
            </div>
          </div>
          <button
            onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('username');
                setUser(null);
                addNotification('success', t.signOut);
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg text-sm font-medium transition-all"
          >
            <LogOut size={18} />
            {t.signOut}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 md:p-8 w-full transition-colors duration-300">
        {/* Breadcrumbs / Header */}
        <header className="flex justify-between items-center mb-8 animate-fadeIn relative z-[100]">
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => setSidebarOpen(true)}
                    className="md:hidden text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                    <Menu size={24} />
                </button>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white relative z-0">
                    {selectedMission ? t.missionControl : (t[activeView as keyof typeof t] || 'Dashboard')}
                </h2>
            </div>

            <div className="flex items-center gap-4">
                
                {/* Active Users Dropdown (Now placed before System Status, with higher z-index) */}
                <div className="relative z-[100]" ref={usersDropdownRef}>
                    <button 
                        onClick={() => setShowUsersDropdown(!showUsersDropdown)}
                        className="relative p-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition transform active:scale-90 duration-200"
                        title="Utilisateurs connectés"
                    >
                        <Users size={18} />
                        {activeUsers.length > 1 && (
                            <span className="absolute top-0 right-0 h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                            </span>
                        )}
                        <span className="absolute -bottom-1 -right-1 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {activeUsers.length}
                        </span>
                    </button>
                    
                    {showUsersDropdown && (
                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-[100] animate-fadeIn">
                            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Utilisateurs actifs
                            </div>
                            <ul className="max-h-48 overflow-y-auto">
                                {activeUsers.map((username, idx) => (
                                    <li key={idx} className="px-4 py-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                        {username} {username === user?.username ? "(Vous)" : ""}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <span className="hidden md:inline-block px-3 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 shadow-sm relative z-0">
                    {t.systemStatus}: <span className="text-emerald-500 dark:text-emerald-400 font-semibold animate-pulse">{t.online}</span>
                </span>
            </div>
        </header>

        {/* View Switching Container - Key prop forces re-animation on view change */}
        <div key={selectedMission ? 'mission-control' : activeView} className="animate-fadeIn w-full">
            {selectedMission ? (
            <MissionControl 
                mission={selectedMission} 
                onBack={() => setSelectedMission(null)} 
                notify={addNotification}
                lang={lang}
                userRole={user?.role || "Viewer"}
            />
            ) : (
            <>
                {activeView === 'dashboard' && <Dashboard missions={missions} lang={lang}
                userRole={user?.role || "Viewer"} />}
                
                {activeView === 'missions' && (
                <div className="space-y-6">
                    {user.role !== 'Viewer' && user.role !== 'viewer' && user.role !== 'VIEWER' && (
                    <div className="flex justify-end">
                        <button 
                            onClick={() => setShowNewMission(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg hover:shadow-blue-500/25 transition-all"
                        >
                            <Plus size={16} /> {t.newMission}
                        </button>
                    </div>
                    )}
                    <div className="grid grid-cols-1 gap-4">
                        {missions.map(mission => (
                        <div 
                            key={mission.id}
                            onClick={() => setSelectedMission(mission)}
                            className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer group hover:-translate-y-1 shadow-sm relative"
                        >
                            {(user.role === Role.ADMIN || user.role === 'Admin' || user.role === 'admin') && (
                                <button
                                    onClick={(e) => handleDeleteMission(e, mission.id)}
                                    className="absolute top-6 right-6 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors z-10"
                                    title={t.delete || "Delete"}
                                >
                                    <Trash2 size={18} />
                                </button>
                            )}
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors pr-10">{mission.name}</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{mission.target}</p>
                                </div>
                                <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-600 transition-colors group-hover:bg-slate-200 dark:group-hover:bg-slate-600 mr-10">
                                    {mission.status}
                                </span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 mb-4 overflow-hidden">
                                <div className="bg-blue-500 h-2 rounded-full transition-all duration-1000 ease-out" style={{ width: `${mission.progress}%` }}></div>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Progress: {mission.progress}%</span>
                                <div className="flex gap-4">
                                    <span className="text-slate-500 dark:text-slate-400"><span className="text-slate-900 dark:text-white font-bold">{mission.vulnerabilities.length}</span> Findings</span>
                                    <span className="text-slate-500 dark:text-slate-400"><span className="text-red-500 dark:text-red-400 font-bold">{mission.vulnerabilities.filter(v => v.criticality === 'Critical').length}</span> Critical</span>
                                </div>
                            </div>
                        </div>
                        ))}
                    </div>
                </div>
                )}

                {activeView === 'recon' && <ReconView missions={missions} lang={lang}
                userRole={user?.role || "Viewer"} />}
                {activeView === 'vulns' && <VulnerabilitiesView missions={missions} lang={lang}
                userRole={user?.role || "Viewer"} />}
                {activeView === 'reports' && <ReportsView missions={missions} lang={lang}
                userRole={user?.role || "Viewer"} />}

                {activeView === 'admin' && user.role === Role.ADMIN && (
                    <AdminPanel notify={addNotification} users={users} setUsers={setUsers} lang={lang}
                userRole={user?.role || "Viewer"} />
                )}
                {activeView === 'admin' && user.role !== Role.ADMIN && (
                    <div className="flex flex-col items-center justify-center h-[400px] text-slate-500 animate-fadeIn">
                        <Lock size={48} className="mb-4 text-red-500" />
                        <h3 className="text-xl text-slate-900 dark:text-white font-semibold">{t.accessDenied}</h3>
                        <p>{t.accessDeniedDesc}</p>
                    </div>
                )}
            </>
            )}
        </div>
      </main>

      {/* Profile Modal */}
      {showProfile && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fadeIn">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 w-full max-w-sm relative shadow-2xl animate-scaleIn">
                  <button onClick={() => setShowProfile(false)} className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                      <X size={20} />
                  </button>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t.userProfile}</h3>
                  <div className="mb-6">
                      <p className="text-slate-500 dark:text-slate-400 text-sm">{t.username}: <span className="text-slate-900 dark:text-white">{user.username}</span></p>
                      <p className="text-slate-500 dark:text-slate-400 text-sm">{t.role}: <span className="text-slate-900 dark:text-white">{user.role}</span></p>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{t.changePw}</h4>
                  <form onSubmit={handlePasswordChange} className="space-y-3">
                      <input 
                        type="password" 
                        placeholder={t.newPw}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                      <input 
                        type="password" 
                        placeholder={t.confirmPw}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                      <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-medium transition-colors">
                          {t.updatePwBtn}
                      </button>
                  </form>
              </div>
          </div>
      )}

      {/* New Mission Modal */}
      {showNewMission && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fadeIn">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 w-full max-w-md relative shadow-2xl animate-scaleIn">
                  <button onClick={() => setShowNewMission(false)} className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                      <X size={20} />
                  </button>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Plus size={20} className="text-blue-500" /> {t.newMission}
                  </h3>
                  <form onSubmit={handleCreateMission} className="space-y-4">
                      <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t.missionName}</label>
                          <input 
                            type="text" 
                            value={newMissionName}
                            onChange={e => setNewMissionName(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder={t.missionNamePlaceholder}
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t.target} (IP/Domain)</label>
                          <input 
                            type="text" 
                            value={newMissionTarget}
                            onChange={e => setNewMissionTarget(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder={t.targetPlaceholder}
                          />
                      </div>
                      <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors shadow-lg hover:shadow-blue-500/20">
                          {t.initialize}
                      </button>
                  </form>
              </div>
          </div>
      )}

    </div>
  );
}