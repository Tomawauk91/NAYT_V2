import re

with open("components/MissionControl.tsx", "r", encoding="utf-8") as f:
    content = f.read()

new_ui = """                          ].map((tool, idx) => (
                              <div key={idx} className="w-full bg-slate-50 dark:bg-slate-700 p-4 rounded-lg flex items-center justify-between group transition-all">
                                  {editingToolIdx === idx ? (
                                      <div className="flex-1 flex gap-2 w-full items-center">
                                          <input 
                                              type="text" 
                                              value={editingToolCmd} 
                                              onChange={(e) => setEditingToolCmd(e.target.value)}
                                              onKeyDown={(e) => {
                                                  if (e.key === 'Enter' && editingToolCmd.trim() && !isCommandRunning) {
                                                      runCommand(tool.name, editingToolCmd);
                                                      setEditingToolIdx(null);
                                                  }
                                              }}
                                              className="flex-1 bg-white dark:bg-slate-900 border border-blue-400 dark:border-blue-500 rounded px-2 py-1.5 text-sm text-slate-900 dark:text-green-400 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                                              autoFocus
                                          />
                                          <button 
                                              onClick={() => { setEditingToolIdx(null); }}
                                              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2"
                                              title="Annuler"
                                          >
                                              &times;
                                          </button>
                                          <button 
                                              onClick={() => { 
                                                  if(!isCommandRunning && editingToolCmd.trim()) {
                                                      runCommand(tool.name, editingToolCmd);
                                                      setEditingToolIdx(null);
                                                  }
                                              }}
                                              disabled={isCommandRunning || !editingToolCmd.trim()}
                                              className="text-white bg-blue-600 hover:bg-blue-700 rounded p-1.5 transition-colors disabled:opacity-50"
                                              title="Lancer"
                                          >
                                              <Play size={16} />
                                          </button>
                                      </div>
                                  ) : (
                                      <>
                                          <div className="flex-1 cursor-pointer overflow-hidden pr-2" onClick={() => !isCommandRunning && runCommand(tool.name, tool.cmd)}>
                                              <span className="block text-slate-900 dark:text-white font-medium">{tool.label}</span>
                                              <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{tool.cmd}</span>
                                          </div>
                                          <div className="flex gap-2 flex-shrink-0 items-center">
                                              <button 
                                                  onClick={(e) => { 
                                                      e.stopPropagation(); 
                                                      setEditingToolCmd(tool.cmd); 
                                                      setEditingToolIdx(idx); 
                                                  }}
                                                  title="Modifier la commande avant exécution"
                                                  className="text-slate-400 hover:text-blue-500 p-1.5 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                              >
                                                  <Edit2 size={16} />
                                              </button>
                                              <button 
                                                  onClick={() => runCommand(tool.name, tool.cmd)}
                                                  disabled={isCommandRunning}
                                                  className={`text-slate-400 dark:text-slate-500 ${tool.color} transition-colors disabled:opacity-50`}
                                              >
                                                  <PlayCircle size={20} />
                                              </button>
                                          </div>
                                      </>
                                  )}
                              </div>
                          ))}"""

# Replace the block
content = re.sub(r'\]\.map\(\(tool, idx\) => \(\s*<div key=\{idx\}.*?</div>\s*\)\) \]\s*\)\}', new_ui, content, flags=re.DOTALL)
# A regex fix is needed here. It's safer to use simple start/end find.

start_str = "                          ].map((tool, idx) => ("
end_str = "                          ))}"

start_idx = content.find(start_str)
end_idx = content.find(end_str, start_idx) + len(end_str)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_ui + content[end_idx:]
    with open("components/MissionControl.tsx", "w", encoding="utf-8") as f:
        f.write(content)
else:
    print("Could not find boundaries")

