import re

with open("components/MissionControl.tsx", "r", encoding="utf-8") as f:
    orig = f.read()

content = orig

# Add custom to main tabs
if "{ id: 'custom', label: t.customCLI || 'Custom CLI' }" not in content:
    content = content.replace("{ id: 'auto', label: 'Auto-Pilot' },",
                              "{ id: 'auto', label: 'Auto-Pilot' },\n            { id: 'custom', label: t.customCLI || 'Custom CLI' },")

# Add Custom tab content
custom_content = """

        {activeTab === 'custom' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Terminal Libre</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Tapez directement vos commandes ici. Les résultats s'afficheront dans le terminal global à droite.
              </p>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customCLIInput}
                  onChange={(e) => setCustomCLIInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customCLIInput.trim() && !isCommandRunning) {
                      runCommand('Custom CLI', customCLIInput);
                    }
                  }}
                  className="flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-green-400 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Ex: nmap -sC -sV target.com"
                />
                <button
                  onClick={() => runCommand('Custom CLI', customCLIInput)}
                  disabled={isCommandRunning || !customCLIInput.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Play size={20} /> Lancer
                </button>
              </div>
            </div>
          </div>
        )}
"""

if "{activeTab === 'custom' &&" not in content:
    content = content.replace("{activeTab === 'findings' && (", custom_content + "\n        {activeTab === 'findings' && (")

# Add state
if "customCLIInput" not in content:
    content = content.replace("const [activeTab, setActiveTab] = useState(",
                              "const [customCLIInput, setCustomCLIInput] = useState('');\n  const [activeTab, setActiveTab] = useState(")

# Add missing import Edit2 and PlayCircle if they are missing
if "Edit2" not in content:
    content = content.replace("Terminal as TerminalIcon", "Terminal as TerminalIcon, Edit2, PlayCircle")


with open("components/MissionControl.tsx", "w", encoding="utf-8") as f:
    f.write(content)
