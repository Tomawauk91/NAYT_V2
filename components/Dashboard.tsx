import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Mission, Criticality, Language } from '../types';
import { translations } from '../translations';

interface DashboardProps {
  missions: Mission[];
  lang: Language;
}

const COLORS = {
  [Criticality.CRITICAL]: '#ef4444', // red-500
  [Criticality.HIGH]: '#f97316', // orange-500
  [Criticality.MEDIUM]: '#eab308', // yellow-500
  [Criticality.LOW]: '#3b82f6', // blue-500
  [Criticality.INFO]: '#64748b', // slate-500
};

export const Dashboard: React.FC<DashboardProps> = ({ missions, lang }) => {
  const t = translations[lang];
  const [selectedMissionId, setSelectedMissionId] = useState<string>('all');

  const filteredMissions = selectedMissionId === 'all' 
    ? missions 
    : missions.filter(m => String(m.id) === selectedMissionId);

  // Aggregate data for charts
  const severityCounts = filteredMissions.flatMap(m => m.vulnerabilities).reduce((acc, v) => {
    const sev = v.severity || v.criticality || Criticality.INFO;
    acc[sev] = (acc[sev] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(severityCounts).map(([name, value]) => ({ name, value }));

  const statusData = filteredMissions.map(m => ({
    name: m.name.split(' ').slice(0, 2).join(' '),
    vulns: m.vulnerabilities.length,
    critical: m.vulnerabilities.filter(v => (v.severity || v.criticality) === Criticality.CRITICAL).length
  }));

  // Recharts tooltip custom content style
  const tooltipStyle = {
      backgroundColor: 'var(--tw-colors-slate-800)', // Dynamic override in render
      border: 'none',
      borderRadius: '8px',
      color: '#fff'
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Mission Selection Filter */}
      <div className="flex justify-end mb-4">
        <div className="relative">
          <select 
            className="appearance-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 py-2 pl-4 pr-10 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            value={selectedMissionId}
            onChange={(e) => setSelectedMissionId(e.target.value)}
          >
            <option value="all">Toutes les missions (All)</option>
            {missions.map(m => (
              <option key={m.id} value={String(m.id)}>
                {m.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500 dark:text-slate-400">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg transition-colors">
          <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">{t.activeMissions}</h3>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{filteredMissions.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg transition-colors">
          <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">{t.totalFindings}</h3>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
            {filteredMissions.reduce((acc, m) => acc + m.vulnerabilities.length, 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg transition-colors">
          <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">{t.criticalRisks}</h3>
          <p className="text-3xl font-bold text-red-500 mt-2">
            {filteredMissions.flatMap(m => m.vulnerabilities).filter(v => (v.severity || v.criticality) === Criticality.CRITICAL).length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg min-h-[400px] transition-colors">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">{t.severityDist}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[entry.name as Criticality]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                    backgroundColor: 'rgba(30, 41, 59, 0.9)', 
                    border: 'none', 
                    borderRadius: '8px', 
                    color: '#fff' 
                }} 
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg min-h-[400px] transition-colors">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">{t.findingsPerMission}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusData}>
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                cursor={{fill: 'rgba(148, 163, 184, 0.2)'}} 
                contentStyle={{ 
                    backgroundColor: 'rgba(30, 41, 59, 0.9)', 
                    border: 'none', 
                    borderRadius: '8px', 
                    color: '#fff' 
                }} 
               />
              <Legend />
              <Bar dataKey="vulns" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="critical" name="Critical" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};