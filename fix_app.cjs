const fs = require('fs');

let content = fs.readFileSync('App.tsx', 'utf8');

const regex = /<header className="flex justify-between items-center mb-8 animate-fadeIn">\s*<div className="flex items-center gap-4">\s*<span className="hidden md:inline-block px-3 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 shadow-sm">[\s\S]*?<\/header>/;

const replacement = `<header className="flex justify-between items-center mb-8 animate-fadeIn">
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
                <div className="relative z-[100]">
                    <button 
                        onClick={() => setShowUsersDropdown(!showUsersDropdown)}
                        className="relative p-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
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
                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-[100]">
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
        </header>`;

content = content.replace(regex, replacement);
fs.writeFileSync('App.tsx', content);
console.log("Fixed App.tsx structural issue");
