document.addEventListener('DOMContentLoaded', () => {
    const algorithmSelector = document.getElementById('algorithm-selector');
    const processTableBody = document.getElementById('process-table-body');
    const addProcessBtn = document.getElementById('add-process-btn');
    const visualizeBtn = document.getElementById('visualize-btn');
    const timeQuantumInput = document.getElementById('rr-options');
    const priorityHeader = document.getElementById('priority-header');

    let processCounter = 0;

    const addProcessRow = () => {
        processCounter++;
        const row = document.createElement('tr');
        row.setAttribute('data-id', processCounter);

        const isPriority = algorithmSelector.value.includes('PRIO');

        row.innerHTML = `
            <td><input type="text" class="process-id" value="P${processCounter}"></td>
            <td><input type="number" class="arrival-time" value="0" min="0"></td>
            <td><input type="number" class="burst-time" value="1" min="1"></td>
            <td class="priority-col ${isPriority ? '' : 'hidden'}"><input type="number" class="priority-val" value="1" min="0"></td>
            <td><button class="remove-btn">✖</button></td>
        `;
        processTableBody.appendChild(row);

        row.querySelector('.remove-btn').addEventListener('click', () => {
            row.remove();
        });
    };

    const updateTableForAlgorithm = () => {
        const selectedAlgo = algorithmSelector.value;
        const priorityCols = document.querySelectorAll('.priority-col');

        if (selectedAlgo.includes('PRIO')) {
            priorityHeader.classList.remove('hidden');
            priorityCols.forEach(col => col.classList.remove('hidden'));
        } else {
            priorityHeader.classList.add('hidden');
            priorityCols.forEach(col => col.classList.add('hidden'));
        }

        if (selectedAlgo === 'RR') {
            timeQuantumInput.classList.remove('hidden');
        } else {
            timeQuantumInput.classList.add('hidden');
        }
    };

    addProcessBtn.addEventListener('click', addProcessRow);
    algorithmSelector.addEventListener('change', updateTableForAlgorithm);

    visualizeBtn.addEventListener('click', () => {
        const processes = [];
        const rows = processTableBody.querySelectorAll('tr');

        if (rows.length === 0) {
            alert('Please add at least one process.');
            return;
        }

        let isValid = true;
        rows.forEach(row => {
            const id = row.querySelector('.process-id').value.trim();
            const at = parseInt(row.querySelector('.arrival-time').value, 10);
            const bt = parseInt(row.querySelector('.burst-time').value, 10);
            const priority = parseInt(row.querySelector('.priority-val').value, 10);

            if (id === '' || isNaN(at) || isNaN(bt) || at < 0 || bt <= 0) {
                isValid = false;
            }

            processes.push({
                id,
                at,
                bt,
                priority: isNaN(priority) ? 0 : priority,
            });
        });
        
        if (!isValid) {
            alert('Please ensure all fields are filled correctly. Burst Time must be > 0.');
            return;
        }

        const algorithm = algorithmSelector.value;
        const timeQuantum = parseInt(document.getElementById('time-quantum').value, 10);
        
        if (algorithm === 'RR' && (isNaN(timeQuantum) || timeQuantum <= 0)) {
            alert('Please enter a valid Time Quantum for Round Robin.');
            return;
        }

        const data = {
            algorithm,
            timeQuantum,
            processes
        };

        // Store data in localStorage to pass to the visualizer page
        localStorage.setItem('schedulingData', JSON.stringify(data));
        
        // Redirect to the visualizer page
        window.location.href = 'visualizer.html';
    });
    
    // Initialize with a few default rows and set the correct table view
    addProcessRow();
    addProcessRow();
    addProcessRow();
    updateTableForAlgorithm();
});
