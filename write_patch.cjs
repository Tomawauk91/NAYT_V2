const fs = require("fs");

let content = fs.readFileSync("components/MissionControl.tsx", "utf8");

const s1 = `
  // Custom CLI Terminal State
  const [customTerminalOutput, setCustomTerminalOutput] = useState<string[]>([]);
  const [isCustomCommandRunning, setIsCustomCommandRunning] = useState(false);
  const [currentCustomTaskId, setCurrentCustomTaskId] = useState<string | null>(null);
  const customScrollRef = useRef<HTMLDivElement>(null);
  const customLastOutputRef = useRef<string>(""); 
  const isCustomScanRunningRef = useRef(false);
`;

if (!content.includes('customTerminalOutput')) {
    content = content.replace('// Auto-Scan Selection State', s1 + '\n  // Auto-Scan Selection State');
}

const s2 = `
  const handleCustomStop = async () => {
      if (!currentCustomTaskId) return;
      isCustomScanRunningRef.current = false;
      try {
          await toolsService.stopScan(currentCustomTaskId);
          notify('success', 'Stopping custom command...');
          setCustomTerminalOutput(prev => [...prev, '[!] Command stopped by user.']);
          setIsCustomCommandRunning(false);
          setCurrentCustomTaskId(null);
      } catch (e) {
          notify('error', 'Failed to stop command.');
      }
  };

  const runCustomCommand = async (command: string) => {
    if (isCustomCommandRunning || !command.trim()) return;
    setIsCustomCommandRunning(true);
    isCustomScanRunningRef.current = true;

    notify('success', \`Started custom command...\`);
    setCustomTerminalOutput(prev => [...prev, \`root@pentest-box:~# \${command}\`]);
    customLastOutputRef.current = "";

    try {
        const { task_id } = await toolsService.runCustomScan(command);
        setCurrentCustomTaskId(task_id);
        setCustomTerminalOutput(prev => [...prev, \`[+] Task submitted with ID: \${task_id}\`]);

        const pollInterval = setInterval(async () => {
            if (!isCustomScanRunningRef.current) { 
                 clearInterval(pollInterval);
                 return;
            }
            try {
                const statusData = await toolsService.getScanStatus(task_id);
                if (statusData.status === 'SUCCESS') {
                    clearInterval(pollInterval);
                    setIsCustomCommandRunning(false);
                    setCurrentCustomTaskId(null);
                    isCustomScanRunningRef.current = false;
                    notify('success', 'Command finished successfully.');
                    if (statusData.result && statusData.result.output) {
                         const currentFull = statusData.result.output;
                         const remainingNew = currentFull.substring(customLastOutputRef.current.length);
                         if (remainingNew.length > 0) {
                            remainingNew.split('\\n').forEach((line: string) => {
                                setCustomTerminalOutput(prev => [...prev, line]);
                            });
                         }
                    }
                } else if (statusData.status === 'FAILURE') {
                    clearInterval(pollInterval);
                    setIsCustomCommandRunning(false);
                    setCurrentCustomTaskId(null);
                    isCustomScanRunningRef.current = false;
                    notify('error', 'Command failed.');
                    setCustomTerminalOutput(prev => [...prev, \`[!] Error: \${statusData.result}\`]);
                } else if (statusData.status === 'PROGRESS') {
                    if (statusData.result && statusData.result.output) {
                        const currentFull = statusData.result.output;
                        const newPart = currentFull.substring(customLastOutputRef.current.length);
                        if (newPart.length > 0) {
                            newPart.split('\\n').forEach((line: string) => {
                                if (line !== "") setCustomTerminalOutput(prev => [...prev, line]);
                            });
                            customLastOutputRef.current = currentFull;
                        }
                    }
                }
            } catch (err) {}
        }, 1000);
    } catch (error) {
        setIsCustomCommandRunning(false);
        isCustomScanRunningRef.current = false;
        setCurrentCustomTaskId(null);
        notify('error', 'Failed to start custom command');
        setCustomTerminalOutput(prev => [...prev, \`[!] Failed to start: \${error}\`]);
    }
  };
`;

if (!content.includes('runCustomCommand')) {
    content = content.replace('const runAutoScan = async () => {', s2 + '\\n  const runAutoScan = async () => {');
}

const s3 = `useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  useEffect(() => {
    if (customScrollRef.current) {
        customScrollRef.current.scrollTop = customScrollRef.current.scrollHeight;
    }
  }, [customTerminalOutput]);`;

content = content.replace(/useEffect\\(\\(\\) => \\{\\s*if \\(scrollRef\\.current\\) \\{\\s*scrollRef\\.current\\.scrollTop = scrollRef\\.current\\.scrollHeight;\\s*\\}\\s*\\}, \\[terminalOutput\\]\\);/, s3);

const s4 = `                                <div className="flex-1 cursor-pointer" onClick={() => !isCommandRunning && runCommand(tool.name, tool.cmd)}>
                                    <span className="block text-slate-900 dark:text-white font-medium">{tool.label}</span>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{tool.desc}</span>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <button 
                                        onClick={() => { setCustomCLIInput(tool.cmd); setActiveTab('custom'); }}
                                        title="Modifier la commande avant exécution"
                                        className="text-slate-400 hover:text-blue-500 p-1.5 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button 
                                        onClick={() => runCommand(tool.name, tool.cmd)}
                                        disabled={isCommandRunning}
                                        className={\`text-slate-400 dark:text-slate-500 \${tool.color} transition-colors disabled:opacity-50\`}
                                    >
                                        <PlayCircle size={20} />
                                    </button>
                                </div>`;

