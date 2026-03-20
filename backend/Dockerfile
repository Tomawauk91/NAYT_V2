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
    git \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create virtual environment for Python to avoid system package conflicts
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Run the application
# We will use a script to start both Celery (if needed in same container) or just the API
# For now, default CMD is Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
