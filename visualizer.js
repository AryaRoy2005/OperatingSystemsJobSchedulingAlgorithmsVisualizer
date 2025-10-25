document.addEventListener('DOMContentLoaded', () => {
    // --- Data Retrieval ---
    const storedData = localStorage.getItem('schedulingData');
    if (!storedData) {
        alert("No data found. Please go back and input processes.");
        window.location.href = 'index.html';
        return;
    }
    const { algorithm, timeQuantum, processes: initialProcesses } = JSON.parse(storedData);

    // --- Global State for Visualization ---
    let currentTime = 0;
    let simulationInterval = null;
    let isRunning = false;
    let computedGantt = [];
    let finalProcessStates = [];
    let totalExecutionTime = 0;
    
    // Assign unique colors to processes for consistency
    const processColors = {};
    const colorPalette = ['#8b0000', '#001f3f', '#2E8B57', '#4682B4', '#D2691E', '#6A5ACD', '#C71585', '#008080'];
    initialProcesses.forEach((p, i) => {
        processColors[p.id] = colorPalette[i % colorPalette.length];
    });


    // --- DOM Elements ---
    const algoTitle = document.getElementById('algo-title');
    const algoDesc = document.getElementById('algo-desc');
    const startBtn = document.getElementById('start-btn');
    const endBtn = document.getElementById('end-btn');
    const speedSlider = document.getElementById('speed-slider');
    const currentTimeEl = document.getElementById('current-time');
    const logMessageEl = document.getElementById('step-log-message');
    const ganttChartEl = document.getElementById('gantt-chart');
    const ganttLabelsEl = document.getElementById('gantt-labels');
    const readyQueueEl = document.getElementById('ready-queue');
    const resultsBody = document.getElementById('results-table-body');
    const resultsPriorityHeader = document.getElementById('results-priority-header');
    const avgTatEl = document.getElementById('avg-tat');
    const avgWtEl = document.getElementById('avg-wt');

    // --- Algorithm Definitions ---
    const ALGO_DEFS = {
        FCFS: "First Come, First Serve: Processes are executed in the order they arrive.",
        SJF: "Shortest Job First (Non-Preemptive): The waiting process with the smallest burst time is selected next.",
        LJF: "Longest Job First (Non-Preemptive): The waiting process with the largest burst time is selected next.",
        SRTF: "Shortest Remaining Time First (Preemptive): If a new process arrives with a shorter remaining time than the current process, the CPU is preempted.",
        LRTF: "Longest Remaining Time First (Preemptive): The process with the longest remaining burst time gets the CPU.",
        'PRIO-NP': "Priority (Non-Preemptive): The waiting process with the highest priority (lowest number) is selected next.",
        'PRIO-P': "Priority (Preemptive): If a new process arrives with a higher priority than the current process, the CPU is preempted.",
        RR: "Round Robin: Each process gets a small unit of CPU time (time quantum). If not finished, it's sent to the back of the ready queue.",
        HRRN: "Highest Response Ratio Next (Non-Preemptive): The waiting process with the highest response ratio ((W+B)/B) is selected.",
    };

    // --- Core Computation Engine (Runs Once) ---
    const computeSchedule = () => {
        let processes = JSON.parse(JSON.stringify(initialProcesses)); // Deep copy for simulation
        processes.forEach(p => {
            p.remaining_bt = p.bt;
            p.start_time = -1;
            p.completion_time = 0;
        });

        const ganttLog = [];
        let localTime = 0;
        let completedCount = 0;
        let rr_queue = [];
        let rr_last_check = -1;

        while (completedCount < processes.length) {
            let readyQueue = processes.filter(p => p.at <= localTime && p.remaining_bt > 0);
            let executingProcess = null;

            if (readyQueue.length === 0) {
                ganttLog.push({ id: 'Idle', start: localTime, end: localTime + 1 });
                localTime++;
                continue;
            }

            // --- Algorithm-specific process selection ---
            switch (algorithm) {
                case 'FCFS':
                case 'SJF':
                case 'LJF':
                case 'PRIO-NP':
                case 'HRRN':
                    // These are non-preemptive. If a process is running, let it finish.
                    const running = ganttLog.length > 0 && ganttLog[ganttLog.length-1].end > localTime && ganttLog[ganttLog.length-1].id !== 'Idle';
                    if (running) {
                        localTime++;
                        continue;
                    }
                    if (algorithm === 'FCFS') readyQueue.sort((a,b) => a.at - b.at);
                    if (algorithm === 'SJF') readyQueue.sort((a,b) => a.bt - b.bt || a.at - b.at);
                    if (algorithm === 'LJF') readyQueue.sort((a,b) => b.bt - a.bt || a.at - b.at);
                    if (algorithm === 'PRIO-NP') readyQueue.sort((a,b) => a.priority - b.priority || a.at - b.at);
                    if (algorithm === 'HRRN') {
                        readyQueue.forEach(p => p.rr = ((localTime - p.at) + p.bt) / p.bt);
                        readyQueue.sort((a,b) => b.rr - a.rr || a.at - b.at);
                    }
                    executingProcess = readyQueue[0];
                    break;
                case 'SRTF':
                    readyQueue.sort((a, b) => a.remaining_bt - b.remaining_bt || a.at - b.at);
                    executingProcess = readyQueue[0];
                    break;
                case 'LRTF':
                    readyQueue.sort((a, b) => b.remaining_bt - a.remaining_bt || a.at - b.at);
                    executingProcess = readyQueue[0];
                    break;
                case 'PRIO-P':
                    readyQueue.sort((a, b) => a.priority - b.priority || a.at - b.at);
                    executingProcess = readyQueue[0];
                    break;
                case 'RR':
                    // Add newly arrived processes to the RR queue
                    if(localTime > rr_last_check) {
                        const newArrivals = readyQueue.filter(p => !rr_queue.includes(p.id));
                        newArrivals.sort((a,b) => a.at - b.at);
                        newArrivals.forEach(p => rr_queue.push(p.id));
                    }
                    rr_last_check = localTime;

                    if (rr_queue.length > 0) {
                        const currentId = rr_queue[0];
                        executingProcess = processes.find(p => p.id === currentId);
                        const lastGantt = ganttLog[ganttLog.length-1];
                        // If current process just finished its time slice, move it to the back
                        if (lastGantt && lastGantt.id === currentId && (localTime - lastGantt.start) % timeQuantum === 0 && localTime !== lastGantt.start) {
                             rr_queue.shift();
                             rr_queue.push(currentId);
                             executingProcess = processes.find(p => p.id === rr_queue[0]);
                        }
                    }
                    break;
            }

            if (executingProcess) {
                if (executingProcess.start_time === -1) {
                    executingProcess.start_time = localTime;
                }
                ganttLog.push({ id: executingProcess.id, start: localTime, end: localTime + 1 });
                executingProcess.remaining_bt--;
                
                if (executingProcess.remaining_bt === 0) {
                    completedCount++;
                    executingProcess.completion_time = localTime + 1;
                    if(algorithm === 'RR') {
                        rr_queue = rr_queue.filter(id => id !== executingProcess.id);
                    }
                }
            }
            localTime++;
        }
        
        // Consolidate Gantt chart blocks
        const consolidatedGantt = [];
        if (ganttLog.length > 0) {
            consolidatedGantt.push(ganttLog[0]);
            for (let i = 1; i < ganttLog.length; i++) {
                let last = consolidatedGantt[consolidatedGantt.length - 1];
                if (ganttLog[i].id === last.id) {
                    last.end = ganttLog[i].end;
                } else {
                    consolidatedGantt.push(ganttLog[i]);
                }
            }
        }

        // Calculate final metrics
        processes.forEach(p => {
            p.turnaround_time = p.completion_time - p.at;
            p.waiting_time = p.turnaround_time - p.bt;
            p.response_time = p.start_time - p.at;
        });
        
        return { gantt: consolidatedGantt, processes, totalTime: localTime };
    };

    // --- Visualization Functions ---
    const initialize = () => {
        // Reset state
        if (simulationInterval) clearInterval(simulationInterval);
        currentTime = 0;
        isRunning = false;

        // Run computation
        const result = computeSchedule();
        computedGantt = result.gantt;
        finalProcessStates = result.processes;
        totalExecutionTime = result.totalTime;

        // Update UI
        algoTitle.textContent = `${algorithm}${algorithm === 'RR' ? ` (TQ=${timeQuantum})` : ''}`;
        algoDesc.textContent = ALGO_DEFS[algorithm];
        startBtn.textContent = 'Start';
        startBtn.disabled = false;
        endBtn.disabled = false;
        
        if (algorithm.includes('PRIO')) resultsPriorityHeader.classList.remove('hidden');

        // Reset display
        ganttChartEl.innerHTML = '';
        ganttLabelsEl.innerHTML = '';
        readyQueueEl.innerHTML = '';
        logMessageEl.textContent = 'Simulation has not started.';
        currentTimeEl.textContent = '0';
        avgTatEl.textContent = '0.00';
        avgWtEl.textContent = '0.00';
        populateResultsTable(true); // Populate with initial '-' values
        drawGanttAxis();
    };

    const drawGanttAxis = () => {
        ganttLabelsEl.innerHTML = '';
        for (let i = 0; i <= totalExecutionTime; i++) {
            if (i % (Math.ceil(totalExecutionTime/20)) === 0 || i === totalExecutionTime) { // Avoid cluttering
                const label = document.createElement('span');
                label.className = 'gantt-label';
                label.textContent = i;
                label.style.left = `${(i / totalExecutionTime) * 100}%`;
                ganttLabelsEl.appendChild(label);
            }
        }
    };

    const visualizationStep = () => {
        if (currentTime > totalExecutionTime) {
            finishSimulation();
            return;
        }

        currentTimeEl.textContent = currentTime;

        // Update Gantt Chart incrementally
        ganttChartEl.innerHTML = '';
        let currentTotalWidth = 0;
        computedGantt.forEach(bar => {
            if (bar.start < currentTime) {
                const barWidth = (Math.min(currentTime, bar.end) - bar.start);
                currentTotalWidth += barWidth;
                const barEl = document.createElement('div');
                barEl.className = 'gantt-bar';
                if (bar.id !== 'Idle') barEl.textContent = bar.id;
                barEl.style.width = `${(barWidth / totalExecutionTime) * 100}%`;
                barEl.style.backgroundColor = bar.id === 'Idle' ? '#ccc' : processColors[bar.id];
                ganttChartEl.appendChild(barEl);
            }
        });
        
        // Update Ready Queue & Log
        const currentGanttBlock = computedGantt.find(b => currentTime > b.start && currentTime <= b.end);
        const runningProcessId = currentGanttBlock && currentGanttBlock.id !== 'Idle' ? currentGanttBlock.id : null;

        if(runningProcessId) {
            logMessageEl.textContent = `Process ${runningProcessId} is executing.`;
        } else if (currentGanttBlock && currentGanttBlock.id === 'Idle') {
            logMessageEl.textContent = `CPU is idle.`;
        } else if (currentTime > 0) {
            logMessageEl.textContent = '...';
        }
        
        readyQueueEl.innerHTML = '';
        const readyProcesses = finalProcessStates.filter(p => p.at < currentTime && p.completion_time >= currentTime && p.id !== runningProcessId);
        readyProcesses.forEach(p => {
             const queueEl = document.createElement('div');
             queueEl.className = 'queue-process';
             queueEl.textContent = p.id;
             readyQueueEl.appendChild(queueEl);
        });

        currentTime++;
    };
    
    const renderFinalState = () => {
        if (simulationInterval) clearInterval(simulationInterval);
        isRunning = false;
        currentTime = totalExecutionTime;
        visualizationStep(); // Run one last step to draw the full chart
        populateResultsTable(false); // Populate with final values
        finishSimulation();
    };



    const populateResultsTable = (initial = false) => {
        resultsBody.innerHTML = '';
        const source = initial ? initialProcesses : finalProcessStates;
        source.sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
        source.forEach(p => {
            const row = document.createElement('tr');
            let priorityCell = algorithm.includes('PRIO') ? `<td>${p.priority}</td>` : '';
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
    };

    const finishSimulation = () => {
        if (simulationInterval) clearInterval(simulationInterval);
        isRunning = false;
        startBtn.textContent = 'Restart';
        startBtn.disabled = false;
        endBtn.disabled = true;
        logMessageEl.textContent = 'Simulation finished!';
        
        // Calculate averages if not already done
        if(avgTatEl.textContent === '0.00') {
            const totalTAT = finalProcessStates.reduce((acc, p) => acc + p.turnaround_time, 0);
            const totalWT = finalProcessStates.reduce((acc, p) => acc + p.waiting_time, 0);
            avgTatEl.textContent = (totalTAT / finalProcessStates.length).toFixed(2);
            avgWtEl.textContent = (totalWT / finalProcessStates.length).toFixed(2);
        }
        
        // Ensure final table is populated
        populateResultsTable(false);
    };

    // --- Event Handlers ---
    startBtn.addEventListener('click', () => {
        if (startBtn.textContent === 'Restart') {
            initialize();
            return;
        }
        
        if (isRunning) { // User wants to PAUSE
            clearInterval(simulationInterval);
            isRunning = false;
            startBtn.textContent = 'Play';
        } else { // User wants to PLAY or START for the first time
            if (startBtn.textContent === 'Start') {
                populateResultsTable(false); // Populate table with final results on first start
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

    // --- Initial Call ---
    initialize();
});