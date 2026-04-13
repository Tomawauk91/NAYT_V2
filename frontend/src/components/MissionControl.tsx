import React, { useState, useRef, useEffect } from 'react';
import { Mission, Vulnerability, Criticality, Status, Language } from '../types';
import { generateExecutiveSummary } from '../services/geminiService';
import { toolsService } from '../services/apiService';
import { Play, Edit2, FileText, CheckCircle, AlertTriangle, Terminal as TerminalIcon, Eye, Search, Command, PlayCircle, Zap , X, Settings, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { translations } from '../translations';

interface MissionControlProps {
  mission: Mission;
  onBack: () => void;
  onEdit?: () => void;
  notify: (type: 'success' | 'error', message: string) => void;
  lang: Language;
  userRole: string;
}

const stripAnsi = (str: string) => str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

export const MissionControl: React.FC<MissionControlProps> = ({ mission, onBack, onEdit, notify, lang, userRole }) => {
  const t = translations[lang];
  const [customCLIInput, setCustomCLIInput] = useState('');
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [editingToolCmd, setEditingToolCmd] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'actions' | 'findings' | 'report' | 'auto'>('overview');
  const [selectedVuln, setSelectedVuln] = useState<Vulnerability | null>(null);
  const [report, setReport] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [elapsedString, setElapsedString] = useState<string>("0m");
  
  // Terminal State
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [isCommandRunning, setIsCommandRunning] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [targetPort, setTargetPort] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastOutputRef = useRef<string>(""); // To track streaming output position
  
  
  // Custom CLI Terminal State
  const [customTerminalOutput, setCustomTerminalOutput] = useState<string[]>([]);
  const [isCustomCommandRunning, setIsCustomCommandRunning] = useState(false);
  const [currentCustomTaskId, setCurrentCustomTaskId] = useState<string | null>(null);
  const customScrollRef = useRef<HTMLDivElement>(null);
  const customLastOutputRef = useRef<string>(""); 
  const isCustomScanRunningRef = useRef(false);

  useEffect(() => {
    const updateElapsedTime = () => {
        if (!mission.created_at) {
             setElapsedString("0m");
             return;
        }
        const createdDate = new Date(mission.created_at);
        // Fallback for Safari/Firefox dates if missing timezone Z
        if (isNaN(createdDate.getTime())) {
            setElapsedString("0m");
            return;
        }
        
        const diffMs = Date.now() - createdDate.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        
        if (hours > 0) {
            setElapsedString(`${hours}h ${mins}m`);
        } else {
            setElapsedString(`${mins}m`);
        }
    };
    
    updateElapsedTime();
    const interval = setInterval(updateElapsedTime, 60000);
    return () => clearInterval(interval);
  }, [mission.created_at]);

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
      { id: "sslscan", label: "SSLScan" },
      { id: "testssl", label: "TestSSL.sh" },
      { id: "traceroute", label: "Traceroute" },
      { id: "enum4linux", label: "Enum4Linux (SMB)" },
      { id: "smbclient", label: "SMBClient List" },
      { id: "ftp", label: "FTP Anonymous Login" },
      { id: "amass", label: "Amass Subdomains" },
      { id: "theharvester", label: "TheHarvester OSINT" },
      { id: "nuclei", label: "Nuclei Vulns" },
      { id: "sslyze", label: "SSLyze" },
      { id: "zap", label: "ZAP Quick Scan" },
      { id: "ffuf", label: "Ffuf Web Fuzzing" },
      { id: "netexec", label: "NetExec SMB Check" },
  ];

  const toggleAutoTool = (toolId: string) => {
      setSelectedAutoTools(prev => 
        prev.includes(toolId) 
            ? prev.filter(t => t !== toolId)
            : [...prev, toolId]
      );
  };

  const isScanRunningRef = useRef(false);

  useEffect(() => {
    let activeWsMain: WebSocket | null = null;
    let activeWsCustom: WebSocket | null = null;
    
    toolsService.getAllTasks(mission.id).then((data: any) => {
        if(data && data.tasks) {
            const allMainLines: string[] = [];
            const allCustomLines: string[] = [];
            
            const setupWs = (tId: string, tType: string) => {
                const isRunningRef = tType === 'custom' ? isCustomScanRunningRef : isScanRunningRef;
                isRunningRef.current = true;
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/scan/${tId}`);
                
                ws.onopen = () => console.log('Reconnected to active task:', tId);
                
                ws.onmessage = (event) => {
                    if (!isRunningRef.current) {
                        ws.close();
                        return;
                    }
                    try {
                        const evtData = JSON.parse(event.data);
                        if (evtData.type === 'log' && evtData.content) {
                            const line = stripAnsi(evtData.content.replace(/\n$/, ''));
                            if (line) {
                                if (tType === 'custom') setCustomTerminalOutput(prev => [...prev, line]);
                                else setTerminalOutput(prev => [...prev, line]);
                            }
                        } else if (evtData.type === 'status') {
                            isRunningRef.current = false;
                            if (tType === 'custom') {
                                setIsCustomCommandRunning(false);
                                setCurrentCustomTaskId(null);
                            } else {
                                setIsCommandRunning(false);
                                setCurrentTaskId(null);
                            }
                            ws.close();
                        }
                    } catch (e) {}
                };
                return ws;
            };

            setRecentTasks([...data.tasks].reverse().slice(0, 5));

            data.tasks.forEach((task: any) => {
                const rawOutput = task.output || "";
                const outLines = rawOutput.split('\n').map(stripAnsi);
                const isActive = task.status !== "SUCCESS" && task.status !== "FAILURE" && task.status !== "REVOKED";
                
                if (isActive && outLines.length > 0) outLines.pop();
                
                const timeStr = task.created_at ? `[${new Date(task.created_at).toLocaleTimeString()}] ` : '';

                if (task.task_type === 'custom') {
                    if (allCustomLines.length > 0) allCustomLines.push("---------------------------------------------------");
                    allCustomLines.push(`${timeStr}$ ${task.command || 'Unknown command'}`);
                    allCustomLines.push(`[ID: ${task.task_id}] Status: ${task.status}`);
                    if (rawOutput) {
                        allCustomLines.push(...outLines);
                    } else if (task.status === "REVOKED" || task.status === "FAILURE") {
                        allCustomLines.push("[!] No output recorded or task terminated early.");
                    }
                    allCustomLines.push("");
                    
                    if (isActive) {
                        setIsCustomCommandRunning(true);
                        setCurrentCustomTaskId(task.task_id);
                        activeWsCustom = setupWs(task.task_id, 'custom');
                    }
                } else {
                    if (allMainLines.length > 0) allMainLines.push("---------------------------------------------------");
                    if (task.task_type === 'auto') {
                        allMainLines.push(`${timeStr}> Running Auto Pilot on ${mission.target}`);
                    } else {
                        allMainLines.push(`${timeStr}> Running manual scan with tools: ${task.tool} on ${mission.target}`);
                    }
                    allMainLines.push(`[ID: ${task.task_id}] Status: ${task.status}`);
                    if (rawOutput) {
                        allMainLines.push(...outLines);
                    } else if (task.status === "REVOKED" || task.status === "FAILURE") {
                        allMainLines.push("[!] No output recorded or task terminated early.");
                    }
                    allMainLines.push("");
                    
                    if (isActive) {
                        setIsCommandRunning(true);
                        setCurrentTaskId(task.task_id);
                        activeWsMain = setupWs(task.task_id, 'main');
                    }
                }
            });
            
            setTerminalOutput(allMainLines);
            setCustomTerminalOutput(allCustomLines);
        }
    }).catch(e => console.error("Failed to fetch all tasks", e));
    
    return () => {
        if(activeWsMain) activeWsMain.close();
        if(activeWsCustom) activeWsCustom.close();
    };
  }, [mission.id]);

  useEffect(() => {
  }, [terminalOutput]);

  useEffect(() => {
    if (customScrollRef.current) {
        customScrollRef.current.scrollTop = customScrollRef.current.scrollHeight;
    }
  }, [customTerminalOutput]);

  const handleStop = async () => {
      if (!currentTaskId) return;
      // Signal stop for the ref-based poller
      isScanRunningRef.current = false;
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

    const clearMainHistory = async () => {
        try {
            await toolsService.clearTasks(mission.id, "main");
            setTerminalOutput([]);
            notify("success", t.historyCleared);
        } catch (e) {
            notify("error", t.clearError);
        }
    };




  const runCommand = async (commandName: string, command: string) => {
    if (isCommandRunning) return;
    setIsCommandRunning(true);
    isScanRunningRef.current = true; // Use Ref for stale closures in setInterval

    notify('success', `Started ${commandName}...`);
    setTerminalOutput(prev => [...prev, `root@pentest-box:~# ${command}`]);

    // Reset output streaming
    lastOutputRef.current = "";

    try {
        // Step 1: Trigger scan
        // Extract tool name from command string (e.g., "nmap" from "nmap -sV ...")
        const tool = command.trim().split(' ')[0].toLowerCase();
        
        // Remove tool name from options (everything after first space)
        const options = command.trim().substring(tool.length).trim();

        const { task_id } = await toolsService.runScan(tool, mission.target, options, mission.id);
        setCurrentTaskId(task_id);
        setTerminalOutput(prev => [...prev, `[+] Task submitted with ID: ${task_id}`]);

        // Step 2: Poll for results
        const pollInterval = setInterval(async () => {
            // Check if user stopped it manually using Ref
            if (!isScanRunningRef.current) { 
                 clearInterval(pollInterval); toolsService.getAllTasks(mission.id).then((d: any) => { if(d?.tasks) setRecentTasks([...d.tasks].reverse().slice(0, 5)) });
                 return;
            }
            
            try {
                const statusData = await toolsService.getScanStatus(task_id);
                
                if (statusData.status === 'SUCCESS') {
                    clearInterval(pollInterval); toolsService.getAllTasks(mission.id).then((d: any) => { if(d?.tasks) setRecentTasks([...d.tasks].reverse().slice(0, 5)) });
                    setIsCommandRunning(false);
                    setCurrentTaskId(null);
                    isScanRunningRef.current = false;
                    notify('success', `${commandName} finished successfully.`);
                    
                    // Final sync of any remaining output
                    if (statusData.result && statusData.result.output) {
                         const currentFull = statusData.result.output;
                         const remainingNew = currentFull.substring(lastOutputRef.current.length);
                         if (remainingNew.length > 0) {
                            remainingNew.split('\n').forEach((line: string) => {
                                setTerminalOutput(prev => [...prev, line]);
                            });
                         }
                    }
                } else if (statusData.status === 'FAILURE') {
                    clearInterval(pollInterval); toolsService.getAllTasks(mission.id).then((d: any) => { if(d?.tasks) setRecentTasks([...d.tasks].reverse().slice(0, 5)) });
                    setIsCommandRunning(false);
                    setCurrentTaskId(null);
                    isScanRunningRef.current = false;
                    notify('error', `${commandName} failed.`);
                    setTerminalOutput(prev => [...prev, `[!] Error: ${statusData.result}`]);
                } else if (statusData.status === 'PROGRESS') {
                    // LIVE FEEDBACK UPDATE
                    if (statusData.result && statusData.result.output) {
                        const currentFull = statusData.result.output;
                        // Calculate only the part we haven't seen
                        const newPart = currentFull.substring(lastOutputRef.current.length);
                        
                        if (newPart.length > 0) {
                            const newLines = newPart.split('\n');
                            // Filter out empty strings if desired, but keep for formatting
                            newLines.forEach((line: string) => {
                                // Prevent empty lines spam if output ends with \n
                                if (line !== "") {
                                    setTerminalOutput(prev => [...prev, line]);
                                }
                            });
                            // Update our marker
                            lastOutputRef.current = currentFull;
                        }
                    }
                }
            } catch (err) {
                 // Polling error (network etc) doesn't mean task failed, keep retrying
            }
        }, 1000); // Faster polling for better real-time feel

    } catch (error) {
        setIsCommandRunning(false);
        isScanRunningRef.current = false;
        setCurrentTaskId(null);
        notify('error', `Failed to start ${commandName}`);
        setTerminalOutput(prev => [...prev, `[!] Failed to start scan: ${error}`]);
    }
  };

  
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

    const clearCustomHistory = async () => {
        try {
            await toolsService.clearTasks(mission.id, "custom");
            setCustomTerminalOutput([]);
            notify("success", t.historyCleared);
        } catch (e) {
            notify("error", t.clearError);
        }
    };




  const runCustomCommand = async (command: string) => {
    if (isCustomCommandRunning || !command.trim()) return;
    setIsCustomCommandRunning(true);
    isCustomScanRunningRef.current = true;

    notify('success', `Started custom command...`);
    setCustomTerminalOutput(prev => [...prev, `root@pentest-box:~# ${command}`]);
    customLastOutputRef.current = "";

    try {
        const { task_id } = await toolsService.runCustomScan(command, mission.id);
        setCurrentCustomTaskId(task_id);
        setCustomTerminalOutput(prev => [...prev, `[+] Task submitted with ID: ${task_id}`]);

        const pollInterval = setInterval(async () => {
            if (!isCustomScanRunningRef.current) { 
                 clearInterval(pollInterval); toolsService.getAllTasks(mission.id).then((d: any) => { if(d?.tasks) setRecentTasks([...d.tasks].reverse().slice(0, 5)) });
                 return;
            }
            try {
                const statusData = await toolsService.getScanStatus(task_id);
                if (statusData.status === 'SUCCESS') {
                    clearInterval(pollInterval); toolsService.getAllTasks(mission.id).then((d: any) => { if(d?.tasks) setRecentTasks([...d.tasks].reverse().slice(0, 5)) });
                    setIsCustomCommandRunning(false);
                    setCurrentCustomTaskId(null);
                    isCustomScanRunningRef.current = false;
                    notify('success', 'Command finished successfully.');
                    if (statusData.result && statusData.result.output) {
                         const currentFull = statusData.result.output;
                         const remainingNew = currentFull.substring(customLastOutputRef.current.length);
                         if (remainingNew.length > 0) {
                            remainingNew.split('\n').forEach((line: string) => {
                                setCustomTerminalOutput(prev => [...prev, line]);
                            });
                         }
                    }
                } else if (statusData.status === 'FAILURE') {
                    clearInterval(pollInterval); toolsService.getAllTasks(mission.id).then((d: any) => { if(d?.tasks) setRecentTasks([...d.tasks].reverse().slice(0, 5)) });
                    setIsCustomCommandRunning(false);
                    setCurrentCustomTaskId(null);
                    isCustomScanRunningRef.current = false;
                    notify('error', 'Command failed.');
                    setCustomTerminalOutput(prev => [...prev, `[!] Error: ${statusData.result}`]);
                } else if (statusData.status === 'PROGRESS') {
                    if (statusData.result && statusData.result.output) {
                        const currentFull = statusData.result.output;
                        const newPart = currentFull.substring(customLastOutputRef.current.length);
                        if (newPart.length > 0) {
                            newPart.split('\n').forEach((line: string) => {
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
        setCustomTerminalOutput(prev => [...prev, `[!] Failed to start: ${error}`]);
    }
  };
  const runAutoScan = async () => {
    if (isCommandRunning) return;
    if (selectedAutoTools.length === 0) {
        notify('error', 'Please select at least one tool.');
        return;
    }

    setIsCommandRunning(true);
    isScanRunningRef.current = true;
    notify('success', t.startAutoScan);
    setTerminalOutput(prev => [...prev, `root@pentest-box:~# ./auto-pilot.sh --tools ${selectedAutoTools.join(',')}`]);

    // Reset stream tracker
    lastOutputRef.current = "";

    try {
        const { task_id } = await toolsService.runAutoScan(mission.target, selectedAutoTools, targetPort, mission.id);
        setCurrentTaskId(task_id);
        setTerminalOutput(prev => [...prev, `[+] Auto-scan task submitted with ID: ${task_id}`]);

        const pollInterval = setInterval(async () => {
            if (!isScanRunningRef.current) {
                 clearInterval(pollInterval); toolsService.getAllTasks(mission.id).then((d: any) => { if(d?.tasks) setRecentTasks([...d.tasks].reverse().slice(0, 5)) });
                 return;
            }

            try {
                const statusData = await toolsService.getScanStatus(task_id);
                
                if (statusData.status === 'SUCCESS') {
                    clearInterval(pollInterval); toolsService.getAllTasks(mission.id).then((d: any) => { if(d?.tasks) setRecentTasks([...d.tasks].reverse().slice(0, 5)) });
                    setIsCommandRunning(false);
                    setCurrentTaskId(null);
                    isScanRunningRef.current = false;
                    notify('success', 'Auto Pilot finished successfully.');
                    
                    // Final output sync
                    if (statusData.result && statusData.result.output) {
                         const currentFull = statusData.result.output;
                         const remainingNew = currentFull.substring(lastOutputRef.current.length);
                         if (remainingNew.length > 0) {
                            remainingNew.split('\n').forEach((line: string) => {
                                setTerminalOutput(prev => [...prev, line]);
                            });
                         }
                    }
                } else if (statusData.status === 'FAILURE') {
                    clearInterval(pollInterval); toolsService.getAllTasks(mission.id).then((d: any) => { if(d?.tasks) setRecentTasks([...d.tasks].reverse().slice(0, 5)) });
                    setIsCommandRunning(false);
                    setCurrentTaskId(null);
                    isScanRunningRef.current = false;
                    notify('error', 'Auto Pilot failed.');
                    setTerminalOutput((prev) => [...prev, `[!] Error: ${statusData.result}`]);
                } else if (statusData.status === 'PROGRESS') {
                    // LIVE FEEDBACK UPDATE
                    if (statusData.result && statusData.result.output) {
                        const currentFull = statusData.result.output;
                        // Calculate only the part we haven't seen since last poll
                        const newPart = currentFull.substring(lastOutputRef.current.length);
                        
                        if (newPart.length > 0) {
                            // Split by lines and display
                            const newLines = newPart.split('\n');
                            newLines.forEach((line: string) => {
                                // Simple filtering to avoid too many blank lines
                                if (line !== "") {
                                    setTerminalOutput(prev => [...prev, line]);
                                }
                            });
                            
                            // Important: Update the cursor to end of currentFull
                            lastOutputRef.current = currentFull;
                        }
                    }
                }
            } catch (err) {
                 // keep polling
            }
        }, 1000); // Polling every 1s for better responsiveness

    } catch (error) {
        setIsCommandRunning(false);
        isScanRunningRef.current = false;
        setCurrentTaskId(null);
        notify('error', 'Failed to start Auto Pilot');
        setTerminalOutput(prev => [...prev, `[!] Failed to start scan: ${error}`]);
    }
  };

  const [reportEngine, setReportEngine] = useState('docx');

  useEffect(() => {
    // Load config to know what report engine to use
    toolsService.getConfig('report_type').then(data => {
        if(data && data.value) setReportEngine(data.value);
    }).catch(e => console.error(e));
  }, []);

  const handleDownloadDocxReport = async () => {
    setIsGenerating(true);
    notify('success', 'Generating DOCX Report...');
    try {
        await toolsService.downloadMissionReport(mission.id);
        notify('success', 'Report downloaded successfully.');
    } catch (e) {
        notify('error', 'Failed to download report.');
    } finally {
        setIsGenerating(false);
    }
  };

  const handleGenerateGeminiReport = async () => {
    setIsGenerating(true);
    notify('success', 'Gemini AI started analyzing findings...');
    try {
        const summary = await toolsService.generateExecutiveSummary(mission.id);
        setReport(summary.report || "No summary generated.");
        notify('success', 'Executive Summary generated.');
    } catch(e) {
        notify('error', 'Failed to generate report via Gemini.');
    } finally {
        setIsGenerating(false);
    }
  };

  const getSeverityColor = (severity: any) => {
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
          <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{mission.name}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2">
            <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full text-xs border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-2">
              <TerminalIcon size={12} /> {t.target}: {mission.target}
            </span>
            <span className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full text-xs border border-indigo-200 dark:border-indigo-500/20">
              {mission.status}
            </span>
            {mission.client && (
               <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full text-xs border border-slate-200 dark:border-slate-600">
                  {t.client}: {mission.client.name}
               </span>
            )}
          </div>
        </div>
        {(userRole === 'Admin' || userRole === 'admin') && onEdit && (
            <div className="flex gap-2 w-full md:w-auto">
                <button 
                    onClick={onEdit} 
                    className="flex-1 md:flex-none bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                    <Settings size={16} /> Edit Settings
                </button>
            </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 space-x-6 overflow-x-auto transition-colors">
        {[
          { id: 'overview', label: t.overview },
          { id: 'actions', label: t.commandCenter },
          { id: 'auto', label: 'Auto-Pilot' },
            { id: 'custom', label: t.customCLI || 'Custom CLI' },
          { id: 'findings', label: t.findingsLog },
          { id: 'report', label: reportEngine === 'docx' ? 'DOCX Report' : t.aiReport }
        ].filter(tab => !((userRole === 'Viewer' || userRole === 'viewer' || userRole === 'VIEWER') && (tab.id === 'actions' || tab.id === 'custom' || tab.id === 'auto'))).map((tab) => (
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
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{elapsedString}</p>
                         </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t.recentActivity}</h3>
                    <div className="space-y-4">
                        {recentTasks.length === 0 ? (
                             <p className="text-sm text-slate-500">{t.noRecentActivity || "No recent activity"}</p>
                        ) : (
                             recentTasks.map((task: any, idx: number) => {
                                  // Formatting the date nicely relative
                                  const getRelativeTime = (isoString?: string) => {
                                      if (!isoString) return "Recently";
                                      const d = new Date(isoString);
                                      if (isNaN(d.getTime())) return "Recently";
                                      const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
                                      if (diffMins < 1) return "Just now";
                                      if (diffMins < 60) return `${diffMins} minutes ago`;
                                      const diffHours = Math.floor(diffMins / 60);
                                      if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
                                      const diffDays = Math.floor(diffHours / 24);
                                      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
                                  };

                                  const dotColor = task.status === "SUCCESS" ? "bg-emerald-400" :
                                                   task.status === "FAILURE" ? "bg-red-400" :
                                                   task.status === "REVOKED" ? "bg-gray-400" :
                                                   "bg-blue-400 animate-pulse";

                                  let title = "Unknown task";
                                  if (task.task_type === 'auto') title = `Autonomous scan completed on ${task.tool}`;
                                  else if (task.task_type === 'custom') title = `Custom command executed: ${task.command}`;
                                  else title = `Task completed: ${task.tool || task.command}`;

                                  if (task.status === "PROGRESS") title = `Running: ${task.tool || task.command}`;
                                  else if (task.status === "FAILURE") title = `Failed: ${task.tool || task.command}`;
                                  else if (task.status === "REVOKED") title = `Stopped: ${task.tool || task.command}`;

                                  return (
                                       <div key={idx} className="flex items-start gap-3 text-sm">
                                           <div className={`w-2 h-2 rounded-full ${dotColor} mt-1.5`}></div>
                                           <div>
                                               <p className="text-slate-700 dark:text-slate-300">{title}</p>
                                               <p className="text-slate-500 text-xs">{getRelativeTime(task.created_at)}</p>
                                           </div>
                                       </div>
                                  );
                             })
                        )}
                    </div>
                </div>
             </div>
        )}

        {activeTab === 'actions' && (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 h-fit transition-colors">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Command size={20} /> {t.toolkit}
                        </h3>
                        <input 
                            type="text" 
                            placeholder="Port (Opt)"
                            value={targetPort}
                            onChange={(e) => setTargetPort(e.target.value)}
                            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder:text-slate-400"
                        />
                    </div>
                    
                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        {[
                            {
                                groupName: 'Reconnaissance & Network',
                                tools: [
                                    { name: 'Nmap Port Scan', label: t.nmapBtn, desc: t.nmapDesc, cmd: `nmap -sT -sV -T4 -v ${targetPort ? '-p ' + targetPort : '-p-'} ${mission.target}`, color: 'group-hover:text-blue-500' },
                                    { name: 'Amass', label: "Amass", desc: "Subdomain Enum", cmd: `amass enum -d ${mission.target}`, color: 'group-hover:text-blue-500' },
                                    { name: 'TheHarvester', label: "TheHarvester", desc: "OSINT Gathering", cmd: `theHarvester -d ${mission.target} -b all`, color: 'group-hover:text-blue-500' },
                                    { name: 'DNSRecon', label: t.dnsreconBtn, desc: t.dnsreconDesc, cmd: `dnsrecon -d ${mission.target}`, color: 'group-hover:text-blue-500' },
                                    { name: 'Whois', label: t.whoisBtn, desc: t.whoisDesc, cmd: `whois ${mission.target}`, color: 'group-hover:text-blue-500' },
                                    { name: 'Dig', label: t.digBtn, desc: t.digDesc, cmd: `dig ${mission.target}`, color: 'group-hover:text-blue-500' },
                                    { name: 'Traceroute', label: t.tracerouteBtn, desc: t.tracerouteDesc, cmd: `traceroute ${mission.target}`, color: 'group-hover:text-blue-500' },
                                    { name: 'Netcat', label: t.netcatBtn, desc: t.netcatDesc, cmd: `nc -zv ${mission.target} 80`, color: 'group-hover:text-blue-500' },
                                    { name: 'TShark', label: "Wireshark (CLI)", desc: "Capture 10s Traffic", cmd: `tshark -i eth0 -a duration:10 -f "host ${mission.target}"`, color: 'group-hover:text-blue-500' },
                                    { name: 'Suricata', label: "Suricata", desc: "IDS Network Monitor", cmd: `suricata -i eth0 --init-errors-fatal`, color: 'group-hover:text-blue-500' },
                                ]
                            },
                            {
                                groupName: 'Web Scanning & Enumeration',
                                tools: [
                                    { name: 'Nikto Web Scan', label: t.niktoBtn, desc: t.niktoDesc, cmd: `nikto -h ${mission.target} ${targetPort ? '-p ' + targetPort : ''} -ask no -nointeractive -maxtime 5m`, color: 'group-hover:text-orange-500' },
                                    { name: 'ZAP', label: "OWASP ZAP", desc: "Web Scanner", cmd: `zaproxy -cmd -quickurl http://${mission.target}${targetPort ? ':' + targetPort : ''}`, color: 'group-hover:text-blue-500' },
                                    { name: 'Dirb', label: t.dirbBtn, desc: t.dirbDesc, cmd: `dirb http://${mission.target}${targetPort ? ':' + targetPort : ''}`, color: 'group-hover:text-blue-500' },
                                    { name: 'Gobuster', label: t.gobusterBtn, desc: t.gobusterDesc, cmd: `gobuster dir -u http://${mission.target}${targetPort ? ':' + targetPort : ''} -w /usr/share/wordlists/dirb/common.txt -k -b 404,301,302,500,501`, color: 'group-hover:text-blue-500' },
                                    { name: 'Ffuf', label: "Ffuf", desc: "Fast Fuzzer", cmd: `ffuf -u http://${mission.target}/FUZZ -w /usr/share/wordlists/dirb/common.txt`, color: 'group-hover:text-blue-500' },
                                    { name: 'WhatWeb', label: t.whatwebBtn, desc: t.whatwebDesc, cmd: `whatweb ${mission.target}`, color: 'group-hover:text-blue-500' },
                                    { name: 'SSLScan', label: t.sslscanBtn, desc: t.sslscanDesc, cmd: `sslscan ${mission.target}`, color: 'group-hover:text-blue-500' },
                                    { name: 'TestSSL', label: t.testsslBtn, desc: t.testsslDesc, cmd: `testssl.sh ${mission.target}${targetPort ? ':' + targetPort : ''}`, color: 'group-hover:text-blue-500' },
                                    { name: 'Curl', label: t.curlBtn, desc: t.curlDesc, cmd: `curl -k -I ${mission.target}${targetPort ? ':' + targetPort : ''}`, color: 'group-hover:text-blue-500' },
                                    { name: 'Wget', label: t.wgetBtn, desc: t.wgetDesc, cmd: `wget ${mission.target}${targetPort ? ':' + targetPort : ''}`, color: 'group-hover:text-blue-500' },
                                ]
                            },
                            {
                                groupName: 'Vulnerability Analysis',
                                tools: [
                                    { name: 'Nuclei', label: "Nuclei", desc: "Vuln Scanner", cmd: `nuclei -u http://${mission.target}`, color: 'group-hover:text-orange-500' },
                                    { name: 'SQLMap', label: t.sqlmapBtn, desc: t.sqlmapDesc, cmd: `sqlmap -u http://${mission.target}${targetPort ? ':' + targetPort : ''} --batch`, color: 'group-hover:text-blue-500' },
                                    { name: 'Enum4Linux', label: t.enum4linuxBtn, desc: t.enum4linuxDesc, cmd: `enum4linux -a ${mission.target}`, color: 'group-hover:text-blue-500' },
                                    { name: 'SMBClient', label: t.smbclientBtn, desc: t.smbclientDesc, cmd: `smbclient -L ${mission.target} -N`, color: 'group-hover:text-blue-500' },
                                    { name: 'FTP', label: t.ftpBtn, desc: t.ftpDesc, cmd: `ftp -n ${mission.target}`, color: 'group-hover:text-blue-500' },
                                    { name: 'Responder', label: "Responder", desc: "Analyze Mode", cmd: `responder -I eth0 -A`, color: 'group-hover:text-red-500' },
                                    { name: 'BloodHound', label: "BloodHound", desc: "AD Collection", cmd: `bloodhound-python -u 'User' -p 'P@ssword!' -d ${mission.target} -c All`, color: 'group-hover:text-blue-500' },
                                ]
                            },
                            {
                                groupName: 'Exploitation & Brute Force',
                                tools: [
                                    { name: 'Metasploit PortScan', label: "Metasploit", desc: "Auxiliary TCP Scan", cmd: `msfconsole -q -x "use auxiliary/scanner/portscan/tcp; set RHOSTS ${mission.target}; run; exit"`, color: 'group-hover:text-red-500' },
                                    { name: 'Hydra Brute Force', label: t.hydraBtn, desc: t.hydraDesc, cmd: `hydra -l admin -P /usr/share/wordlists/rockyou.txt ssh://${mission.target}${targetPort ? ':' + targetPort : ''}`, color: 'group-hover:text-red-500' },
                                    { name: 'NetExec', label: "NetExec", desc: "Network Execution", cmd: `nxc smb ${mission.target} ${targetPort ? '--port ' + targetPort : ''}`, color: 'group-hover:text-red-500' },
                                    { name: 'Aircrack-ng', label: "Aircrack", desc: "Speed Benchmark", cmd: `aircrack-ng --test`, color: 'group-hover:text-blue-500' },
                                    { name: 'John', label: "John the Ripper", desc: "Speed Test", cmd: `john --test`, color: 'group-hover:text-red-500' },
                                    { name: 'Hashcat', label: "Hashcat", desc: "GPU Benchmark", cmd: `hashcat -b`, color: 'group-hover:text-red-500' },
                                ]
                            }
                        ].map((group, gIdx) => (
                            <div key={gIdx} className="mb-6">
                                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3 ml-1 border-b border-slate-200 dark:border-slate-700 pb-1">
                                    {group.groupName}
                                </h4>
                                <div className="space-y-3">
                                {group.tools.map((tool, idx) => (
                            <div key={idx} className="w-full bg-slate-50 dark:bg-slate-700 p-4 rounded-lg flex items-center justify-between group transition-all">
                                {editingToolId === `${gIdx}-${idx}` ? (
                                    <div className="flex-1 mr-4">
                                        <input 
                                            autoFocus
                                            type="text" 
                                            value={editingToolCmd}
                                            onChange={(e) => setEditingToolCmd(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !isCommandRunning) {
                                                    runCommand(tool.name, editingToolCmd);
                                                    setEditingToolId(null);
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
                                    {editingToolId === `${gIdx}-${idx}` ? (
                                        <>
                                            <button onClick={(e) => { e.stopPropagation(); setEditingToolId(null); }} className="text-slate-500 hover:text-red-500 px-2 py-1 text-xs">{t.cancel}</button>
                                            <button 
                                                onClick={(e) => { 
                                                    e.stopPropagation();
                                                    runCommand(tool.name, editingToolCmd); 
                                                    setEditingToolId(null); 
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
                                                onClick={(e) => { e.stopPropagation(); setEditingToolCmd(tool.cmd); setEditingToolId(`${gIdx}-${idx}`); }}
                                                title={t.editCmd}
                                                className="text-slate-400 hover:text-blue-500 p-1.5 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); runCommand(tool.name, tool.cmd); }}
                                                disabled={isCommandRunning}
                                                className={`text-slate-400 dark:text-slate-500 ${tool.color} transition-colors disabled:opacity-50`}
                                            >
                                                <PlayCircle size={20} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                                ))}
                                </div>
                            </div>
                        ))}
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
                        {!isCommandRunning && (
                            <button 
                                onClick={clearMainHistory}
                                className="px-2 py-0.5 text-xs bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 border border-gray-500/20 rounded flex items-center gap-1 transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-sm" ref={scrollRef}>
                        <div className="text-slate-500 mb-2">{t.sessionInit}</div>
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
                             <div className="flex items-center justify-between mb-4">
                                 <p className="text-slate-600 dark:text-slate-300 text-sm font-bold">
                                    Select Tools & Sequence:
                                 </p>
                                 <input 
                                     type="text" 
                                     placeholder="Port (Opt)"
                                     value={targetPort}
                                     onChange={(e) => setTargetPort(e.target.value)}
                                     className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder:text-slate-400"
                                 />
                             </div>
                             <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
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
                        {!isCommandRunning && (
                            <button 
                                onClick={clearMainHistory}
                                className="px-2 py-0.5 text-xs bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 border border-gray-500/20 rounded flex items-center gap-1 transition-colors"
                            >
                                Clear
                            </button>
                        )}
                        </div>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-sm" ref={scrollRef}>
                        <div className="text-slate-500 mb-2">{t.autoPilotSeq}</div>
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

        

        {activeTab === 'custom' && (
          <div className="grid grid-cols-1 gap-6 animate-fadeIn h-[600px] flex flex-col">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t.freeTerminal}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t.freeTerminalDesc}
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
                  <Play size={20} /> {t.execute}
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
                    {!isCustomCommandRunning && (
                        <button 
                            onClick={clearCustomHistory}
                            className="px-2 py-0.5 text-xs bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 border border-gray-500/20 rounded flex items-center gap-1 transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
                <div className="flex-1 p-4 overflow-y-auto font-mono text-sm" ref={customScrollRef}>
                    <div className="text-slate-500 mb-2">{t.independentRootTerminal}</div>
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
        )}

        {activeTab === 'findings' && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden overflow-x-auto animate-fadeIn transition-colors">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900/50 uppercase text-xs font-semibold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4">Title</th>
                  <th className="px-6 py-4">Severity</th>
                  <th className="px-6 py-4">{t.status}</th>
                  <th className="px-6 py-4">Date & Time</th>
                  <th className="px-6 py-4">Executed By</th>
                  <th className="px-6 py-4">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {mission.vulnerabilities.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{v.title}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs border ${getSeverityColor(v.severity || v.criticality)}`}>
                        {v.severity || v.criticality}
                      </span>
                    </td>
                    <td className="px-6 py-4">{v.status || "Open"}</td>
                    <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {(() => {
                           const targetDate = v.updated_at || v.created_at;
                           if (targetDate) {
                               return new Date(targetDate).toLocaleString('fr-FR', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit', second: '2-digit'
                               });
                           }
                           return v.dateFound || new Date().toLocaleString('fr-FR', {
                               day: '2-digit', month: '2-digit', year: 'numeric',
                               hour: '2-digit', minute: '2-digit', second: '2-digit'
                           });
                        })()}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                        {v.executed_by || "Automated Scan"}
                    </td>
                    <td className="px-6 py-4">
                        <button 
                            onClick={() => setSelectedVuln(v)}
                            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                        >
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
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                    {reportEngine === 'docx' ? "Generate DOCX Report" : "Generate AI Executive Summary"}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto mb-8">
                  {reportEngine === 'docx' 
                    ? "Generate a deterministic DOCX report containing statistical analysis, total CVSS scores, and pre-analyzed tool findings."
                    : "Generate an Executive Summary with Google Gemini AI based on mission findings."}
                </p>
                <button
                  onClick={reportEngine === 'docx' ? handleDownloadDocxReport : handleGenerateGeminiReport}
                  disabled={isGenerating}
                  className="bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-blue-500/25 flex items-center gap-3 mx-auto"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full"></div>
                      {reportEngine === 'docx' ? "Generating DOCX..." : "Analyzing with AI..."}
                    </>
                  ) : (
                    <>
                      <TerminalIcon size={18} />
                      {reportEngine === 'docx' ? "Download DOCX Report" : "Generate Report"}
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

      {/* Vulnerability Details Modal */}
      {selectedVuln && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-8 animate-fadeIn">
            <div className="relative bg-[#0f172a] rounded-xl w-full max-w-5xl h-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-700 overflow-hidden">
                {/* Header */}
                <div className="flex-shrink-0 p-4 border-b border-slate-800 flex justify-between items-center bg-[#1e293b] z-10 shadow-sm">
                    <div className="flex-1 pr-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-3">
                            <TerminalIcon size={18} className="text-emerald-500" />
                            {selectedVuln.title}
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold border ${getSeverityColor(selectedVuln.severity || selectedVuln.criticality)}`}>
                                {selectedVuln.severity || selectedVuln.criticality}
                            </span>
                        </h3>
                        {selectedVuln.executed_by && (
                           <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400 font-mono">
                                <User size={12} className="text-blue-400" />
                                <span>{t.executedBy || "By"}: <span className="text-slate-200">{selectedVuln.executed_by}</span></span>
                           </div>
                        )}
                    </div>
                    <button 
                        onClick={() => setSelectedVuln(null)} 
                        className="text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>
                
                {/* Body - Pure Terminal Look */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-[#0a0f1c] text-slate-200 font-mono text-sm leading-relaxed whitespace-pre-wrap break-all border-t border-b border-slate-800/50 shadow-inner">
                    <div className="mb-4 pb-4 border-b border-slate-800/50">
                        {selectedVuln.description}
                    </div>
                    {selectedVuln.evidence && (
                        <div>
                            <span className="text-slate-500 font-semibold mb-2 block">{t.logs || "Logs / Evidence"}:</span>
                            {selectedVuln.evidence}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

    </div>
  );
};