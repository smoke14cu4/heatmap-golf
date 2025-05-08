# Golf Pressure Mat Visualization & Analysis (heatmap-golf)

A static web application for **Bluetooth-based golf pressure mat visualization, swing recording, and Center of Pressure (CoP) analysis**. This app allows users to connect to a compatible BLE-enabled pressure sensor mat, visualize real-time pressure data, analyze swings, and interactively playback and review Center of Pressure metrics.

Older version with just heatmap and CoP vizualization, recording, and playback:

https://heatmap-golf.glitch.me/  


Latest version (up to date with this repo) with heatmap, CoP graph with center of mass axes, force graph, velocity graph, more calibration options, and more data filtering options, along with swing recording, and playback:

https://heatmap-golf-v2.glitch.me/

---

## Features

- **Bluetooth Connectivity:**  
  - Scan for and connect to supported BLE (Bluetooth Low Energy) pressure mats (Nordic UART or Microchip UART).
  - Live status updates and robust reconnection logic.

- **Real-Time Pressure Visualization:**  
  - Interactive heatmap display of pressure sensor readings.
  - Overlay grid and stance midpoints, customizable heatmap settings (radius, blur, opacity, min/max values).

- **CoP (Center of Pressure) & Force Analysis:**  
  - Real-time and recorded CoP path graphing (CoM axes & delta mode).
  - Live velocity and ground reaction force graphs (with configurable smoothing).
  - Toe/heel and left/right foot pressure distribution breakdown.

- **Swing Recording and Playback:**  
  - Triggered recording based on CoP movement or fixed duration.
  - Review recorded swings with full playback controls (play, pause, frame-by-frame, speed adjustment, skip to start/end).
  - CoP statistics: path length, speed (avg/max/lateral/heel-toe), distances, total time, and more.

- **Calibration & Settings:**  
  - Stance calibration (to define left/right and toe/heel boundaries) and weight calibration (static reference for force normalization).
  - Fine-grained control over mat dimensions, sensor grid, axis inversion, smoothing/filtering (EMA, median), and thresholds.
  - Settings panels for general, mat, and debug options.

- **Debug & Raw Data Panels:**  
  - Toggleable debug output and connection information.
  - Raw sensor data display for development and troubleshooting.

- **Responsive UI:**  
  - Modern, clean, responsive design for desktops and tablets.
  - Overlayed graph legends, titles, and flexible layout.

---

## Getting Started

### 1. Requirements

- **Hardware:**  
  - A BLE-enabled pressure mat compatible with Nordic UART or Microchip UART services.
- **Software:**  
  - A modern web browser supporting the [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) (e.g., Chrome, Edge).

### 2. Usage

1. **Clone or Download the Repo:**
    ```bash
    git clone https://github.com/smoke14cu4/heatmap-golf.git
    cd heatmap-golf
    ```

2. **Open the App:**  
   - Simply open `index.html` in your browser (no build step or server required).

3. **Connect to Your Mat:**
   - Click "Scan for Devices" and select your BLE pressure mat.
   - The app will display real-time data upon successful connection.

4. **Calibrate (Recommended):**
   - Use the "Calibrate Stance Position" and "Calibrate Weight" buttons to improve split accuracy.
   - Adjust mat size and sensor grid parameters if needed in "Mat Size and Orientation Settings".

5. **Record and Analyze Swings:**
   - Hit "Ready to Start Swing" and follow the countdown.
   - Post-swing, use playback controls and review CoP statistics.

---

## File Structure

- `index.html` — Main HTML with structure for controls, settings, graphs, and heatmap.
- `script.js` —  
    - **App logic:** Bluetooth handling, data parsing, CoP/force/velocity calculations, visualization (Plotly, heatmap.js), calibration routines, playback, and UI state management.
    - **Key Classes:**  
      - `PressureSensorApp` (main), `BluetoothManager`, `DataProcessor`, `Visualizer`, `RecordingManager`, `PlaybackManager`, `Logger`
- `style.css` — Responsive and modern UI styles for all panels, controls, overlays, and graphs.
- `heatmap.js` — [External library](https://www.patrick-wied.at/static/heatmapjs/) for heatmap rendering (loaded via `<script>`).
- `README.md` — (This file) Documentation and usage instructions.

---

## Configuration & Customization

- **Settings:**  
  - All major parameters (mat size, sensor count, inversion, smoothing filter, thresholds, durations, heatmap appearance) can be configured via the UI.
- **Analytics:**  
  - Google Analytics tracking is included (can be removed if not needed).

---

## Supported BLE Pressure Mat Protocols

- **Nordic UART Service:**  
  - UUID: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- **Microchip UART Service:**  
  - UUID: `49535343-fe7d-4ae5-8fa9-9fafd205e455`

Sensor data frames should be sent as text lines with JSON-like arrays/objects (see `script.js` for full parsing logic).

---

## Advanced Features

- **CoP Smoothing:**  
  - EMA (Exponential Moving Average) and Median filter options for CoP velocity.
- **Split Modes:**  
  - Stance-calibrated or per-frame left/right and toe/heel splits.
- **Debug Tools:**  
  - Toggle debug output and connection logs for troubleshooting BLE and sensor data.

---

## Screenshots

> _You can add screenshots here for the UI, heatmap, graphs, and swing analysis._

---

## Credits

- **Author:** [smoke14cu4](https://github.com/smoke14cu4)
- **Heatmap Rendering:** [heatmap.js](https://www.patrick-wied.at/static/heatmapjs/)
- **Graphing:** [Plotly.js](https://plotly.com/javascript/)

---

## License

> _Add your license here if desired (MIT, GPL, etc)._

---

## Contributing

Pull requests, bug reports, and suggestions are welcome!

---

## Troubleshooting

- Make sure your browser supports the Web Bluetooth API and is run over `https://` (or `localhost`).
- Ensure your BLE mat is powered and in range.
- Check the "Debug Information" panel for connection and data logs.

---

## Future Improvements

- Data export/import for swings.
- More advanced analytics (balance, tempo, stance tips).
- Mobile device support (subject to Bluetooth API availability).

---

## Disclaimer

This is a research/enthusiast project for golf swing analysis.  
No guarantees are made as to its accuracy or fitness for any particular purpose.
