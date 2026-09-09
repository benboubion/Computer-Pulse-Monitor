# Setup & Installation Guide

## Prerequisites

Before you begin, ensure you have the following installed on your system:
* **Python** (Version 3.8 or higher)
* **Git** (For cloning the repository)

---

## Step 1: Clone the Repository

Open your terminal (such as Git Bash, Terminal, or Command Prompt) and clone the repository to your local machine:

```bash
git clone https://github.com/benboubion/Computer-Pulse-Monitor.git
cd Computer-Pulse-Monitor/pulse-monitor
```

*(Alternatively, you can click the green **Code** button on the main GitHub repository page, select **Download ZIP**, extract the folder, and navigate into `pulse-monitor/` via your terminal).*

---

## Step 2: Set Up a Virtual Environment

It is best practice to run Python applications inside an isolated virtual environment to avoid dependency conflicts, however it is not required.

* **On macOS / Linux:**
  ```bash
  python3 -m venv venv
  source venv/bin/activate
  ```

* **On Windows (Command Prompt / PowerShell / Git Bash):**
  ```bash
  python -m venv venv
  venv\Scripts\activate
  ```

---

## Step 3: Install Dependencies

Once your virtual environment is active, install the required packages using `pip`:

```bash
pip install -r requirements.txt
```

---

## Step 4: Run the Application

Start the backend server by running the main application script:

```bash
python app.py
```

You should see output in your terminal indicating that the server is running (e.g., listening on `http://127.0.0.1:5000`).

---

## Step 5: Access the Dashboard

Open your web browser and navigate to the local server address provided by the application:

You will now see your live system telemetry, CPU/memory metrics, and performance pipeline visualizer running in real time.

---

## Troubleshooting

* **Missing Modules:** If you encounter a `ModuleNotFoundError`, make sure your virtual environment is activated and that you ran `pip install -r requirements.txt`.
* **Port Already in Use:** If port `5000` is occupied by another service, open `app.py` and modify the port configuration variable at the bottom of the script.
