/**
 * PulseMonitor - Real-Time Dashboard Client Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let eventSource = null;
    let isStreamPaused = false;
    let currentInterval = '1.0';
    let processSortBy = 'cpu';
    let processSearchTerm = '';
    let pendingKillPid = null;
    let pendingKillName = '';

    const MAX_CHART_POINTS = 30;
    const timeLabels = [];
    const cpuDataHistory = [];
    const memDataHistory = [];
    const netRxHistory = [];
    const netTxHistory = [];

    // --- DOM Elements ---
    const sysHostname = document.getElementById('sysHostname');
    const sysOS = document.getElementById('sysOS');
    const sysUptime = document.getElementById('sysUptime');

    const streamStatus = document.getElementById('streamStatus');
    const intervalSelect = document.getElementById('intervalSelect');
    const toggleStreamBtn = document.getElementById('toggleStreamBtn');
    const pauseIcon = document.getElementById('pauseIcon');
    const playIcon = document.getElementById('playIcon');
    const toggleStreamText = document.getElementById('toggleStreamText');

    // KPI Gauges
    const cpuVal = document.getElementById('cpuVal');
    const cpuCoresCount = document.getElementById('cpuCoresCount');
    const cpuGaugeArc = document.getElementById('cpuGaugeArc');
    const cpuFreqBadge = document.getElementById('cpuFreqBadge');
    const cpuLogicalCount = document.getElementById('cpuLogicalCount');
    const cpuStatusTag = document.getElementById('cpuStatusTag');

    const memVal = document.getElementById('memVal');
    const memGaugeArc = document.getElementById('memGaugeArc');
    const memUsedBadge = document.getElementById('memUsedBadge');
    const memAvailSub = document.getElementById('memAvailSub');
    const swapText = document.getElementById('swapText');
    const swapFillBar = document.getElementById('swapFillBar');

    const netRxRate = document.getElementById('netRxRate');
    const netTxRate = document.getElementById('netTxRate');
    const netRxTotal = document.getElementById('netRxTotal');
    const netTxTotal = document.getElementById('netTxTotal');
    const netConnBadge = document.getElementById('netConnBadge');

    const diskReadWriteBadge = document.getElementById('diskReadWriteBadge');
    const diskPartitionsContainer = document.getElementById('diskPartitionsContainer');

    const cpuCoresGrid = document.getElementById('cpuCoresGrid');

    // Process Table
    const procCountBadge = document.getElementById('procCountBadge');
    const procSearchInput = document.getElementById('procSearchInput');
    const procSortSelect = document.getElementById('procSortSelect');
    const refreshProcBtn = document.getElementById('refreshProcBtn');
    const processTableBody = document.getElementById('processTableBody');

    // Footer
    const footOS = document.getElementById('footOS');
    const footArch = document.getElementById('footArch');
    const footPy = document.getElementById('footPy');

    // Modal
    const killModal = document.getElementById('killModal');
    const modalProcName = document.getElementById('modalProcName');
    const modalProcPid = document.getElementById('modalProcPid');
    const cancelKillBtn = document.getElementById('cancelKillBtn');
    const confirmKillBtn = document.getElementById('confirmKillBtn');

    // --- Helper Formatters ---
    function formatBytes(bytes, decimals = 1) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function formatRate(bytesPerSec) {
        if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + ' B/s';
        if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
        return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
    }

    function formatUptime(seconds) {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor((seconds % (3600 * 24)) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h ${m}m`;
        return `${h}h ${m}m`;
    }

    // --- Initialize Chart.js Instances ---
    const chartDefaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleFont: { family: 'Outfit', size: 13 },
                bodyFont: { family: 'Inter', size: 12 },
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                padding: 10
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(255, 255, 255, 0.04)' },
                ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 6 }
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.04)' },
                ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
            }
        }
    };

    const cpuMemChart = new Chart(document.getElementById('cpuMemChart'), {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [
                {
                    label: 'CPU Usage (%)',
                    data: cpuDataHistory,
                    borderColor: '#00f2fe',
                    backgroundColor: 'rgba(0, 242, 254, 0.08)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0
                },
                {
                    label: 'RAM Usage (%)',
                    data: memDataHistory,
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.08)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0
                }
            ]
        },
        options: {
            ...chartDefaultOptions,
            scales: {
                ...chartDefaultOptions.scales,
                y: { ...chartDefaultOptions.scales.y, min: 0, max: 100 }
            }
        }
    });

    const netChart = new Chart(document.getElementById('netChart'), {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [
                {
                    label: 'Download (KB/s)',
                    data: netRxHistory,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 0
                },
                {
                    label: 'Upload (KB/s)',
                    data: netTxHistory,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 0
                }
            ]
        },
        options: chartDefaultOptions
    });

    // --- Fetch Initial System Information ---
    async function fetchSystemInfo() {
        try {
            const res = await fetch('/api/system');
            if (!res.ok) return;
            const data = await res.json();
            
            sysHostname.textContent = data.hostname || 'LocalHost';
            sysOS.textContent = `${data.os} ${data.os_release}`;
            sysUptime.textContent = formatUptime(data.uptime_seconds);
            cpuLogicalCount.textContent = data.cpu_count_logical;
            cpuCoresCount.textContent = `${data.cpu_count_physical} Phys / ${data.cpu_count_logical} Log`;

            if (data.cpu_frequency && data.cpu_frequency.current) {
                cpuFreqBadge.textContent = `${data.cpu_frequency.current} MHz`;
            } else {
                cpuFreqBadge.textContent = `${data.cpu_count_logical} Cores`;
            }

            footOS.textContent = `${data.os} ${data.os_release} (${data.os_version})`;
            footArch.textContent = data.architecture;
            footPy.textContent = data.python_version;
        } catch (e) {
            console.error("System info fetch error:", e);
        }
    }

    // --- SSE Real-Time Data Pipeline ---
    function connectEventSource() {
        if (eventSource) {
            eventSource.close();
        }

        const url = `/api/stream?interval=${currentInterval}`;
        eventSource = new EventSource(url);

        eventSource.onopen = () => {
            streamStatus.innerHTML = `
                <span class="status-dot green"></span>
                <span class="status-text">LIVE SSE</span>
            `;
        };

        eventSource.onmessage = (event) => {
            if (isStreamPaused) return;
            try {
                const data = JSON.parse(event.data);
                updateMetricsUI(data);
            } catch (e) {
                console.error("JSON parse error from stream:", e);
            }
        };

        eventSource.onerror = () => {
            streamStatus.innerHTML = `
                <span class="status-dot red"></span>
                <span class="status-text">RECONNECTING...</span>
            `;
            eventSource.close();
            setTimeout(connectEventSource, 3000);
        };
    }

    // --- Update Metrics Dashboard UI ---
    function updateMetricsUI(data) {
        const timeStr = new Date(data.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // 1. CPU
        const cpuPct = data.cpu.overall;
        cpuVal.textContent = `${cpuPct.toFixed(1)}%`;
        const cpuDash = 314.15 * (1 - cpuPct / 100);
        cpuGaugeArc.style.strokeDashoffset = cpuDash;

        if (cpuPct > 85) {
            cpuStatusTag.textContent = 'High Load';
            cpuStatusTag.className = 'text-danger';
        } else if (cpuPct > 50) {
            cpuStatusTag.textContent = 'Moderate';
            cpuStatusTag.className = 'text-amber';
        } else {
            cpuStatusTag.textContent = 'Optimal';
            cpuStatusTag.className = 'text-cyan';
        }

        // CPU Cores Grid
        updateCoresGrid(data.cpu.cores);

        // 2. Memory
        const memPct = data.memory.percent;
        memVal.textContent = `${memPct.toFixed(1)}%`;
        const memDash = 314.15 * (1 - memPct / 100);
        memGaugeArc.style.strokeDashoffset = memDash;

        const usedGB = (data.memory.used / (1024 ** 3)).toFixed(1);
        const totalGB = (data.memory.total / (1024 ** 3)).toFixed(1);
        const availGB = (data.memory.available / (1024 ** 3)).toFixed(1);

        memUsedBadge.textContent = `${usedGB} / ${totalGB} GB`;
        memAvailSub.textContent = `${availGB} GB Available`;

        swapText.textContent = `${formatBytes(data.memory.swap_used)} (${data.memory.swap_percent.toFixed(0)}%)`;
        swapFillBar.style.width = `${Math.min(data.memory.swap_percent, 100)}%`;

        // 3. Network
        netRxRate.textContent = formatRate(data.network.bytes_recv_sec);
        netTxRate.textContent = formatRate(data.network.bytes_sent_sec);
        netRxTotal.textContent = `Total RX: ${formatBytes(data.network.total_recv)}`;
        netTxTotal.textContent = `Total TX: ${formatBytes(data.network.total_sent)}`;
        netConnBadge.textContent = `${data.network.active_connections} Connections`;

        // 4. Disk
        diskReadWriteBadge.textContent = `R: ${formatRate(data.disk.read_bytes_sec)} | W: ${formatRate(data.disk.write_bytes_sec)}`;
        updatePartitionsUI(data.disk.partitions);

        // 5. Update Charts
        if (timeLabels.length >= MAX_CHART_POINTS) {
            timeLabels.shift();
            cpuDataHistory.shift();
            memDataHistory.shift();
            netRxHistory.shift();
            netTxHistory.shift();
        }

        timeLabels.push(timeStr);
        cpuDataHistory.push(cpuPct);
        memDataHistory.push(memPct);
        netRxHistory.push((data.network.bytes_recv_sec / 1024).toFixed(1));
        netTxHistory.push((data.network.bytes_sent_sec / 1024).toFixed(1));

        cpuMemChart.update();
        netChart.update();

        // 6. Update Top Process Table
        if (data.top_processes) {
            renderProcessTable(data.top_processes);
        }
    }

    // --- Render Cores Load Grid ---
    function updateCoresGrid(cores) {
        if (!cores || cores.length === 0) return;

        if (cpuCoresGrid.children.length !== cores.length) {
            cpuCoresGrid.innerHTML = '';
            cores.forEach((_, idx) => {
                const item = document.createElement('div');
                item.className = 'core-item';
                item.innerHTML = `
                    <div class="core-header">
                        <span>Core ${idx}</span>
                        <span id="coreVal_${idx}">0%</span>
                    </div>
                    <div class="core-bar-track">
                        <div class="core-bar-fill" id="coreFill_${idx}" style="width: 0%;"></div>
                    </div>
                `;
                cpuCoresGrid.appendChild(item);
            });
        }

        cores.forEach((val, idx) => {
            const valEl = document.getElementById(`coreVal_${idx}`);
            const fillEl = document.getElementById(`coreFill_${idx}`);
            if (valEl && fillEl) {
                valEl.textContent = `${val.toFixed(0)}%`;
                fillEl.style.width = `${val}%`;
                if (val > 80) {
                    fillEl.classList.add('high');
                } else {
                    fillEl.classList.remove('high');
                }
            }
        });
    }

    // --- Render Disk Partitions ---
    function updatePartitionsUI(partitions) {
        if (!partitions) return;
        diskPartitionsContainer.innerHTML = '';
        partitions.forEach(part => {
            const usedGB = (part.used / (1024 ** 3)).toFixed(1);
            const totalGB = (part.total / (1024 ** 3)).toFixed(1);

            const div = document.createElement('div');
            div.className = 'partition-item';
            div.innerHTML = `
                <div class="partition-meta">
                    <span class="partition-name">${escapeHtml(part.device)} (${escapeHtml(part.mountpoint)})</span>
                    <span class="partition-usage">${usedGB} / ${totalGB} GB (${part.percent}%)</span>
                </div>
                <div class="linear-track">
                    <div class="linear-fill purple-fill" style="width: ${part.percent}%;"></div>
                </div>
            `;
            diskPartitionsContainer.appendChild(div);
        });
    }

    // --- Process Table Logic ---
    async function fetchProcessList() {
        try {
            const search = encodeURIComponent(processSearchTerm);
            const res = await fetch(`/api/processes?sort=${processSortBy}&search=${search}&limit=60`);
            if (!res.ok) return;
            const procs = await res.json();
            renderProcessTable(procs);
        } catch (e) {
            console.error("Error fetching processes:", e);
        }
    }

    function renderProcessTable(procs) {
        let filtered = procs;
        if (processSearchTerm) {
            const term = processSearchTerm.toLowerCase();
            filtered = procs.filter(p => p.name.toLowerCase().includes(term) || p.pid.toString().includes(term));
        }

        procCountBadge.textContent = `${filtered.length} Processes`;

        if (filtered.length === 0) {
            processTableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="table-loading">No matching processes found.</td>
                </tr>
            `;
            return;
        }

        processTableBody.innerHTML = filtered.map(p => {
            const statusClass = p.status === 'running' ? 'status-running' : 'status-sleeping';
            return `
                <tr>
                    <td class="pid-cell">${p.pid}</td>
                    <td class="name-cell">${escapeHtml(p.name)}</td>
                    <td class="text-muted">${escapeHtml(p.username)}</td>
                    <td><span class="status-badge ${statusClass}">${escapeHtml(p.status)}</span></td>
                    <td class="text-right font-mono">${p.cpu_percent.toFixed(1)}%</td>
                    <td class="text-right font-mono">${p.memory_mb.toFixed(1)} MB</td>
                    <td class="text-center font-mono">${p.threads}</td>
                    <td class="text-center">
                        <button class="btn btn-danger kill-btn" data-pid="${p.pid}" data-name="${escapeHtml(p.name)}">Kill</button>
                    </td>
                </tr>
            `;
        }).join('');

        document.querySelectorAll('.kill-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pid = parseInt(e.currentTarget.getAttribute('data-pid'));
                const name = e.currentTarget.getAttribute('data-name');
                openKillModal(pid, name);
            });
        });
    }

    function escapeHtml(str) {
        return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // --- Modal Handlers ---
    function openKillModal(pid, name) {
        pendingKillPid = pid;
        pendingKillName = name;
        modalProcPid.textContent = pid;
        modalProcName.textContent = name;
        killModal.classList.remove('hidden');
    }

    function closeKillModal() {
        pendingKillPid = null;
        pendingKillName = '';
        killModal.classList.add('hidden');
    }

    async function executeKillProcess() {
        if (!pendingKillPid) return;
        try {
            const res = await fetch('/api/process/kill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pid: pendingKillPid })
            });
            const result = await res.json();
            closeKillModal();
            fetchProcessList();
        } catch (e) {
            alert('Failed to kill process: ' + e.message);
            closeKillModal();
        }
    }

    // --- Event Listeners ---
    intervalSelect.addEventListener('change', (e) => {
        currentInterval = e.target.value;
        connectEventSource();
    });

    toggleStreamBtn.addEventListener('click', () => {
        isStreamPaused = !isStreamPaused;
        if (isStreamPaused) {
            pauseIcon.classList.add('hidden');
            playIcon.classList.remove('hidden');
            toggleStreamText.textContent = 'Resume';
            streamStatus.innerHTML = `
                <span class="status-dot red"></span>
                <span class="status-text">PAUSED</span>
            `;
        } else {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
            toggleStreamText.textContent = 'Pause';
            streamStatus.innerHTML = `
                <span class="status-dot green"></span>
                <span class="status-text">LIVE SSE</span>
            `;
        }
    });

    procSearchInput.addEventListener('input', (e) => {
        processSearchTerm = e.target.value;
        fetchProcessList();
    });

    procSortSelect.addEventListener('change', (e) => {
        processSortBy = e.target.value;
        fetchProcessList();
    });

    refreshProcBtn.addEventListener('click', () => {
        fetchProcessList();
    });

    document.querySelectorAll('.process-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const sortKey = th.getAttribute('data-sort');
            processSortBy = sortKey;
            procSortSelect.value = sortKey;
            fetchProcessList();
        });
    });

    cancelKillBtn.addEventListener('click', closeKillModal);
    confirmKillBtn.addEventListener('click', executeKillProcess);
    killModal.addEventListener('click', (e) => {
        if (e.target === killModal) closeKillModal();
    });

    // Boot Up
    fetchSystemInfo();
    connectEventSource();
});