const s5 = `                                {editingToolIdx === idx ? (
                                    <div className="flex-1 mr-4">
                                        <input 
                                            autoFocus
                                            type="text" 
                                            value={editingToolCmd}
                                            onChange={(e) => setEditingToolCmd(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !isCommandRunning) {
                                                    runCommand(tool.name, editingToolCmd);
                                                    setEditingToolIdx(null);
                                                }
                                            }}
                                            className="w-full bg-slate-100 dark:bg-slate-900 border border-blue-500 rounded px-3 py-2 text-sm focus:outline-none dark:text-green-400 font-mono shadow-sm"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex-1 cursor-pointer" onClick={() => !isCommandRunning && runCommand(tool.name, tool.cmd)}>
                                        <span className="block text-slate-900 dark:text-white font-medium">{tool.label}</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">{tool.desc}</span>
                                    </div>
                                )}
                                <div className="flex gap-2 items-center">
                                    {editingToolIdx === idx ? (
                                        <>
                                            <button onClick={(e) => { e.stopPropagation(); setEditingToolIdx(null); }} className="text-slate-500 hover:text-red-500 px-2 py-1 text-xs">Annuler</button>
                                            <button 
                                                onClick={(e) => { 
                                                    e.stopPropagation();
                                                    runCommand(tool.name, editingToolCmd); 
                                                    setEditingToolIdx(null); 
                                                }}
                                                disabled={isCommandRunning}
                                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-xs flex items-center gap-1 shadow-sm"
                                            >
                                                <Play size={12}/> Lancer
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setEditingToolCmd(tool.cmd); setEditingToolIdx(idx); }}
                                                title="Modifier la commande"
                                                className="text-slate-400 hover:text-blue-500 p-1.5 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); runCommand(tool.name, tool.cmd); }}
                                                disabled={isCommandRunning}
                                                className={\`text-slate-400 dark:text-slate-500 \${tool.color} transition-colors disabled:opacity-50\`}
                                            >
                                                <PlayCircle size={20} />
                                            </button>
                                        </>
                                    )}
                                </div>`;

if (content.includes("setActiveTab('custom');")) {
    content = content.replace(s4, s5);
}

const s6 = `{activeTab === 'custom' && (
          <div className="grid grid-cols-1 gap-6 animate-fadeIn h-[600px] flex flex-col">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Terminal Libre (Root)</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Exécutez n'importe quelle commande Linux. Ce terminal est indépendant du Command Center.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customCLIInput}
                  onChange={(e) => setCustomCLIInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customCLIInput.trim() && !isCustomCommandRunning) {
                      runCustomCommand(customCLIInput);
                      setCustomCLIInput("");
                    }
                  }}
                  className="flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-green-400 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Ex: apt-get update && apt-get install -y masscan"
                />
                <button
                  onClick={() => {
                      runCustomCommand(customCLIInput);
                      setCustomCLIInput("");
                  }}
                  disabled={isCustomCommandRunning || !customCLIInput.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Play size={20} /> Exécuter
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-950 dark:bg-black rounded-xl border border-slate-800 dark:border-slate-700 flex flex-col overflow-hidden min-h-0">
                <div className="bg-slate-900 p-3 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex gap-1.5 items-center">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span className="text-xs text-slate-400 ml-2 font-mono">root@pentest-box:~</span>
                    </div>
                    {isCustomCommandRunning && (
                        <button 
                            onClick={handleCustomStop}
                            className="px-2 py-0.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded flex items-center gap-1 transition-colors"
                        >
                            <div className="w-1.5 h-1.5 rounded-sm bg-red-500"></div>
                            STOP
                        </button>
                    )}
                </div>
                <div className="flex-1 p-4 overflow-y-auto font-mono text-sm" ref={customScrollRef}>
                    <div className="text-slate-500 mb-2"># Terminal Root Indépendant.</div>
                    {customTerminalOutput.map((line, idx) => (
                        <div key={idx} className="mb-1 animate-fadeIn break-words whitespace-pre-wrap">
                            {line.startsWith('root') ? (
                                <span className="text-green-400 font-bold">{line}</span>
                            ) : line.startsWith('[!]') ? (
                                <span className="text-yellow-400">{line}</span>
                            ) : line.startsWith('[+]') ? (
                                <span className="text-emerald-400">{line}</span>
                            ) : (
                                <span className="text-slate-300">{line}</span>
                            )}
                        </div>
                    ))}
                    {isCustomCommandRunning && (
                        <div className="animate-pulse text-green-400">_</div>
                    )}
                    <div ref={customScrollRef} />
                </div>
            </div>
          </div>
        )}`;

content = content.replace(/\{activeTab === 'custom' && \(\s*<div className="space-y-6">[\s\S]*?<\/div>\s*\)\s*\}/m, s6);

fs.writeFileSync("components/MissionControl.tsx", content);
console.log("MissionControl updated");
