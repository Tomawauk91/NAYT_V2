import React, { useState, useEffect } from 'react';
import { Mission, Criticality, Status, Language } from '../types';
import { translations } from '../translations';
import { Search, ShieldAlert, FileText, Download, Globe, Server, Trash2 } from 'lucide-react';
import { toolsService } from '../services/apiService';

interface FunctionalViewProps {
  missions: Mission[];
  lang: Language;
  onRefresh?: () => void;
  userRole?: string;
}

export const ReconView: React.FC<FunctionalViewProps> = ({ missions, lang }) => {
  const t = translations[lang];
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
         <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Globe className="text-blue-600 dark:text-blue-500" /> {t.globalRecon}
         </h2>
         <p className="text-slate-500 dark:text-slate-400 mb-6">{t.reconDesc}</p>
         
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {missions.map(mission => {
                const reconVulns = mission.vulnerabilities?.filter(v => v.title && v.title.startsWith("Open Port:")) || [];
                return (
                <div key={mission.id} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                        <Server size={20} className="text-emerald-500 dark:text-emerald-400" />
                        <h3 className="font-semibold text-slate-900 dark:text-white">{mission.target}</h3>
                    </div>
                    <div className="text-xs text-slate-500 mb-3 uppercase tracking-wider">{t.discoveredServices}</div>
                    <div className="space-y-2">
                        {reconVulns.length > 0 ? (
                            reconVulns.map(v => {
                                const match = v.title.match(/Open Port:\s*([^\s]+)\s*\((.+)\)/);
                                const port = match ? match[1] : v.title;
                                const service = match ? match[2] : "";
                                return (
                                    <div key={v.id} className="flex justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-300 font-mono">{port}</span>
                                        <span className="text-slate-500">{service}</span>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-sm text-slate-500 italic">Aucun port détecté via Nmap.</div>
                        )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                        <span className="text-xs text-slate-500">Mission: {mission.name}</span>
                    </div>
                </div>
            )})}
         </div>
      </div>
    </div>
  );
};

export const VulnerabilitiesView: React.FC<FunctionalViewProps> = ({ missions, lang, onRefresh }) => {
  const t = translations[lang];

  const getSeverityColor = (severity: any) => {
    switch (severity) {
      case Criticality.CRITICAL: return 'text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20';
      case Criticality.HIGH: return 'text-orange-600 dark:text-orange-500 bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20';
      case Criticality.MEDIUM: return 'text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20';
      case Criticality.LOW: return 'text-blue-600 dark:text-blue-500 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20';
      default: return 'text-slate-600 dark:text-slate-500 bg-slate-100 dark:bg-slate-500/10 border-slate-200 dark:border-slate-500/20';
    }
  };

  const handleUpdateStatus = async (vulnId: number, newStatus: string) => {
      try {
          await toolsService.updateVulnerability(vulnId, { status: newStatus });
          if (onRefresh) onRefresh();
      } catch (e) {
          console.error("Failed to update status", e);
      }
  };

  const handleDelete = async (vulnId: number) => {
      if (!window.confirm("Are you sure you want to delete this vulnerability?")) return;
      try {
          await toolsService.deleteVulnerability(vulnId);
          if (onRefresh) onRefresh();
      } catch (e) {
          console.error("Failed to delete", e);
      }
  };

  const statuses = ["Open", "Confirmed", "Resolved", "Ignored"];

  return (
    <div className="space-y-6 animate-fadeIn">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <ShieldAlert className="text-red-500" /> {t.vulnDb}
            </h2>
             <p className="text-slate-500 dark:text-slate-400 mb-6">{t.vulnDbDesc}</p>
            
            <div className="space-y-8">
                {missions.length === 0 && (
                    <div className="text-center text-slate-500 py-8">No missions available.</div>
                )}
                {missions.map(mission => (
                    <div key={mission.id} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <div className="bg-slate-100 dark:bg-slate-800 px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="font-semibold text-slate-900 dark:text-white">Mission: {mission.title || mission.target}</h3>
                        </div>
                        {mission.vulnerabilities && mission.vulnerabilities.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50 uppercase text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        <tr>
                                            <th className="px-6 py-4">Vulnerability</th>
                                            <th className="px-6 py-4">Severity</th>
                                            <th className="px-6 py-4">{t.status || 'Status'}</th>
                                            <th className="px-6 py-4">{t.date || 'Date'}</th>
                                            <th className="px-6 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                        {mission.vulnerabilities.map((v) => (
                                            <tr key={v.id} className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{v.title}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded text-xs border ${getSeverityColor((v.severity || v.criticality))}`}>
                                                        {(v.severity || v.criticality)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <select 
                                                        value={v.status || "Open"}
                                                        onChange={(e) => handleUpdateStatus(v.id, e.target.value)}
                                                        className="bg-transparent border border-slate-300 dark:border-slate-600 rounded text-xs px-2 py-1 outline-none text-slate-700 dark:text-slate-300"
                                                    >
                                                        {statuses.map(s => <option key={s} value={s} className="bg-white dark:bg-slate-800">{s}</option>)}
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 text-xs font-mono">
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
                                                <td className="px-6 py-4 text-right">
                                                    <button 
                                                        onClick={() => handleDelete(v.id)}
                                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                                        title="Delete Vulnerability"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-6 text-slate-500 text-sm italic">No vulnerabilities found.</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
};

export const ReportsView: React.FC<FunctionalViewProps> = ({ missions, lang }) => {
  const t = translations[lang];
  const [reportEngine, setReportEngine] = useState('docx');
  const [loadingMissionId, setLoadingMissionId] = useState<string | null>(null);

  useEffect(() => {
     toolsService.getConfig('report_type').then(data => {
         if(data && data.value) setReportEngine(data.value);
     }).catch(() => {});
  }, []);

  const handleDownload = async (missionId: string) => {
      setLoadingMissionId(missionId);
      try {
          if(reportEngine === 'docx') {
              await toolsService.downloadMissionReport(missionId as any);
          } else {
              await toolsService.downloadMissionReport(missionId as any); 
          }
      } catch (e) {
          console.error(e);
      }
      setLoadingMissionId(null);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
         <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <FileText className="text-slate-500 dark:text-slate-200" /> {t.reportingCenter}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-xl shadow-lg border border-blue-500/30 text-white transition-transform">
                    <FileText size={32} className="mb-4 opacity-80" />
                    <h3 className="font-bold text-lg">{t.genExecSummary}</h3>
                    <p className="text-blue-100 text-sm mt-2 opacity-80">Moteur actuel: {reportEngine.toUpperCase()}</p>
                </div>
            </div>

            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mt-8 mb-4">Rapports Disponibles pour les Missions</h3>
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden transition-colors">
                 <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-100 dark:bg-slate-950 uppercase text-xs font-semibold text-slate-500">
                        <tr>
                            <th className="px-6 py-4">{t.reportName}</th>
                            <th className="px-6 py-4">{t.type}</th>
                            <th className="px-6 py-4">Client</th>
                            <th className="px-6 py-4">Vulnérabilités</th>
                            <th className="px-6 py-4">{t.actions}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {missions.length === 0 && (
                            <tr><td colSpan={5} className="px-6 py-4 text-center">Aucune mission trouvée.</td></tr>
                        )}
                        {missions.map(mission => (
                            <tr key={mission.id} className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">{mission.name}</td>
                                <td className="px-6 py-4">{reportEngine.toUpperCase()} Report</td>
                                <td className="px-6 py-4">{mission.client?.name || 'N/A'}</td>
                                <td className="px-6 py-4">{mission.vulnerabilities?.length || 0}</td>
                                <td className="px-6 py-4">
                                    <button 
                                        onClick={() => handleDownload(mission.id)}
                                        disabled={loadingMissionId === mission.id}
                                        className="text-white hover:text-blue-100 bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg flex items-center gap-2 font-medium transition-colors disabled:opacity-50"
                                    >
                                        <Download size={14} /> 
                                        {loadingMissionId === mission.id ? "Génération..." : "Aperçu & Générer"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                 </table>
            </div>
         </div>
    </div>
  );
};