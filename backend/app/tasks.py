import subprocess
import shutil
from .celery_app import celery_app
import logging

logger = logging.getLogger(__name__)

def check_tool_availability(tool_name: str) -> bool:
    """Check if a tool is installed and available in the PATH."""
    return shutil.which(tool_name) is not None

@celery_app.task(bind=True)
def run_scan_task(self, tool: str, target: str, options: str = ""):
    """
    Executes a security tool against a target.
    
    Args:
        tool: The name of the tool (nmap, nikto, etc.)
        target: The target URL or IP
        options: Additional command line flags
    """
    
    # Authorized tools list to prevent arbitrary command execution (basic security)
    AUTHORIZED_TOOLS = [
        "nmap", "nikto", "sqlmap", "dirb", "gobuster", 
        "curl", "wget", "netcat", "nc", "dnsrecon", 
        "whatweb", "whois", "dig", "hydra"
    ]
    
    if tool not in AUTHORIZED_TOOLS:
        return {"status": "error", "output": f"Tool '{tool}' is not authorized or supported."}

    if not check_tool_availability(tool):
        return {"status": "error", "output": f"Tool '{tool}' is not installed in the container backend."}

    # Construct command
    # The frontend usually sends the full command line arguments in 'options' (including the target)
    cmd = [tool] + options.split()

    # Just in case options is empty (shouldn't happen with current frontend logic, but for safety)
    if len(cmd) == 1:
        cmd.append(target)

    logger.info(f"Executing command: {' '.join(cmd)}")
    self.update_state(state='PROGRESS', meta={'cmd': cmd})

    try:
        # Run command
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            timeout=3600 # 1 hour timeout
        )
        
        output = result.stdout
        error = result.stderr
        
        if result.returncode != 0 and tool != "nikto": # Nikto often returns non-zero even on success/warnings
            return {
                "status": "failed", 
                "return_code": result.returncode,
                "command": " ".join(cmd),
                "output": output,
                "error": error
            }
            
        return {
            "status": "completed",
            "command": " ".join(cmd),
            "output": output
        }

    except subprocess.TimeoutExpired:
        return {"status": "error", "output": "Scan timed out."}
    except Exception as e:
        return {"status": "error", "output": str(e)}

@celery_app.task(bind=True)
def run_auto_scan_task(self, target: str, selected_tool_names: list = None):
    """
    Runs a defined sequence of tools against a target automatically.
    """
    
    # Define all available steps
    # (Label, Command Template)
    all_steps = {
        "nmap": ("Nmap Quick", ["nmap", "-F", target]),
        "whois": ("Whois", ["whois", target]),
        "dnsrecon": ("DNS Recon", ["dnsrecon", "-d", target]),
        "whatweb": ("WhatWeb", ["whatweb", target]),
        "nikto": ("Nikto", ["nikto", "-h", target]),
        "hydra": ("Hydra SSH", ["hydra", "-l", "root", "-P", "/usr/share/wordlists/rockyou.txt", f"ssh://{target}"]),
        "sqlmap": ("SQLMap Batch", ["sqlmap", "-u", f"http://{target}", "--batch"]),
        "dirb": ("Dirb", ["dirb", f"http://{target}"]),
        "gobuster": ("Gobuster", ["gobuster", "dir", "-u", f"http://{target}", "-w", "/usr/share/wordlists/dirb/common.txt"]),
        "curl": ("Curl Headers", ["curl", "-I", target]),
        "dig": ("Dig Trace", ["dig", target, "+trace"]),
    }

    # If no tools selected, default to a safe subset
    if not selected_tool_names:
        selected_tool_names = ["nmap", "whois", "dnsrecon", "whatweb"]

    overall_output = f"=== AUTO SCAN REPORT FOR {target} ===\n"
    overall_output += f"Tools: {', '.join(selected_tool_names)}\n\n"
    
    for tool_key in selected_tool_names:
        if tool_key not in all_steps:
            continue
            
        name, cmd = all_steps[tool_key]
        
        if not shutil.which(cmd[0]):
             overall_output += f"--- {name} ---\n[!] Tool not found.\n\n"
             continue
             
        # Update state so frontend knows what's running
        self.update_state(state='PROGRESS', meta={
            'output': overall_output + f"\n>>> RUNNING: {name}...\n", # Current log so far
            'current_step': name
        })
        
        overall_output += f"--- {name} ---\n> {' '.join(cmd)}\n"
        
        try:
            # We still wait for each tool to finish (not streaming sub-process stdout to celery state line-by-line yet)
            # but at least we updated the "Running..." status above.
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            overall_output += res.stdout + "\n"
            if res.stderr:
                overall_output += f"[STDERR]\n{res.stderr}\n"
        except Exception as e:
            overall_output += f"[ERROR] {str(e)}\n"
            
        overall_output += "\n" + "="*30 + "\n\n"
        
    return {
        "status": "completed",
        "command": "auto_scan",
        "output": overall_output
    }
