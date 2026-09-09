# PulseMonitor - Local System Resource & Process Monitor

PulseMonitor is a lightweight, zero-configuration local performance telemetry server and real-time web monitoring application. It collects system hardware metrics (CPU, RAM, Swap, Disk I/O, Network Bandwidth) and process details, streaming them via **Server-Sent Events (SSE)** into a Web UI dashboard.

---

## Features

- **Real-Time Telemetry Streaming**: Low-latency Server-Sent Events (SSE) pipeline with customizable refresh intervals (0.5s – 5.0s).
- **CPU Monitoring**: Overall CPU utilization %, per-core load breakdown grid, clock frequency (MHz), and core count stats.
- **Memory Tracking**: RAM usage percentage, available memory, swap usage, and used/total GB display.
- **Network Throughput**: Real-time Download (RX) & Upload (TX) speed calculation (KB/s or MB/s), total transfer counters, and active connection counts.
- **Storage & Disk I/O**: Partition utilization bars, free disk space, and Read/Write throughput speeds.
- **Process Manager**: Sortable top processes table (by CPU %, Memory MB, PID, Name), live search filter, and process termination with confirmation safeguards.
- **Glassmorphism UI**: High-contrast dark theme, animated SVG circular progress gauges, responsive grid layout, and Chart.js rolling time-series graphs.

---

## Quick Start

### 1. Requirements
- **Python 3.8+**
- `psutil` Python package

### 2. Installation
Navigate into the `pulse-monitor` directory and install the required dependency:

```bash
pip install -r requirements.txt
```

### 3. Launching the Monitor
Run the launcher script:

```bash
python run.py
```

`run.py` will automatically:
1. Check that required dependencies (`psutil`) are installed.
2. Select an open local port (starting at `8080`).
3. Start the backend HTTP & SSE telemetry server.
4. Launch your default web browser to `http://localhost:8080`.

---

## Project Structure

```text
pulse-monitor/
├── app.py              # Backend HTTP server & telemetry collector
├── run.py              # Single-command launcher & auto-browser opener
├── index.html          # Web UI dashboard HTML template
├── styles.css          # Glassmorphism cyber dark theme CSS stylesheet
├── app.js              # Real-time SSE client & Chart.js graph rendering
├── requirements.txt    # Python package dependencies (psutil)
└── README.md           # Documentation & getting started guide
```

---

## API Endpoints

The backend server (`app.py`) exposes the following endpoints:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | Serves the main web dashboard (`index.html`). |
| `/api/system` | `GET` | Returns static hardware & OS metadata (OS version, architecture, CPU model/cores, uptime). |
| `/api/snapshot` | `GET` | Returns a single JSON snapshot of current CPU, memory, network, disk, and process telemetry. |
| `/api/stream` | `GET` | Server-Sent Events (SSE) endpoint streaming real-time JSON metrics deltas. Query parameter `?interval=1.0`. |
| `/api/processes` | `GET` | Returns active process list. Query parameters: `?sort=cpu`, `?search=term`, `?limit=100`. |
| `/api/process/kill` | `POST` | Safely requests process termination. Body payload: `{"pid": <PID>}`. |

---
