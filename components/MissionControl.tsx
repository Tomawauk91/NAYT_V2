import React, { useState, useRef, useEffect } from 'react';
import { Mission, Vulnerability, Criticality, Status, Language } from '../types';
import { generateExecutiveSummary } from '../services/geminiService';
import { toolsService } from '../services/apiService';
import { Play, FileText, CheckCircle, AlertTriangle, Terminal as TerminalIcon, Eye, Search, Command, PlayCircle, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { translations } from '../translations';

interface MissionControlProps {
  mission: Mission;
  onBack: () => void;
  notify: (type: 'success' | 'error', message: string) => void;
  lang: Language;
}

export const MissionControl: React.FC<MissionControlProps> = ({ mission, onBack, notify, lang }) => {
  const t = translations[lang];
  const [activeTab, setActiveTab] = useState<'overview' | 'actions' | 'findings' | 'report' | 'auto'>('overview');
  const [report, setReport] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Terminal State
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [isCommandRunning, setIsCommandRunning] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Auto-Scan Selection State
  const [selectedAutoTools, setSelectedAutoTools] = useState<string[]>([
      "nmap", "whois", "dnsrecon", "whatweb"
  ]);

  const AVAILABLE_AUTO_TOOLS = [
      { id: "nmap", label: "Nmap Port Scan" },
      { id: "whois", label: "Whois Lookup" },
      { id: "dnsrecon", label: "DNS Recon" },
      { id: "whatweb", label: "WhatWeb Fingerprinting" },
      { id: "curl", label: "Curl Headers" },
      { id: "dig", label: "Dig Trace" },
      { id: "nikto", label: "Nikto Web Scan" },
      { id: "dirb", label: "Dirb Brute Force" },
      { id: "gobuster", label: "Gobuster Enum" },
      { id: "sqlmap", label: "SQLMap Check" },
      { id: "hydra", label: "Hydra SSH (Risky)" },
  ];

  const toggleAutoTool = (toolId: string) => {
      setSelectedAutoTools(prev => 
        prev.includes(toolId) 
            ? prev.filter(t => t !== toolId)
            : [...prev, toolId]
      );
  };

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  const handleStop = async () => {
      if (!currentTaskId) return;
      try {
          await toolsService.stopScan(currentTaskId);
          notify('success', 'Stopping command...');
          setTerminalOutput(prev => [...prev, '[!] Command stopped by user.']);
          setIsCommandRunning(false);
          setCurrentTaskId(null);
      } catch (e) {
          notify('error', 'Failed to stop command.');
      }
  };

  const runCommand = async (commandName: string, command: string) => {
    if (isCommandRunning) return;
    setIsCommandRunning(true);
    notify('success', `Started ${commandName}...`);
    setTerminalOutput(prev => [...prev, `root@pentest-box:~# ${command}`]);

    try {
        // Step 1: Trigger scan
        // Extract tool name from command string (e.g., "nmap" from "nmap -sV ...")
        const tool = command.split(' ')[0].toLowerCase();
        
        // Remove tool name from options (everything after first space)
        const options = command.substring(tool.length + 1);

        const { task_id } = await toolsService.runScan(tool, mission.target, options);
        setCurrentTaskId(task_id);
        setTerminalOutput(prev => [...prev, `[+] Task submitted with ID: ${task_id}`]);

        // Step 2: Poll for results
        const pollInterval = setInterval(async () => {
            // Check if user stopped it manually (taskId cleared)
            if (!isCommandRunning) { // Simplified check based on state
                 clearInterval(pollInterval);
                 return;
            }
            
            try {
                const statusData = await toolsService.getScanStatus(task_id);
                
                if (statusData.status === 'SUCCESS') {
                    clearInterval(pollInterval);
                    setIsCommandRunning(false);
                    setCurrentTaskId(null);
                    notify('success', `${commandName} finished successfully.`);
                    
                    if (statusData.result) {
                         const outputLines = statusData.result.output.split('\n');
                         outputLines.forEach((line: string) => {
                             setTerminalOutput(prev => [...prev, line]);
                         });
                    }
                } else if (statusData.status === 'FAILURE') {
                    clearInterval(pollInterval);
                    setIsCommandRunning(false);
                    setCurrentTaskId(null);
                    notify('error', `${commandName} failed.`);
                    setTerminalOutput(prev => [...prev, `[!] Error: ${statusData.result}`]);
                }
            } catch (err) {
                 // Polling error (network etc) doesn't mean task failed, keep retrying
            }
        }, 2000);

    } catch (error) {
        setIsCommandRunning(false);
        setCurrentTaskId(null);
        notify('error', `Failed to start ${commandName}`);
        setTerminalOutput(prev => [...prev, `[!] Failed to start scan: ${error}`]);
    }
  };

  const runAutoScan = async () => {
    if (isCommandRunning) return;
    if (selectedAutoTools.length === 0) {
        notify('error', 'Please select at least one tool.');
        return;
    }

    setIsCommandRunning(true);
    notify('success', t.startAutoScan);
    setTerminalOutput(prev => [...prev, `root@pentest-box:~# ./auto-pilot.sh --tools ${selectedAutoTools.join(',')}`]);

    try {
        const { task_id } = await toolsService.runAutoScan(mission.target, selectedAutoTools);
        setCurrentTaskId(task_id);
        setTerminalOutput(prev => [...prev, `[+] Auto-scan task submitted with ID: ${task_id}`]);

        const pollInterval = setInterval(async () => {
            if (!isCommandRunning) {
                 clearInterval(pollInterval);
                 return;
            }

            try {
                const statusData = await toolsService.getScanStatus(task_id);
                
                if (statusData.status === 'SUCCESS') {
                    clearInterval(pollInterval);
                    setIsCommandRunning(false);
                    setCurrentTaskId(null);
                    notify('success', 'Auto Pilot finished successfully.');
                    
                    if (statusData.result && statusData.result.output) {
                         // Full Replacement of log to ensure consistency
                         const outputLines = statusData.result.output.split('\n');
                         const newLog: string[] = [];
                         outputLines.forEach((line: string) => newLog.push(line));
                         // We reset the log to start of this command + output
                         // Actually better to just append the full output at the end or replace
                         // For now, let's just append the final output if we haven't been streaming properly
                         // But since we implemented PROGRESS streaming below, we might just be done.
                         
                         // To avoid duplicates if we were streaming:
                         // Ideally we rely on the streaming. But SUCCESS ensures we have everything.
                         // Let's just finish.
                    }
                } else if (statusData.status === 'FAILURE') {
                    clearInterval(pollInterval);
                    setIsCommandRunning(false);
                    setCurrentTaskId(null);
                    notify('error', 'Auto Pilot failed.');
                    setTerminalOutput((prev) => [...prev, `[!] Error: ${statusData.result}`]);
                } else if (statusData.status === 'PROGRESS') {
                    // LIVE FEEDBACK UPDATE
                    if (statusData.result && statusData.result.output) {
                        // The backend sends the "Accumulated Output So Far" in result.output
                        // So we can replace the current "session" output with it, or strictly append new lines (harder to sync).
                        // Easiest is to show the accumulated output.
                        // However, we have "terminalOutput" which is a list of lines from *all* history.
                        // We don't want to wipe previous commands.
                        
                        // Strategy: We won't wipe history. We will just show the latest status line as a "progress" indicator
                        // Or if we want real streaming, we need the backend to only send *new* lines, or we parse.
                        
                        // Current backend implementation: sends "overall_output".
                        // Let's just update the "last few lines" or append.
                        
                        // Simple hack: We won't live-stream the FULL text content to avoid React state chaos with huge strings.
                        // We will just stream the "current_step" notification.
                        const step = statusData.result.current_step;
                        if (step) {
                             // Check if we already printed "Running step..."
                             setTerminalOutput(prev => {
                                 const last = prev[prev.length - 1];
                                 if (last !== `>>> RUNNING: ${step}...`) {
                                     return [...prev, `>>> RUNNING: ${step}...`];
                                 }
                                 return prev;
                             });
                        }
                    }
                }
            } catch (err) {
                 // keep polling
            }
        }, 2000);

    } catch (error) {
        setIsCommandRunning(false);
        setCurrentTaskId(null);
        notify('error', 'Failed to start Auto Pilot');
        setTerminalOutput(prev => [...prev, `[!] Failed to start scan: ${error}`]);
    }
  };

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    notify('success', 'Gemini AI started analyzing findings...');
    const summary = await generateExecutiveSummary(mission, lang);
    setReport(summary);
    setIsGenerating(false);
    if (summary.includes('Error') || summary.includes('Erreur')) {
        notify('error', 'Failed to generate report.');
    } else {
        notify('success', 'Executive Summary generated.');
    }
  };

  const getSeverityColor = (severity: Criticality) => {
    switch (severity) {
      case Criticality.CRITICAL: return 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-500 border-red-200 dark:border-red-500/20';
      case Criticality.HIGH: return 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-500 border-orange-200 dark:border-orange-500/20';
      case Criticality.MEDIUM: return 'bg-yellow-50 dark:bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-200 dark:border-yellow-500/20';
      case Criticality.LOW: return 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-200 dark:border-blue-500/20';
      default: return 'bg-slate-100 dark:bg-slate-500/10 text-slate-600 dark:text-slate-500 border-slate-200 dark:border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg gap-4 transition-colors">
        <div>
          <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white mb-2 transition-colors">&larr; {t.backToMissions}</button>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{mission.name}</h2>
          <div className="flex flex-wrap items-center gap-4 mt-2">
            <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full text-xs border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-2">
              <TerminalIcon size={12} /> {t.target}: {mission.target}
            </span>
            <span className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full text-xs border border-indigo-200 dark:border-indigo-500/20">
              {mission.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <button className="flex-1 md:flex-none bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                {t.settings}
            </button>
            <button className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-500/20">
                <Play size={16} /> {t.resume}
            </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 space-x-6 overflow-x-auto transition-colors">
        {[
          { id: 'overview', label: t.overview },
          { id: 'actions', label: t.commandCenter },
          { id: 'auto', label: 'Auto-Pilot' },
          { id: 'findings', label: t.findingsLog },
          { id: 'report', label: t.aiReport }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-4 text-sm font-medium transition-all duration-300 relative whitespace-nowrap ${
              activeTab === tab.id 
                ? 'text-blue-600 dark:text-blue-400' 
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full animate-scaleIn" />
            )}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="min-h-[500px]">
        {activeTab === 'overview' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t.missionProgress}</h3>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-4 mb-4 overflow-hidden">
                        <div className="bg-blue-500 h-4 rounded-full transition-all duration-1000 ease-out" style={{ width: `${mission.progress}%` }}></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-6">
                         <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg">
                            <p className="text-slate-500 dark:text-slate-400 text-xs uppercase">{t.vulns}</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{mission.vulnerabilities.length}</p>
                         </div>
                         <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg">
                            <p className="text-slate-500 dark:text-slate-400 text-xs uppercase">{t.elapsedTime}</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">4h 23m</p>
                         </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t.recentActivity}</h3>
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 text-sm">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 animate-pulse"></div>
                            <div>
                                <p className="text-slate-700 dark:text-slate-300">Port Scan completed on 192.168.1.15</p>
                                <p className="text-slate-500 text-xs">10 minutes ago</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 text-sm">
                            <div className="w-2 h-2 rounded-full bg-yellow-400 mt-1.5 animate-pulse"></div>
                            <div>
                                <p className="text-slate-700 dark:text-slate-300">Potential vulnerability detected: Weak SSL Cipher</p>
                                <p className="text-slate-500 text-xs">25 minutes ago</p>
                            </div>
                        </div>
                         <div className="flex items-start gap-3 text-sm">
                            <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 animate-pulse"></div>
                            <div>
                                <p className="text-slate-700 dark:text-slate-300">Reconnaissance phase started</p>
                                <p className="text-slate-500 text-xs">1 hour ago</p>
                            </div>
                        </div>
                    </div>
                </div>
             </div>
        )}

        {activeTab === 'actions' && (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 h-fit transition-colors">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <Command size={20} /> {t.toolkit}
                    </h3>
                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                        <button 
                            onClick={() => runCommand('Nmap Port Scan', `nmap -sV -p- ${mission.target}`)}
                            disabled={isCommandRunning}
                            className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all"
                        >
                            <div>
                                <span className="block text-slate-900 dark:text-white font-medium">{t.nmapBtn}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{t.nmapDesc}</span>
                            </div>
                            <PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" size={20} />
                        </button>
                        <button 
                            onClick={() => runCommand('Nikto Web Scan', `nikto -h ${mission.target}`)}
                            disabled={isCommandRunning}
                            className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all"
                        >
                            <div>
                                <span className="block text-slate-900 dark:text-white font-medium">{t.niktoBtn}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{t.niktoDesc}</span>
                            </div>
                            <PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-orange-500 dark:group-hover:text-orange-400 transition-colors" size={20} />
                        </button>
                         <button 
                            onClick={() => runCommand('Hydra Brute Force', `hydra -l admin -P /usr/share/wordlists/rockyou.txt ssh://${mission.target}`)}
                            disabled={isCommandRunning}
                            className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all"
                        >
                            <div>
                                <span className="block text-slate-900 dark:text-white font-medium">{t.hydraBtn}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{t.hydraDesc}</span>
                            </div>
                            <PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors" size={20} />
                        </button>
                         <button onClick={() => runCommand('SQLMap', `sqlmap -u http://${mission.target} --batch`)} disabled={isCommandRunning} className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all">
                            <div><span className="block text-slate-900 dark:text-white font-medium">{t.sqlmapBtn}</span><span className="text-xs text-slate-500 dark:text-slate-400">{t.sqlmapDesc}</span></div><PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500 transition-colors" size={20} />
                        </button>
                         <button onClick={() => runCommand('Dirb', `dirb http://${mission.target}`)} disabled={isCommandRunning} className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all">
                            <div><span className="block text-slate-900 dark:text-white font-medium">{t.dirbBtn}</span><span className="text-xs text-slate-500 dark:text-slate-400">{t.dirbDesc}</span></div><PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500 transition-colors" size={20} />
                        </button>
                         <button onClick={() => runCommand('Gobuster', `gobuster dir -u http://${mission.target} -w /usr/share/wordlists/dirb/common.txt`)} disabled={isCommandRunning} className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all">
                            <div><span className="block text-slate-900 dark:text-white font-medium">{t.gobusterBtn}</span><span className="text-xs text-slate-500 dark:text-slate-400">{t.gobusterDesc}</span></div><PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500 transition-colors" size={20} />
                        </button>
                         <button onClick={() => runCommand('Curl', `curl -I ${mission.target}`)} disabled={isCommandRunning} className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all">
                            <div><span className="block text-slate-900 dark:text-white font-medium">{t.curlBtn}</span><span className="text-xs text-slate-500 dark:text-slate-400">{t.curlDesc}</span></div><PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500 transition-colors" size={20} />
                        </button>
                         <button onClick={() => runCommand('Wget', `wget ${mission.target}`)} disabled={isCommandRunning} className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all">
                            <div><span className="block text-slate-900 dark:text-white font-medium">{t.wgetBtn}</span><span className="text-xs text-slate-500 dark:text-slate-400">{t.wgetDesc}</span></div><PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500 transition-colors" size={20} />
                        </button>
                         <button onClick={() => runCommand('Netcat', `nc -zv ${mission.target} 80`)} disabled={isCommandRunning} className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all">
                            <div><span className="block text-slate-900 dark:text-white font-medium">{t.netcatBtn}</span><span className="text-xs text-slate-500 dark:text-slate-400">{t.netcatDesc}</span></div><PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500 transition-colors" size={20} />
                        </button>
                         <button onClick={() => runCommand('DNSRecon', `dnsrecon -d ${mission.target}`)} disabled={isCommandRunning} className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all">
                            <div><span className="block text-slate-900 dark:text-white font-medium">{t.dnsreconBtn}</span><span className="text-xs text-slate-500 dark:text-slate-400">{t.dnsreconDesc}</span></div><PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500 transition-colors" size={20} />
                        </button>
                         <button onClick={() => runCommand('WhatWeb', `whatweb ${mission.target}`)} disabled={isCommandRunning} className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all">
                            <div><span className="block text-slate-900 dark:text-white font-medium">{t.whatwebBtn}</span><span className="text-xs text-slate-500 dark:text-slate-400">{t.whatwebDesc}</span></div><PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500 transition-colors" size={20} />
                        </button>
                         <button onClick={() => runCommand('Whois', `whois ${mission.target}`)} disabled={isCommandRunning} className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all">
                            <div><span className="block text-slate-900 dark:text-white font-medium">{t.whoisBtn}</span><span className="text-xs text-slate-500 dark:text-slate-400">{t.whoisDesc}</span></div><PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500 transition-colors" size={20} />
                        </button>
                         <button onClick={() => runCommand('Dig', `dig ${mission.target}`)} disabled={isCommandRunning} className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 p-4 rounded-lg flex items-center justify-between group transition-all">
                            <div><span className="block text-slate-900 dark:text-white font-medium">{t.digBtn}</span><span className="text-xs text-slate-500 dark:text-slate-400">{t.digDesc}</span></div><PlayCircle className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500 transition-colors" size={20} />
                        </button>
                    </div>
                </div>
                
                <div className="lg:col-span-2 bg-slate-950 dark:bg-black rounded-xl border border-slate-800 dark:border-slate-700 flex flex-col overflow-hidden h-[500px]">
                    <div className="bg-slate-900 p-3 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex gap-1.5 items-center">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span className="text-xs text-slate-400 ml-2 font-mono">pentester@kali:~/engagements/{mission.id}</span>
                        </div>
                        {isCommandRunning && (
                            <button 
                                onClick={handleStop}
                                className="px-2 py-0.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded flex items-center gap-1 transition-colors"
                            >
                                <div className="w-1.5 h-1.5 rounded-sm bg-red-500"></div>
                                STOP
                            </button>
                        )}
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-sm" ref={scrollRef}>
                        <div className="text-slate-500 mb-2"># Terminal Session Initialized.</div>
                        {terminalOutput.map((line, idx) => (
                            <div key={idx} className="mb-1 animate-fadeIn">
                                {line.startsWith('root') ? (
                                    <span className="text-blue-400 font-bold">{line}</span>
                                ) : line.startsWith('[!]') ? (
                                    <span className="text-yellow-400">{line}</span>
                                ) : line.startsWith('[+]') ? (
                                    <span className="text-emerald-400">{line}</span>
                                ) : (
                                    <span className="text-slate-300">{line}</span>
                                )}
                            </div>
                        ))}
                        {isCommandRunning && (
                            <div className="animate-pulse text-blue-400">_</div>
                        )}
                    </div>
                </div>
             </div>
        )}

        {activeTab === 'auto' && (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 h-fit transition-colors">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                         <Zap size={20} className="text-yellow-500" /> {t.autoMode}
                    </h3>
                    <div className="space-y-6">
                        <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-100 dark:border-slate-600">
                             <p className="text-slate-600 dark:text-slate-300 text-sm mb-4 font-bold">
                                Select Tools & Sequence:
                             </p>
                             <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                                {AVAILABLE_AUTO_TOOLS.map((tool) => (
                                    <label key={tool.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 p-2 rounded transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedAutoTools.includes(tool.id)}
                                            onChange={() => toggleAutoTool(tool.id)}
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 bg-gray-100 border-gray-300 dark:bg-gray-700 dark:border-gray-600"
                                        />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">{tool.label}</span>
                                    </label>
                                ))}
                             </div>
                             <p className="text-xs text-slate-500 mt-2">Tools will run in the order selected (top to bottom of default list).</p>
                        </div>

                        <button 
                            onClick={runAutoScan}
                            disabled={isCommandRunning}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white p-4 rounded-xl font-semibold shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {isCommandRunning ? (
                                <>
                                    <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                                    {t.analyzing}
                                </>
                            ) : (
                                <>
                                    <Zap size={20} className="text-yellow-300" fill="currentColor" />
                                    {t.startAutoScan}
                                </>
                            )}
                        </button>
                    </div>
                </div>
                
                <div className="lg:col-span-2 bg-slate-950 dark:bg-black rounded-xl border border-slate-800 dark:border-slate-700 flex flex-col overflow-hidden h-[600px]">
                    <div className="bg-slate-900 p-3 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            </div>
                            <span className="text-xs text-slate-400 ml-2 font-mono">auto-pilot-agent@kali:~</span>
                        </div>
                        <div className="flex items-center gap-3">
                            {isCommandRunning && <span className="text-xs text-blue-400 animate-pulse">● Live Stream</span>}
                            {isCommandRunning && (
                                <button 
                                    onClick={handleStop}
                                    className="px-2 py-0.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded flex items-center gap-1 transition-colors"
                                >
                                    <div className="w-1.5 h-1.5 rounded-sm bg-red-500"></div>
                                    STOP
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-sm" ref={scrollRef}>
                        <div className="text-slate-500 mb-2"># Auto-Pilot Sequence Initiated...</div>
                        {terminalOutput.map((line, idx) => (
                             <div key={idx} className="mb-1 animate-fadeIn break-words whitespace-pre-wrap">
                                {line.startsWith('root') ? (
                                    <span className="text-blue-400 font-bold">{line}</span>
                                ) : line.startsWith('[!]') ? (
                                    <span className="text-yellow-400">{line}</span>
                                ) : line.startsWith('[+]') ? (
                                    <span className="text-emerald-400">{line}</span>
                                ) : (
                                    <span className="text-slate-300">{line}</span>
                                )}
                            </div>
                        ))}
                         {isCommandRunning && (
                            <div className="animate-pulse text-blue-400">_</div>
                        )}
                        <div ref={scrollRef} />
                    </div>
                </div>
             </div>
        )}

        {activeTab === 'findings' && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden overflow-x-auto animate-fadeIn transition-colors">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900/50 uppercase text-xs font-semibold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4">Title</th>
                  <th className="px-6 py-4">Severity</th>
                  <th className="px-6 py-4">{t.status}</th>
                  <th className="px-6 py-4">{t.date}</th>
                  <th className="px-6 py-4">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {mission.vulnerabilities.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{v.title}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs border ${getSeverityColor(v.criticality)}`}>
                        {v.criticality}
                      </span>
                    </td>
                    <td className="px-6 py-4">{v.status}</td>
                    <td className="px-6 py-4">{v.dateFound}</td>
                    <td className="px-6 py-4">
                        <button className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1">
                            <Eye size={14} /> Details
                        </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mission.vulnerabilities.length === 0 && (
                <div className="p-12 text-center text-slate-500">
                    {t.noVulns}
                </div>
            )}
          </div>
        )}

        {activeTab === 'report' && (
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 animate-fadeIn transition-colors">
            {!report ? (
              <div className="text-center py-16">
                <FileText size={48} className="text-slate-400 dark:text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{t.generateReport}</h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto mb-8">
                  {t.genReportDesc}
                </p>
                <button
                  onClick={handleGenerateReport}
                  disabled={isGenerating}
                  className="bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-blue-500/25 flex items-center gap-3 mx-auto"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full"></div>
                      {t.analyzing}
                    </>
                  ) : (
                    <>
                      <TerminalIcon size={18} />
                      {t.generateReport}
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="animate-fadeIn">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t.execSummary}</h3>
                    <button 
                        onClick={() => setReport('')}
                        className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white text-sm transition-colors"
                    >
                        {t.reset}
                    </button>
                </div>
                <div className="prose prose-slate dark:prose-invert max-w-none bg-slate-50 dark:bg-slate-900/50 p-8 rounded-xl border border-slate-200 dark:border-slate-700">
                  <ReactMarkdown>{report}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};