import re

with open("components/MissionControl.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update imports
content = content.replace(
    "import { Play, FileText, CheckCircle, AlertTriangle, Terminal as TerminalIcon, Eye, Search, Command, PlayCircle, Zap } from 'lucide-react';",
    "import { Play, FileText, CheckCircle, AlertTriangle, Terminal as TerminalIcon, Eye, Search, Command, PlayCircle, Zap, Edit2, TerminalSquare } from 'lucide-react';"
)

# 2. Add 'custom' to activeTab state
content = content.replace(
    "const [activeTab, setActiveTab] = useState<'overview' | 'actions' | 'findings' | 'report' | 'auto'>('overview');",
    "const [activeTab, setActiveTab] = useState<'overview' | 'actions' | 'findings' | 'report' | 'auto' | 'custom'>('overview');\n  const [customCLIInput, setCustomCLIInput] = useState<string>('');\n  const [editingCommandFor, setEditingCommandFor] = useState<string | null>(null);\n  const [editedCommand, setEditedCommand] = useState<string>('');"
)

# 3. Add Custom CLI tab in Navigation
content = content.replace(
    "{ id: 'auto', label: 'Auto-Pilot' },\n            { id: 'findings'",
    "{ id: 'auto', label: 'Auto-Pilot' },\n            { id: 'custom', label: t.customCLI },\n            { id: 'findings'"
)

# 4. We need to implement a sub-component ToolCard inside the file, or just above the return.
# It's better to just write the raw JSX for the Custom CLI tab.
# Let's insert the Custom CLI tab content right before {activeTab === 'findings' ...}
custom_cli_jsx = """
        {activeTab === 'custom' && (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                <div className="lg:col-span-2 bg-slate-900 border-slate-700 rounded-xl p-6 border shadow-2xl flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-4 cursor-pointer text-blue-400 hover:text-blue-300">
                            <TerminalSquare size={20} />
                            <h3 className="text-lg font-mono font-bold tracking-tight">Root Terminal (Custom CLI)</h3>
                        </div>
                        <p className="text-slate-400 text-sm mb-6">Exécutez n'importe quelle commande bash, python ou outil installé sur la machine distante. Utilisera la même logique de streaming.</p>
                        
                        <div className="bg-black/50 border border-slate-800 rounded p-4 mb-4">
                            <div className="flex items-center gap-3">
                                <span className="text-emerald-500 font-mono">root@pentest:~#</span>
                                <input 
                                    type="text" 
                                    value={customCLIInput}
                                    onChange={(e) => setCustomCLIInput(e.target.value)}
                                    placeholder="ex: nmap -p- 192.168.1.10 -T4"
                                    className="bg-transparent text-white font-mono flex-1 focus:outline-none w-full"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && customCLIInput && !isCommandRunning) {
                                            runCommand('Custom CLI', customCLIInput);
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                         <button 
                             onClick={() => setCustomCLIInput('')}
                             className="text-slate-400 hover:text-white px-4 py-2 hover:bg-slate-800 rounded transition-colors"
                         >
                             Clear
                         </button>
                         <button 
                             onClick={() => { if(customCLIInput) runCommand('Custom CLI', customCLIInput); }}
                             disabled={isCommandRunning || !customCLIInput}
                             className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded font-medium disabled:opacity-50 transition-colors flex items-center gap-2"
                         >
                             <Play size={16} /> Run Command
                         </button>
                    </div>
                </div>
                
                {/* Terminal Window on the right */}
                <div className="bg-slate-900 border-slate-700 rounded-xl flex flex-col border shadow-2xl overflow-hidden h-[600px]">
                    {/* Reusing existing terminal mapping or moving it to a helper is complex, let's just duplicate the CLI view for custom tab or we can just render the existing one globally! */}
                </div>
             </div>
        )}
"""
# Wait, the Terminal Window is already globally located at the right side for 'actions' tab.
# Let's check how 'actions' tab is structured.
