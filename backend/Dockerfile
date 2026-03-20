# Use Kali Linux Rolling as base to ensure all pentest tools are available
FROM kalilinux/kali-rolling

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Install system dependencies and security tools
# We run update and install in one layer to keep image size reasonable
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    nmap \
    nikto \
    sqlmap \
    dirb \
    gobuster \
    curl \
    wget \
    netcat-traditional \
    dnsrecon \
    whatweb \
    whois \
    dnsutils \
    iputils-ping \
    hydra \
    sslscan \
    traceroute \
    enum4linux \
    smbclient \
    ftp \
    python3-impacket \
    git \
    john \
    wordlists \
    amass \
    theharvester \
    metasploit-framework \
    tshark \
    suricata \
    zaproxy \
    ffuf \
    nuclei \
    aircrack-ng \
    crackmapexec \
    netexec \
    responder \
    hashcat

# Install testssl.sh manually
RUN git clone --depth 1 https://github.com/drwetter/testssl.sh.git /opt/testssl.sh && \
    ln -s /opt/testssl.sh/testssl.sh /usr/local/bin/testssl.sh

# Initialize NetExec to create databases and folders during build
RUN netexec smb 127.0.0.1 --dry-run || true

# Initialize Suricata rules
RUN suricata-update || echo "Suricata update failed, continuing anyway"

# Unzip rockyou for easy usage
RUN gunzip /usr/share/wordlists/rockyou.txt.gz || true

# Cleanup to reduce image size
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

# Create virtual environment for Python to avoid system package conflicts
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install Python dependencies and tools
COPY requirements.txt .
RUN pip install --no-cache-dir bloodhound sslyze gvm-tools && \
    pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Run the application
# We will use a script to start both Celery (if needed in same container) or just the API
# For now, default CMD is Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
