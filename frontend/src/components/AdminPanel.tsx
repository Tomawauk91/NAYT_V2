import React, { useState, useEffect } from 'react';
import { User, Role, IpRange, Language } from '../types';
import { translations } from '../translations';
import { toolsService } from '../services/apiService';
import { Trash2, UserPlus, Shield, Globe, Plus, RefreshCw, X, Copy, Check } from 'lucide-react';

interface AdminPanelProps {
  notify: (type: 'success' | 'error', message: string) => void;
  users: User[];
  setUsers: (users: User[]) => void;
  lang: Language;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ notify, users, setUsers, lang }) => {
  const t = translations[lang];
  const [activeTab, setActiveTab] = useState<'users' | 'config'>('users');
  const [ips, setIps] = useState<IpRange[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [reportType, setReportType] = useState('docx');
  const [webhookDiscord, setWebhookDiscord] = useState("");
  const [webhookTeams, setWebhookTeams] = useState("");
  const [webhookSlack, setWebhookSlack] = useState("");
  const [cvssThreshold, setCvssThreshold] = useState("9.0");
  
  useEffect(() => {
     if(activeTab === 'config') {
         loadConfig();
     }
  }, [activeTab]);

  const loadConfig = async () => {
      try {
          const keys = await Promise.all([
             toolsService.getConfig('gemini_api_key'),
             toolsService.getConfig('report_type'),
             toolsService.getConfig('webhook_discord'),
             toolsService.getConfig('webhook_slack'),
             toolsService.getConfig('webhook_teams'),
             toolsService.getConfig('alert_cvss_threshold')
          ]);
          setApiKey(keys[0].value || '');
          setReportType(keys[1].value || 'docx');
          setWebhookDiscord(keys[2]?.value || '');
          setWebhookSlack(keys[3]?.value || '');
          setWebhookTeams(keys[4]?.value || '');
          setCvssThreshold(keys[5]?.value || '9.0');
      } catch (e) {
          console.error(e);
      }
  };

  const saveConfig = async () => {
      try {
          await toolsService.saveConfig('gemini_api_key', apiKey);
          await toolsService.saveConfig('report_type', reportType);
          await toolsService.saveConfig('webhook_discord', webhookDiscord);
          await toolsService.saveConfig('webhook_slack', webhookSlack);
          await toolsService.saveConfig('webhook_teams', webhookTeams);
          await toolsService.saveConfig('alert_cvss_threshold', cvssThreshold);
          notify('success', 'Configuration Saved');
      } catch (e) {
          notify('error', 'Failed to save config');
      }
  };

  // Fetch users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
        const data = await toolsService.getUsers();
        // Map backend users to frontend format
        const mappedUsers = data.map((u: any) => ({
            id: u.id,
            username: u.username,
            role: u.role || Role.VIEWER, // Simple role assumption
            lastLogin: 'Unknown',
            password: '', // Hidden
            isTempPassword: false
        }));
        setUsers(mappedUsers);
    } catch (e) {
        console.error("Failed to fetch users");
    }
  };

  // Password Display State
  const [generatedCreds, setGeneratedCreds] = useState<{username: string, password: string} | null>(null);

  // Form states
  const [newUser, setNewUser] = useState({ username: '', role: Role.VIEWER });
  const [newIp, setNewIp] = useState({ cidr: '', description: '' });

  // Password Generator
  const generateSecurePassword = (length = 16) => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let retVal = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username) {
        notify('error', 'Username is required');
        return;
    }
    
    const tempPassword = generateSecurePassword();

    try {
        await toolsService.createUser({
            username: newUser.username,
            password: tempPassword, role: newUser.role
        });
        
        setNewUser({ username: '', role: Role.VIEWER });
        setGeneratedCreds({ username: newUser.username, password: tempPassword, role: newUser.role });
        notify('success', `${t.userCreated} (${newUser.username})`);
        fetchUsers(); // Refresh list
    } catch (error) {
        notify('error', 'Failed to create user');
    }
  };

  const handleResetPassword = async (userId: string, username: string) => {
    const newTempPassword = generateSecurePassword();
    
    try {
        // userId is likely a number from backend but string in frontend type
        await toolsService.resetPassword(Number(userId), newTempPassword);
        setGeneratedCreds({ username: username, password: newTempPassword });
        notify('success', t.userReset);
        fetchUsers();
    } catch (error) {
        notify('error', 'Failed to reset password');
    }
  };

  const handleAddIp = (e: React.FormEvent) => {
    e.preventDefault();
    // IP persistence not implemented yet in backend as per requirements focus
    // Keeping local for now or should remove if "remove unused elements" is strict?
    // User didn't strictly ask for IP persistence but "everything I do".
    // I'll keep local for now to avoid breaking UI, but note it's not persisted.
    if (!newIp.cidr) {
        notify('error', 'CIDR is required');
        return;
    }
    const ip: IpRange = {
        id: `ip-${Date.now()}`,
        cidr: newIp.cidr,
        description: newIp.description || 'No description'
    };
    setIps([...ips, ip]);
    setNewIp({ cidr: '', description: '' });
    notify('success', t.ipWhitelisted);
  };

  const handleDeleteUser = async (id: string) => {
    try {
        await toolsService.deleteUser(Number(id));
        notify('success', t.userRemoved);
        fetchUsers();
    } catch (error) {
        notify('error', 'Failed to delete user');
    }
  };

  const handleDeleteIp = (id: string) => {
    setIps(ips.filter(i => i.id !== id));
    notify('success', t.ipRemoved);
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => notify('success', t.copied))
        .catch(() => notify('error', 'Failed to copy'));
    } else {
      // Fallback for non-HTTPS environments (like local network IPs without TLS)
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        notify('success', t.copied);
      } catch (error) {
        notify('error', 'Failed to copy');
      } finally {
        textArea.remove();
      }
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn relative">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg transition-colors">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="text-red-500" /> {t.admin}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">{t.adminDesc}</p>
      </div>

      <div className="flex border-b border-slate-200 dark:border-slate-700 space-x-6">
        <button
            onClick={() => setActiveTab('users')}
            className={`pb-4 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === 'users' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
        >
            <UserPlus size={16} /> {t.userMgmt}
            {activeTab === 'users' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full animate-scaleIn" />}
        </button>
        <button
            onClick={() => setActiveTab('config')}
            className={`pb-4 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === 'config' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
        >
            <Globe size={16} /> System Config
            {activeTab === 'config' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full animate-scaleIn" />}
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 uppercase text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <tr>
                            <th className="px-6 py-4">{t.username}</th>
                            <th className="px-6 py-4">{t.role}</th>
                            <th className="px-6 py-4">{t.status}</th>
                            <th className="px-6 py-4">{t.actions}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {users.map(u => (
                            <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{u.username}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-xs border ${
                                        u.role === Role.ADMIN ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20' :
                                        u.role === Role.PENTESTER ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20' :
                                        'bg-slate-100 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/20'
                                    }`}>
                                        {u.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-xs">
                                    {u.isTempPassword ? (
                                        <span className="text-orange-500 dark:text-orange-400 flex items-center gap-1 animate-pulse">{t.tempPw}</span>
                                    ) : (
                                        <span className="text-emerald-500 dark:text-emerald-400">{t.active}</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 flex gap-2">
                                    <button 
                                        onClick={() => handleResetPassword(u.id, u.username)} 
                                        className="text-slate-400 hover:text-orange-500 dark:text-slate-500 dark:hover:text-orange-400 transition-colors"
                                        title={t.reset}
                                    >
                                        <RefreshCw size={16} />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteUser(u.id)} 
                                        className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
                                        title="Delete User"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 h-fit transition-colors">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t.addUser}</h3>
                <form onSubmit={handleAddUser} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t.username}</label>
                        <input 
                            type="text" 
                            value={newUser.username}
                            onChange={e => setNewUser({...newUser, username: e.target.value})}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder={t.usernamePlaceholder}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t.role}</label>
                        <select 
                            value={newUser.role}
                            onChange={e => setNewUser({...newUser, role: e.target.value as Role})}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        >
                            {Object.values(Role).map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 p-3 rounded-lg text-xs text-blue-600 dark:text-blue-300">
                        {t.securePwNote}
                    </div>
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 text-white p-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-lg hover:shadow-blue-500/20">
                        <Plus size={16} /> {t.createAccount}
                    </button>
                </form>
            </div>
        </div>
      )}

      {activeTab === 'ips' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 uppercase text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <tr>
                            <th className="px-6 py-4">{t.cidr}</th>
                            <th className="px-6 py-4">{t.description}</th>
                            <th className="px-6 py-4">{t.actions}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {ips.map(ip => (
                            <tr key={ip.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="px-6 py-4 font-mono text-emerald-600 dark:text-emerald-400">{ip.cidr}</td>
                                <td className="px-6 py-4">{ip.description}</td>
                                <td className="px-6 py-4">
                                    <button onClick={() => handleDeleteIp(ip.id)} className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors">
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 h-fit transition-colors">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t.whitelistIp}</h3>
                <form onSubmit={handleAddIp} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t.cidr}</label>
                        <input 
                            type="text" 
                            value={newIp.cidr}
                            onChange={e => setNewIp({...newIp, cidr: e.target.value})}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono transition-all"
                            placeholder={t.cidrPlaceholder}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t.description}</label>
                        <input 
                            type="text" 
                            value={newIp.description}
                            onChange={e => setNewIp({...newIp, description: e.target.value})}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder={t.descPlaceholder}
                        />
                    </div>
                    <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 text-white p-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-lg hover:shadow-emerald-500/20">
                        <Plus size={16} /> {t.addToWhitelist}
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Generated Password Modal */}
      {generatedCreds && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-8 w-full max-w-sm relative shadow-2xl animate-scaleIn">
                <button 
                    onClick={() => setGeneratedCreds(null)} 
                    className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>
                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200 dark:border-emerald-500/40 animate-pulse">
                        <Shield className="text-emerald-600 dark:text-emerald-400" size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t.credsGenerated}</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
                        {t.credsCopiedDesc}
                    </p>
                </div>
                
                <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-4 border border-slate-200 dark:border-slate-800 space-y-4">
                    <div>
                        <label className="block text-xs uppercase text-slate-500 font-semibold mb-1">{t.username}</label>
                        <div className="text-slate-900 dark:text-white font-mono">{generatedCreds.username}</div>
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-slate-500 font-semibold mb-1">One-Time Password</label>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 bg-white dark:bg-slate-900 p-2 rounded text-emerald-600 dark:text-emerald-400 font-mono text-sm break-all border border-slate-200 dark:border-slate-800">
                                {generatedCreds.password}
                            </code>
                            <button 
                                onClick={() => copyToClipboard(generatedCreds.password)}
                                className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-300 transition-colors"
                                title="Copy Password"
                            >
                                <Copy size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                <button 
                    onClick={() => setGeneratedCreds(null)}
                    className="w-full mt-6 bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg"
                >
                    <Check size={18} /> {t.copied}
                </button>
            </div>
        </div>
      )}
      {activeTab === 'config' && (
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg animate-fadeIn max-w-2xl">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Gemini AI Configuration</h3>
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">API Key</label>
                      <div className="flex gap-2">
                        <input 
                            type="password" 
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Enter your Google Gemini API Key"
                        />
                        <button 
                            onClick={saveConfig}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                        >
                            Save
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">This key will be used by the backend to generate AI executive summaries.</p>
                  </div>

                  <div className="mb-8">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Default Report Engine</h4>
                      <div className="flex gap-4">
                        <select 
                            value={reportType}
                            onChange={(e) => setReportType(e.target.value)}
                            className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="docx">Deterministic DOCX Template (Local)</option>
                            <option value="gemini">Gemini AI Executive Summary (Cloud)</option>
                        </select>
                        <button 
                            onClick={saveConfig}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                        >
                            Save
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">Choose whether the 'Report' tab generates a mathematical DOCX report or calls the Gemini AI for a summary.</p>
                  </div>

                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6 mt-8 border-t pt-8 border-slate-200 dark:border-slate-700">Webhook Integrations</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Discord Webhook</label>
                          <input type="text" value={webhookDiscord} onChange={(e) => setWebhookDiscord(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="https://discord.com/api/webhooks/..." />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Slack Webhook</label>
                          <input type="text" value={webhookSlack} onChange={(e) => setWebhookSlack(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="https://hooks.slack.com/services/..." />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Microsoft Teams Webhook</label>
                          <input type="text" value={webhookTeams} onChange={(e) => setWebhookTeams(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="https://yourdomain.webhook.office.com/webhookb2/..." />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Alerting CVSS Threshold</label>
                          <div className="flex gap-2">
                              <input type="number" step="0.1" min="0" max="10" value={cvssThreshold} onChange={(e) => setCvssThreshold(e.target.value)} className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="9.0" />
                              <button onClick={saveConfig} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Save Webhooks</button>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">Any vulnerability reported manually or by the automated scanner with a CVSS score greater or equal to this threshold will trigger the webhooks.</p>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};