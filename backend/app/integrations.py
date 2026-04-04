import requests
import logging
from typing import Optional

logger = logging.getLogger(__name__)

def send_webhook_alert(url: str, provider: str, title: str, description: str, cvss: float):
    if not url:
        return
    
    payload = {}
    try:
        if provider.lower() == "discord":
            payload = {
                "content": f"🚨 **CRITICAL VULNERABILITY DETECTED** 🚨\n**{title}** (CVSS: {cvss})\n\n{description}"
            }
        elif provider.lower() == "slack":
            payload = {
                "text": f"🚨 *CRITICAL VULNERABILITY DETECTED* 🚨\n*{title}* (CVSS: {cvss})\n\n{description}"
            }
        elif provider.lower() == "teams":
            payload = {
                "@type": "MessageCard",
                "@context": "http://schema.org/extensions",
                "themeColor": "FF0000",
                "summary": "Critical Vulnerability Detected",
                "title": f"🚨 CRITICAL VULNERABILITY DETECTED: {title} (CVSS: {cvss})",
                "text": description
            }
        
        if payload:
            response = requests.post(url, json=payload, timeout=5)
            response.raise_for_status()
            logger.info(f"Webhook sent successfully to {provider}")
    except Exception as e:
        logger.error(f"Failed to send {provider} webhook: {str(e)}")

# Metasploit RPC (Basic Stub)
class MetasploitAPI:
    def __init__(self, host, port, username, password):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.token = None

    def connect(self):
        # In a real scenario, use msfrpc client or msgpack over HTTP
        pass

# GVM/Nessus (Basic Stub)
class NessusAPI:
    def __init__(self, url, access_key, secret_key):
        self.url = url
        self.headers = {"X-ApiKeys": f"accessKey={access_key}; secretKey={secret_key}"}

    def get_scans(self):
        try:
            resp = requests.get(f"{self.url}/scans", headers=self.headers, verify=False, timeout=10)
            return resp.json()
        except Exception as e:
            return {"error": str(e)}

