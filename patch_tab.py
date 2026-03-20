import re

with open("components/MissionControl.tsx", "r", encoding="utf-8") as f:
    orig = f.read()

content = orig

# 1. Imports: Make sure TerminalSquare and Edit2 are imported.
if "Edit2" not in content or "TerminalSquare" not in content:
    content = content.replace("PlayCircle, Square, Server, ChevronRight, Activity, Cpu, Network, Database, Lock, Globe, FileSearch",
                              "PlayCircle, Square, Server, ChevronRight, Activity, Cpu, Network, Database, Lock, Globe, FileSearch, TerminalSquare, Edit2")

# 2. Add state
if "setCustomCLIInput" not in content:
    content = content.replace("const [activeTab, setActiveTab] = useState('autopilot');",
                              "const [activeTab, setActiveTab] = useState('autopilot');\n    const [customCLIInput, setCustomCLIInput] = useState('');")

# 3. Add Custom tab button in navigation
tab_button = """
                <button
                    onClick={() => setActiveTab('custom')}
                    className={`flex items-center gap-2 p-3 w-full text-left rounded-lg transition-colors ${
                        activeTab === 'custom' ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                >
                    <TerminalSquare size={20} />
                    <span className="font-medium">{t.customCLI || 'Custom CLI'}</span>
                </button>
"""
if "TerminalSquare" not in orig: # simple check to avoid double injection
    content = content.replace("</nav>", tab_button + "</nav>")

# 4. Add Custom tab content
custom_content = """
                {activeTab === 'custom' && (
                    <div className="space-y-4">
                        <div className="bg-slate-50 dark:bg-slate-700 p-4 rounded-lg border border-slate-200 dark:border-slate-600">
                            <h3 className="font-semibold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                                <TerminalSquare size={18} className="text-indigo-500" />
                                Custom Execution
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                Enter a manual tool command to run against the target.
                            </p>
                            <div className="space-y-3">
                                <textarea 
                                    value={customCLIInput}
                                    onChange={(e) => setCustomCLIInput(e.target.value)}
                                    className="w-full text-sm font-mono p-3 bg-slate-900 text-green-400 rounded-md border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
                                    placeholder="e.g. nmap -sC -sV target.com"
                                />
                                <button 
                                    onClick={() => runCommand('Custom CLI', customCLIInput)}
                                    disabled={isCommandRunning || !customCLIInput.trim()}
                                    className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg text-white font-medium transition-colors ${
                                        isCommandRunning || !customCLIInput.trim() ? 'bg-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                                    }`}
                                >
                                    <PlayCircle size={18} />
                                    Launch Command
                                </button>
                            </div>
                        </div>
                    </div>
                )}
"""
if "activeTab === 'custom'" not in content:
    content = content.replace("{activeTab === 'scans' && (", custom_content + "\n                {activeTab === 'scans' && (")

with open("components/MissionControl.tsx", "w", encoding="utf-8") as f:
    f.write(content)
