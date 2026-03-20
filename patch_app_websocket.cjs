const fs = require('fs');

let content = fs.readFileSync('App.tsx', 'utf8');

// 1. Add Users icon
content = content.replace(
    /import { ([^}]+) } from 'lucide-react';/,
    "import { $1, Users } from 'lucide-react';"
);

// 2. Add State for active users
const stateInjectPoint = "const [theme, setTheme] = useState<Theme>('dark'); // Default Theme";
const stateInject = "const [theme, setTheme] = useState<Theme>('dark'); // Default Theme\n\n  const [activeUsers, setActiveUsers] = useState<string[]>([]);\n  const [showUsersDropdown, setShowUsersDropdown] = useState(false);";
content = content.replace(stateInjectPoint, stateInject);

// 3. Add useEffect for websockets
const extractMatch = content.match(/const fetchMissions = async \(\) => \{/);
if (extractMatch) {
    const wsEffect = `
  useEffect(() => {
    let ws: WebSocket | null = null;
    if (user && user.username) {
        let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = \`\${protocol}//\${window.location.host}/api/ws/users/\${user.username}\`;
        
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
                            addNotification('info', \`\${data.username} s'est connecté(e)\`);
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

  `;
    content = content.replace("const fetchMissions = async () => {", wsEffect + "const fetchMissions = async () => {");
}

// 4. Update Header with the dropdown
const headerTargetString = `<div className="flex items-center gap-4">
                <span className="hidden md:inline-block px-3 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 shadow-sm">
                    {t.systemStatus}: <span className="text-emerald-500 dark:text-emerald-400 font-semibold animate-pulse">{t.online}</span>
                </span>
            </div>`;

// Check if we can find the string
if (content.includes("className=\"flex items-center gap-4\"")) {
    // we need a robust regex or replacement
    const replacement = `
            <div className="flex items-center gap-4">
                <span className="hidden md:inline-block px-3 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 shadow-sm">
                    {t.systemStatus}: <span className="text-emerald-500 dark:text-emerald-400 font-semibold animate-pulse">{t.online}</span>
                </span>
                
                {/* Active Users Dropdown */}
                <div className="relative">
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
                        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
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
            </div>`;

    let contentSplit = content.split('<div className="flex items-center gap-4">');
    let firstPart = contentSplit[0];
    let remainingPart = contentSplit.slice(1).join('<div className="flex items-center gap-4">');
    let endingPart = remainingPart.split('</header>')[1];
    if(endingPart) {
      content = firstPart + replacement + "\n        </header>" + endingPart;
    }
}

fs.writeFileSync('App.tsx', content);
console.log("App.tsx modified");
