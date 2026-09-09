import sys
import subprocess
import time
import webbrowser
import socket

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def main():
    print("==================================================")
    print("  Local System Resource & Process Monitor Launch  ")
    print("==================================================")

    # Check dependencies
    try:
        import psutil
    except ImportError:
        print("[!] 'psutil' package is missing. Installing...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil"])
        print("[+] 'psutil' installed successfully.")

    port = 8080
    while is_port_in_use(port):
        port += 1

    url = f"http://localhost:{port}"
    print(f"[+] Starting backend server on {url}...")
    
    def open_browser():
        time.sleep(1.2)
        print(f"[+] Opening Web UI in default browser: {url}")
        webbrowser.open(url)

    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    from app import run_server
    run_server(port)

if __name__ == "__main__":
    main()
