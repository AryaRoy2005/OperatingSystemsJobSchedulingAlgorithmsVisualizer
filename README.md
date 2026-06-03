# CPU Scheduling Algorithm Visualizer

A browser-based visualizer for common CPU scheduling algorithms. Enter processes, choose an algorithm, and watch the Gantt chart, ready queue, and per-process metrics update step by step.

## Features
- Interactive simulation with start, pause, and jump-to-end controls
- Gantt chart with time axis and per-tick execution
- Ready queue visualization
- Results table with CT, TAT, WT, and RT
- Average turnaround and waiting time
- Supports priority and round-robin options

## Supported Algorithms
- FCFS (First Come First Serve)
- SJF (Shortest Job First, non-preemptive)
- LJF (Longest Job First, non-preemptive)
- SRTF (Shortest Remaining Time First, preemptive)
- LRTF (Longest Remaining Time First, preemptive)
- Priority (Non-Preemptive)
- Priority (Preemptive)
- RR (Round Robin)
- HRRN (Highest Response Ratio Next)

## How To Run
1. Clone or download this repository.
2. Open `index.html` in a browser.
3. Add processes, select an algorithm, and click **Visualize**.

## Usage Notes
- Round Robin requires a valid time quantum.
- Priority algorithms use lower numbers as higher priority.
- Data is passed to the visualizer page via `localStorage`.

## Project Structure
- `index.html`: Input form and algorithm selection
- `script.js`: Input handling and data validation
- `visualizer.html`: Visualization layout
- `visualizer.js`: Scheduling logic and animation
- `style.css`: Styling

## Tech Stack
- HTML, CSS, JavaScript (no backend)
