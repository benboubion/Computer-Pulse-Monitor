import http.server
import socketserver
import json
import time
import os
import sys
import threading
import platform
import socket
import urllib.parse
import psutil

# Pre-initialize psutil CPU percent tracking
psutil.cpu_percent(percpu=True)
psutil.cpu_percent(percpu=False)

class MetricsCollector:
    def __init__(self):
        self.lock = threading.Lock()
        self.last_net_io = psutil.net_io_counters()
        self.last_disk_io = psutil.disk_io_counters()
        self.last_time = time.time()
        self.boot_time = psutil.boot_time()

    def get_system_info(self):
        try:
            hostname = socket.gethostname()
        except Exception:
            hostname = "LocalHost"

        try:
            freq = psutil.cpu_freq()
            freq_data = {
                "current": round(freq.current, 1) if freq else 0,
                "min": round(freq.min, 1) if freq and freq.min else 0,
                "max": round(freq.max, 1) if freq and freq.max else 0
            }
        except Exception:
            freq_data = {"current": 0, "min": 0, "max": 0}

        return {
            "hostname": hostname,
            "os": platform.system(),
            "os_release": platform.release(),
            "os_version": platform.version(),
            "architecture": platform.machine(),
            "python_version": platform.python_version(),
            "boot_time": self.boot_time,
            "uptime_seconds": int(time.time() - self.boot_time),
            "cpu_count_logical": psutil.cpu_count(logical=True) or 1,
            "cpu_count_physical": psutil.cpu_count(logical=False) or 1,
            "cpu_frequency": freq_data
        }

    def get_snapshot(self):
        with self.lock:
            current_time = time.time()
            time_delta = max(current_time - self.last_time, 0.001)

            # CPU Percentages
            overall_cpu = psutil.cpu_percent(percpu=False)
            cores_cpu = psutil.cpu_percent(percpu=True)

            # Memory Usage
            mem = psutil.virtual_memory()
            swap = psutil.swap_memory()

            memory_data = {
                "total": mem.total,
                "used": mem.used,
                "available": mem.available,
                "free": mem.free,
                "percent": mem.percent,
                "swap_total": swap.total,
                "swap_used": swap.used,
                "swap_free": swap.free,
                "swap_percent": swap.percent
            }

            # Network Bandwidth Rates
            net_io = psutil.net_io_counters()
            bytes_sent_sec = max(0, (net_io.bytes_sent - self.last_net_io.bytes_sent) / time_delta)
            bytes_recv_sec = max(0, (net_io.bytes_recv - self.last_net_io.bytes_recv) / time_delta)
            self.last_net_io = net_io

            try:
                conn_count = len(psutil.net_connections(kind='inet'))
            except Exception:
                conn_count = 0

            net_data = {
                "bytes_sent_sec": round(bytes_sent_sec, 2),
                "bytes_recv_sec": round(bytes_recv_sec, 2),
                "total_sent": net_io.bytes_sent,
                "total_recv": net_io.bytes_recv,
                "packets_sent": net_io.packets_sent,
                "packets_recv": net_io.packets_recv,
                "active_connections": conn_count
            }

            # Disk Storage & I/O Rates
            disk_io = psutil.disk_io_counters()
            if disk_io and self.last_disk_io:
                read_bytes_sec = max(0, (disk_io.read_bytes - self.last_disk_io.read_bytes) / time_delta)
                write_bytes_sec = max(0, (disk_io.write_bytes - self.last_disk_io.write_bytes) / time_delta)
            else:
                read_bytes_sec, write_bytes_sec = 0, 0
            self.last_disk_io = disk_io

            partitions = []
            for part in psutil.disk_partitions(all=False):
                if os.name == 'nt' and 'cdrom' in part.opts.lower():
                    continue
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    partitions.append({
                        "device": part.device,
                        "mountpoint": part.mountpoint,
                        "fstype": part.fstype,
                        "total": usage.total,
                        "used": usage.used,
                        "free": usage.free,
                        "percent": usage.percent
                    })
                except Exception:
                    continue

            disk_data = {
                "read_bytes_sec": round(read_bytes_sec, 2),
                "write_bytes_sec": round(write_bytes_sec, 2),
                "partitions": partitions
            }

            self.last_time = current_time
            top_procs = self.get_processes(limit=10, sort_by="cpu")

            return {
                "timestamp": current_time,
                "cpu": {
                    "overall": overall_cpu,
                    "cores": cores_cpu
                },
                "memory": memory_data,
                "network": net_data,
                "disk": disk_data,
                "top_processes": top_procs
            }

    def get_processes(self, limit=100, sort_by="cpu", search=""):
        procs = []
        for p in psutil.process_iter(['pid', 'name', 'username', 'cpu_percent', 'memory_info', 'memory_percent', 'status', 'num_threads', 'create_time']):
            try:
                info = p.info
                mem_bytes = info['memory_info'].rss if info['memory_info'] else 0
                mem_mb = round(mem_bytes / (1024 * 1024), 2)
                
                name = info['name'] or f"PID {info['pid']}"
                if search and search.lower() not in name.lower() and search not in str(info['pid']):
                    continue

                procs.append({
                    "pid": info['pid'],
                    "name": name,
                    "username": info['username'] or 'System',
                    "cpu_percent": round(info['cpu_percent'] or 0, 1),
                    "memory_mb": mem_mb,
                    "memory_percent": round(info['memory_percent'] or 0, 1),
                    "status": info['status'] or 'running',
                    "threads": info['num_threads'] or 1,
                    "create_time": info['create_time'] or 0
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        if sort_by == "memory":
            procs.sort(key=lambda x: x['memory_mb'], reverse=True)
        elif sort_by == "name":
            procs.sort(key=lambda x: x['name'].lower())
        elif sort_by == "pid":
            procs.sort(key=lambda x: x['pid'])
        else:
            procs.sort(key=lambda x: x['cpu_percent'], reverse=True)

        return procs[:limit]

    def kill_process(self, pid):
        try:
            proc = psutil.Process(pid)
            proc.terminate()
            proc.wait(timeout=3)
            return True, f"Process {pid} terminated successfully."
        except psutil.TimeoutExpired:
            proc.kill()
            return True, f"Process {pid} force killed."
        except psutil.NoSuchProcess:
            return False, f"Process {pid} does not exist."
        except psutil.AccessDenied:
            return False, f"Permission denied to kill process {pid}."
        except Exception as e:
            return False, str(e)


collector = MetricsCollector()

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

class MonitorRequestHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        if "GET /api/stream" in args[0]:
            return
        super().log_message(format, *args)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path == "/api/system":
            self.send_json(collector.get_system_info())
        elif path == "/api/snapshot":
            self.send_json(collector.get_snapshot())
        elif path == "/api/processes":
            sort_by = params.get("sort", ["cpu"])[0]
            search = params.get("search", [""])[0]
            limit = int(params.get("limit", ["100"])[0])
            self.send_json(collector.get_processes(limit=limit, sort_by=sort_by, search=search))
        elif path == "/api/stream":
            self.handle_sse(params)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/process/kill":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body.decode('utf-8'))
                pid = int(data.get('pid'))
                success, msg = collector.kill_process(pid)
                status_code = 200 if success else 400
                self.send_json({"success": success, "message": msg}, status=status_code)
            except Exception as e:
                self.send_json({"success": False, "message": str(e)}, status=400)
        else:
            self.send_error(404, "Endpoint not found")

    def send_json(self, data, status=200):
        content = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def handle_sse(self, params):
        interval = float(params.get("interval", ["1.0"])[0])
        interval = max(0.2, min(interval, 10.0))

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            while True:
                snapshot = collector.get_snapshot()
                payload = f"data: {json.dumps(snapshot)}\n\n"
                self.wfile.write(payload.encode('utf-8'))
                self.wfile.flush()
                time.sleep(interval)
        except (BrokenPipeError, ConnectionResetError, socket.error):
            pass

def run_server(port=8080):
    host = "127.0.0.1"
    while port < 8200:
        try:
            server = ThreadedHTTPServer((host, port), MonitorRequestHandler)
            print(f"[SYS] System Monitor Server running at http://localhost:{port}")
            print(f"[SYS] Press Ctrl+C to stop.")
            server.serve_forever()
            break
        except (OSError, PermissionError):
            port += 1

if __name__ == "__main__":
    port = 8080
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run_server(port)
