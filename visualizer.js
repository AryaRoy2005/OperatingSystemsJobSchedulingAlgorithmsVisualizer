document.addEventListener('DOMContentLoaded', () => {

    // =========================================================================
    // DATA RETRIEVAL & SETUP
    // =========================================================================

    const storedData = localStorage.getItem('schedulingData');
    if (!storedData) {
        alert("No data found. Please go back and input processes.");
        window.location.href = 'index.html';
        return;
    }
    const { algorithm, timeQuantum, processes: rawProcesses } = JSON.parse(storedData);

    const colorPalette = ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#7158E2', '#F78FB3'];
    const processColors = {};
    rawProcesses.forEach((p, i) => {
        processColors[p.id] = colorPalette[i % colorPalette.length];
    });

    // =========================================================================
    // SHARED UTILITIES
    // =========================================================================

    /**
     * Deep-copies and initialises process objects for use inside algorithm functions.
     * Every algorithm receives a fresh copy — no shared mutation between runs.
     */
    function prepareProcesses(rawList) {
        return JSON.parse(JSON.stringify(rawList)).map(p => ({
            ...p,
            remaining_bt: p.bt,
            start_time: -1,
            completion_time: 0,
        }));
    }

    /**
     * Merges adjacent same-id ticks in a raw gantt log into consolidated bars.
     * Input:  [{ id, start, end }, ...]  (one entry per tick)
     * Output: [{ id, start, end }, ...]  (merged consecutive runs)
     */
    function consolidateGantt(ganttLog) {
        if (ganttLog.length === 0) return [];
        const consolidated = [{ ...ganttLog[0] }];
        for (let i = 1; i < ganttLog.length; i++) {
            const last = consolidated[consolidated.length - 1];
            if (ganttLog[i].id === last.id) {
                last.end = ganttLog[i].end;
            } else {
                consolidated.push({ ...ganttLog[i] });
            }
        }
        return consolidated;
    }

    /**
     * Computes TAT, WT, and response time for each process after simulation.
     * Mutates the process objects in place.
     */
    function computeMetrics(processes) {
        processes.forEach(p => {
            p.turnaround_time = p.completion_time - p.at;
            p.waiting_time    = p.turnaround_time - p.bt;
            p.response_time   = p.start_time - p.at;
        });
    }

    /**
     * Handles idle ticks: if nothing is ready, burns one unit and logs Idle.
     * Returns true if an idle tick was emitted (caller should `continue`).
     */
    function handleIdle(processes, ganttLog, localTime) {
        const anyReady = processes.some(p => p.at <= localTime && p.remaining_bt > 0);
        if (!anyReady) {
            ganttLog.push({ id: 'Idle', start: localTime, end: localTime + 1 });
            return true;
        }
        return false;
    }

    /** Returns the subset of processes that have arrived and still have work left. */
    function getReadyQueue(processes, localTime) {
        return processes.filter(p => p.at <= localTime && p.remaining_bt > 0);
    }

    /** Records a tick of execution and updates the executing process. */
    function executeTick(process, ganttLog, localTime) {
        if (process.start_time === -1) process.start_time = localTime;
        ganttLog.push({ id: process.id, start: localTime, end: localTime + 1 });
        process.remaining_bt--;
    }

    // =========================================================================
    // SCHEDULING ALGORITHMS
    // Each function:
    //   - accepts a deep-copied, prepared process list (and optional params)
    //   - runs a tick-by-tick simulation
    //   - returns { gantt: consolidatedGantt[], processes: finalProcessStates[], totalTime }
    // =========================================================================

    function runFCFS(processes) {
        const ganttLog = [];
        let localTime = 0;
        let completedCount = 0;
        let currentProcessId = null;   // Fix 1: non-preemptive lock

        while (completedCount < processes.length) {
            if (handleIdle(processes, ganttLog, localTime)) { localTime++; continue; }

            // Only select a new process when the CPU is free
            if (!currentProcessId) {
                const ready = getReadyQueue(processes, localTime);
                ready.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
                currentProcessId = ready[0].id;
            }

            const proc = processes.find(p => p.id === currentProcessId);
            executeTick(proc, ganttLog, localTime);

            if (proc.remaining_bt === 0) {
                completedCount++;
                proc.completion_time = localTime + 1;
                currentProcessId = null;   // Release CPU
            }

            localTime++;
        }

        computeMetrics(processes);
        return { gantt: consolidateGantt(ganttLog), processes, totalTime: localTime };
    }

    function runSJF(processes) {
        const ganttLog = [];
        let localTime = 0;
        let completedCount = 0;
        let currentProcessId = null;   // Fix 1: non-preemptive lock

        while (completedCount < processes.length) {
            if (handleIdle(processes, ganttLog, localTime)) { localTime++; continue; }

            if (!currentProcessId) {
                const ready = getReadyQueue(processes, localTime);
                // Sort by original burst time (not remaining), then arrival time
                ready.sort((a, b) => a.bt - b.bt || a.at - b.at);
                currentProcessId = ready[0].id;
            }

            const proc = processes.find(p => p.id === currentProcessId);
            executeTick(proc, ganttLog, localTime);

            if (proc.remaining_bt === 0) {
                completedCount++;
                proc.completion_time = localTime + 1;
                currentProcessId = null;
            }

            localTime++;
        }

        computeMetrics(processes);
        return { gantt: consolidateGantt(ganttLog), processes, totalTime: localTime };
    }

    function runLJF(processes) {
        const ganttLog = [];
        let localTime = 0;
        let completedCount = 0;
        let currentProcessId = null;   // Fix 1: non-preemptive lock

        while (completedCount < processes.length) {
            if (handleIdle(processes, ganttLog, localTime)) { localTime++; continue; }

            if (!currentProcessId) {
                const ready = getReadyQueue(processes, localTime);
                // Sort by original burst time descending, then arrival time
                ready.sort((a, b) => b.bt - a.bt || a.at - b.at);
                currentProcessId = ready[0].id;
            }

            const proc = processes.find(p => p.id === currentProcessId);
            executeTick(proc, ganttLog, localTime);

            if (proc.remaining_bt === 0) {
                completedCount++;
                proc.completion_time = localTime + 1;
                currentProcessId = null;
            }

            localTime++;
        }

        computeMetrics(processes);
        return { gantt: consolidateGantt(ganttLog), processes, totalTime: localTime };
    }

    function runSRTF(processes) {
        const ganttLog = [];
        let localTime = 0;
        let completedCount = 0;

        while (completedCount < processes.length) {
            if (handleIdle(processes, ganttLog, localTime)) { localTime++; continue; }

            // Preemptive: re-evaluate every tick
            const ready = getReadyQueue(processes, localTime);
            ready.sort((a, b) => a.remaining_bt - b.remaining_bt || a.at - b.at || a.id.localeCompare(b.id));
            const proc = ready[0];

            executeTick(proc, ganttLog, localTime);

            if (proc.remaining_bt === 0) {
                completedCount++;
                proc.completion_time = localTime + 1;
            }

            localTime++;
        }

        computeMetrics(processes);
        return { gantt: consolidateGantt(ganttLog), processes, totalTime: localTime };
    }

    function runLRTF(processes) {
        const ganttLog = [];
        let localTime = 0;
        let completedCount = 0;

        while (completedCount < processes.length) {
            if (handleIdle(processes, ganttLog, localTime)) { localTime++; continue; }

            // Preemptive: re-evaluate every tick
            const ready = getReadyQueue(processes, localTime);
            ready.sort((a, b) => b.remaining_bt - a.remaining_bt || a.at - b.at);
            const proc = ready[0];

            executeTick(proc, ganttLog, localTime);

            if (proc.remaining_bt === 0) {
                completedCount++;
                proc.completion_time = localTime + 1;
            }

            localTime++;
        }

        computeMetrics(processes);
        return { gantt: consolidateGantt(ganttLog), processes, totalTime: localTime };
    }

    function runPrioNP(processes) {
        const ganttLog = [];
        let localTime = 0;
        let completedCount = 0;
        let currentProcessId = null;   // Fix 1: non-preemptive lock

        while (completedCount < processes.length) {
            if (handleIdle(processes, ganttLog, localTime)) { localTime++; continue; }

            if (!currentProcessId) {
                const ready = getReadyQueue(processes, localTime);
                // Lower number = higher priority
                ready.sort((a, b) => a.priority - b.priority || a.at - b.at);
                currentProcessId = ready[0].id;
            }

            const proc = processes.find(p => p.id === currentProcessId);
            executeTick(proc, ganttLog, localTime);

            if (proc.remaining_bt === 0) {
                completedCount++;
                proc.completion_time = localTime + 1;
                currentProcessId = null;
            }

            localTime++;
        }

        computeMetrics(processes);
        return { gantt: consolidateGantt(ganttLog), processes, totalTime: localTime };
    }

    function runPrioP(processes) {
        const ganttLog = [];
        let localTime = 0;
        let completedCount = 0;

        while (completedCount < processes.length) {
            if (handleIdle(processes, ganttLog, localTime)) { localTime++; continue; }

            // Preemptive: re-evaluate every tick
            const ready = getReadyQueue(processes, localTime);
            ready.sort((a, b) => a.priority - b.priority || a.at - b.at);
            const proc = ready[0];

            executeTick(proc, ganttLog, localTime);

            if (proc.remaining_bt === 0) {
                completedCount++;
                proc.completion_time = localTime + 1;
            }

            localTime++;
        }

        computeMetrics(processes);
        return { gantt: consolidateGantt(ganttLog), processes, totalTime: localTime };
    }

    function runHRRN(processes) {
        const ganttLog = [];
        let localTime = 0;
        let completedCount = 0;
        let currentProcessId = null;   // Fix 1: non-preemptive lock

        while (completedCount < processes.length) {
            if (handleIdle(processes, ganttLog, localTime)) { localTime++; continue; }

            if (!currentProcessId) {
                const ready = getReadyQueue(processes, localTime);
                // Response Ratio = (wait + bt) / bt — higher is better
                ready.sort((a, b) => {
                    const rrA = ((localTime - a.at) + a.bt) / a.bt;
                    const rrB = ((localTime - b.at) + b.bt) / b.bt;
                    return rrB - rrA || a.at - b.at;
                });
                currentProcessId = ready[0].id;
            }

            const proc = processes.find(p => p.id === currentProcessId);
            executeTick(proc, ganttLog, localTime);

            if (proc.remaining_bt === 0) {
                completedCount++;
                proc.completion_time = localTime + 1;
                currentProcessId = null;
            }

            localTime++;
        }

        computeMetrics(processes);
        return { gantt: consolidateGantt(ganttLog), processes, totalTime: localTime };
    }

    function runRR(processes, quantum) {
        const ganttLog = [];
        let localTime = 0;
        let completedCount = 0;
        const rrQueue = [];           // Ordered list of process IDs
        const enqueued = new Set();   // Tracks which IDs have ever been added
        let rr_quantum_remaining = quantum;   // Fix 2: countdown counter, not timestamp

        while (completedCount < processes.length) {
            // Enqueue newly arrived processes (maintain arrival order for ties)
            const newArrivals = processes
                .filter(p => p.at <= localTime && p.remaining_bt > 0 && !enqueued.has(p.id))
                .sort((a, b) => a.at - b.at);
            newArrivals.forEach(p => { rrQueue.push(p.id); enqueued.add(p.id); });

            if (rrQueue.length === 0) {
                ganttLog.push({ id: 'Idle', start: localTime, end: localTime + 1 });
                localTime++;
                rr_quantum_remaining = quantum;  // Reset for when something arrives
                continue;
            }

            // Fix 2: Check quantum expiry by counter, not timestamp
            if (rr_quantum_remaining <= 0) {
                const expiredId = rrQueue.shift();
                const expiredProc = processes.find(p => p.id === expiredId);
                // Only re-queue if the process still has work
                if (expiredProc.remaining_bt > 0) {
                    rrQueue.push(expiredId);
                }
                rr_quantum_remaining = quantum;
            }

            const currentId = rrQueue[0];
            const proc = processes.find(p => p.id === currentId);

            executeTick(proc, ganttLog, localTime);
            rr_quantum_remaining--;

            if (proc.remaining_bt === 0) {
                completedCount++;
                proc.completion_time = localTime + 1;
                rrQueue.shift();
                rr_quantum_remaining = quantum;  // Fresh slice for next process
            }

            localTime++;
        }

        computeMetrics(processes);
        return { gantt: consolidateGantt(ganttLog), processes, totalTime: localTime };
    }

    // =========================================================================
    // ALGORITHM ROUTER
    // Validates input, calls the right algorithm function, returns results.
    // =========================================================================

    function runAlgorithm(algo, rawList, quantum) {
        const processes = prepareProcesses(rawList);

        switch (algo) {
            case 'FCFS':    return runFCFS(processes);
            case 'SJF':     return runSJF(processes);
            case 'LJF':     return runLJF(processes);
            case 'SRTF':    return runSRTF(processes);
            case 'LRTF':    return runLRTF(processes);
            case 'PRIO-NP': return runPrioNP(processes);
            case 'PRIO-P':  return runPrioP(processes);
            case 'HRRN':    return runHRRN(processes);
            case 'RR':      return runRR(processes, quantum);
            default:
                throw new Error(`Unknown algorithm: ${algo}`);
        }
    }

    // =========================================================================
    // VISUALIZATION CONTROLLER
    // Owns all DOM updates and animation. Receives computed results from router.
    // =========================================================================

    const ALGO_DEFS = {
        FCFS:    "First Come, First Serve: Processes are executed in the order they arrive.",
        SJF:     "Shortest Job First (Non-Preemptive): The waiting process with the smallest burst time is selected next.",
        LJF:     "Longest Job First (Non-Preemptive): The waiting process with the largest burst time is selected next.",
        SRTF:    "Shortest Remaining Time First (Preemptive): If a new process arrives with a shorter remaining time than the current process, the CPU is preempted.",
        LRTF:    "Longest Remaining Time First (Preemptive): The process with the longest remaining burst time gets the CPU.",
        'PRIO-NP': "Priority (Non-Preemptive): The waiting process with the highest priority (lowest number) is selected next.",
        'PRIO-P':  "Priority (Preemptive): If a new process arrives with a higher priority than the current process, the CPU is preempted.",
        RR:      "Round Robin: Each process gets a small unit of CPU time (time quantum). If not finished, it's sent to the back of the ready queue.",
        HRRN:    "Highest Response Ratio Next (Non-Preemptive): The waiting process with the highest response ratio ((W+B)/B) is selected.",
    };

    // DOM refs
    const algoTitle              = document.getElementById('algo-title');
    const algoDesc               = document.getElementById('algo-desc');
    const startBtn               = document.getElementById('start-btn');
    const endBtn                 = document.getElementById('end-btn');
    const speedSlider            = document.getElementById('speed-slider');
    const currentTimeEl          = document.getElementById('current-time');
    const logMessageEl           = document.getElementById('step-log-message');
    const ganttChartEl           = document.getElementById('gantt-chart');
    const ganttLabelsEl          = document.getElementById('gantt-labels');
    const readyQueueEl           = document.getElementById('ready-queue');
    const resultsBody            = document.getElementById('results-table-body');
    const resultsPriorityHeader  = document.getElementById('results-priority-header');
    const avgTatEl               = document.getElementById('avg-tat');
    const avgWtEl                = document.getElementById('avg-wt');

    // Visualization state
    let currentTime       = 0;
    let simulationInterval = null;
    let isRunning         = false;
    let computedGantt     = [];
    let finalProcessStates = [];
    let totalExecutionTime = 0;

    // --- Gantt axis ---

    function drawGanttAxis() {
        ganttLabelsEl.innerHTML = '';
        const step = Math.ceil(totalExecutionTime / 20);
        for (let i = 0; i <= totalExecutionTime; i++) {
            if (i % step === 0 || i === totalExecutionTime) {
                const label = document.createElement('span');
                label.className = 'gantt-label';
                label.textContent = i;
                label.style.left = `${(i / totalExecutionTime) * 100}%`;
                ganttLabelsEl.appendChild(label);
            }
        }
    }

    // --- Results table ---

    function populateResultsTable(initial = false) {
        resultsBody.innerHTML = '';
        const source = initial ? rawProcesses : finalProcessStates;
        [...source]
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
            .forEach(p => {
                const row = document.createElement('tr');
                const priorityCell = algorithm.includes('PRIO') ? `<td>${p.priority}</td>` : '';
                row.innerHTML = `
                    <td>${p.id}</td>
                    <td>${p.at}</td>
                    <td>${p.bt}</td>
                    ${priorityCell}
                    <td>${initial ? '-' : p.completion_time}</td>
                    <td>${initial ? '-' : p.turnaround_time}</td>
                    <td>${initial ? '-' : p.waiting_time}</td>
                    <td>${initial ? '-' : p.response_time}</td>
                `;
                resultsBody.appendChild(row);
            });
    }

    // --- Per-tick visualization step ---

    function visualizationStep() {
        // Fix 4: >= instead of > — prevents a redundant extra tick
        if (currentTime >= totalExecutionTime) {
            finishSimulation();
            return;
        }

        currentTimeEl.textContent = currentTime;

        // Draw Gantt bars up to currentTime
        ganttChartEl.innerHTML = '';
        computedGantt.forEach(bar => {
            if (bar.start >= currentTime) return;
            const visibleWidth = Math.min(currentTime, bar.end) - bar.start;
            const barEl = document.createElement('div');
            barEl.className = 'gantt-bar';
            if (bar.id !== 'Idle') barEl.textContent = bar.id;
            barEl.style.width = `${(visibleWidth / totalExecutionTime) * 100}%`;
            barEl.style.backgroundColor = bar.id === 'Idle' ? '#333' : processColors[bar.id];
            ganttChartEl.appendChild(barEl);
        });

        // Determine what's running right now

        // const currentBlock = computedGantt.find(b => b.start < currentTime && b.end >= currentTime);
        const currentBlock = computedGantt.find(b => currentTime >= b.start && currentTime < b.end);
        //Maybe 

        const runningProcessId = (currentBlock && currentBlock.id !== 'Idle') ? currentBlock.id : null;

        // Log message
        if (runningProcessId) {
            logMessageEl.textContent = `Process ${runningProcessId} is executing.`;
        } else if (currentBlock && currentBlock.id === 'Idle') {
            logMessageEl.textContent = `CPU is idle.`;
        } else if (currentTime > 0) {
            logMessageEl.textContent = '...';
        }

        // Fix 3: Ready queue = arrived, not yet finished, not currently running
        readyQueueEl.innerHTML = '';
        const readyProcesses = finalProcessStates.filter(p =>
            p.at <= currentTime &&
            p.completion_time > currentTime &&
            p.id !== runningProcessId
        );
        readyProcesses.forEach(p => {
            const el = document.createElement('div');
            el.className = 'queue-process';
            el.textContent = p.id;
            readyQueueEl.appendChild(el);
        });

        if (isRunning) currentTime++;
    }

    // --- Finish & summary ---

    //Maybe
    function renderFullGantt() {
        ganttChartEl.innerHTML = '';

        computedGantt.forEach(bar => {
            const barWidth = bar.end - bar.start;

            const barEl = document.createElement('div');
            barEl.className = 'gantt-bar';

            if (bar.id !== 'Idle')
                barEl.textContent = bar.id;

            barEl.style.width =
                `${(barWidth / totalExecutionTime) * 100}%`;

            barEl.style.backgroundColor =
                bar.id === 'Idle'
                    ? '#333'
                    : processColors[bar.id];

            ganttChartEl.appendChild(barEl);
        });
    }
    //Maybe end

    function finishSimulation() {

        if (simulationInterval) clearInterval(simulationInterval);

        //Maybe
        currentTime = totalExecutionTime;
        currentTimeEl.textContent = totalExecutionTime;

        renderFullGantt();
        //Maybe end

        isRunning = false;
        startBtn.textContent = 'Restart';
        startBtn.disabled = false;
        endBtn.disabled = true;
        logMessageEl.textContent = 'Simulation finished!';

        // Only compute averages once
        if (avgTatEl.textContent === '0.00') {
            const totalTAT = finalProcessStates.reduce((acc, p) => acc + p.turnaround_time, 0);
            const totalWT  = finalProcessStates.reduce((acc, p) => acc + p.waiting_time, 0);
            avgTatEl.textContent = (totalTAT / finalProcessStates.length).toFixed(2);
            avgWtEl.textContent  = (totalWT  / finalProcessStates.length).toFixed(2);
        }

        populateResultsTable(false);
    }

    // --- Jump to end ---

    function renderFinalState() {
        if (simulationInterval) clearInterval(simulationInterval);
        isRunning = false;
        currentTime = totalExecutionTime;
        visualizationStep();
        finishSimulation();
    }

    // --- Initialize / reset ---

    function initialize() {
        if (simulationInterval) clearInterval(simulationInterval);
        currentTime = 0;
        isRunning = false;

        // Run the computation — the only call that feeds all visualization
        const result = runAlgorithm(algorithm, rawProcesses, timeQuantum);
        computedGantt      = result.gantt;
        finalProcessStates = result.processes;
        totalExecutionTime = result.totalTime;

        algoTitle.textContent = `${algorithm}${algorithm === 'RR' ? ` (TQ=${timeQuantum})` : ''}`;
        algoDesc.textContent  = ALGO_DEFS[algorithm];
        startBtn.textContent  = 'Start';
        startBtn.disabled     = false;
        endBtn.disabled       = false;

        if (algorithm.includes('PRIO')) resultsPriorityHeader.classList.remove('hidden');

        ganttChartEl.innerHTML  = '';
        ganttLabelsEl.innerHTML = '';
        readyQueueEl.innerHTML  = '';
        logMessageEl.textContent = 'Simulation has not started.';
        currentTimeEl.textContent = '0';
        avgTatEl.textContent = '0.00';
        avgWtEl.textContent  = '0.00';

        populateResultsTable(true);
        drawGanttAxis();
    }

    // =========================================================================
    // EVENT HANDLERS
    // =========================================================================

    startBtn.addEventListener('click', () => {
        if (startBtn.textContent === 'Restart') {
            initialize();
            return;
        }

        if (isRunning) {
            clearInterval(simulationInterval);
            isRunning = false;
            startBtn.textContent = 'Play';
        } else {
            if (startBtn.textContent === 'Start') {
                populateResultsTable(false);
            }
            isRunning = true;
            startBtn.textContent = 'Pause';
            endBtn.disabled = false;
            const intervalTime = 1000 / parseFloat(speedSlider.value);
            simulationInterval = setInterval(visualizationStep, intervalTime);
        }
    });

    endBtn.addEventListener('click', renderFinalState);

    speedSlider.addEventListener('input', () => {
        if (isRunning) {
            clearInterval(simulationInterval);
            const intervalTime = 1000 / parseFloat(speedSlider.value);
            simulationInterval = setInterval(visualizationStep, intervalTime);
        }
    });

    // =========================================================================
    // BOOT
    // =========================================================================

    initialize();
});
