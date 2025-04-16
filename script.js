/**
 * Pressure Sensor Visualization Application
 * Version: 2.0.0
 * Author: smoke14cu4
 * Last Updated: 2025-04-15
 */


let useLinearFit = true;  //set to true to use linear fit for weight calcs  //set to false to use power fit


// Configuration
const CONFIG = {
  
    DEBUG: {
        NONE: 0,
        BASIC: 1,
        WEIGHT_CALC: 4,
        PLAYBACK: 5,
        DATA_RECORD: 6,
        CALIBRATION: 7,
        level: 0 // Current debug level
    },
    
    BLE: {
        NORDIC_UART_SERVICE: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        NORDIC_UART_RX: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
        NORDIC_UART_TX: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
        MICROCHIP_UART_SERVICE: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        MICROCHIP_UART_TX: '49535343-1e4d-4bd9-ba61-23c647249616',
        MICROCHIP_UART_RX: '49535343-8841-43f4-a8d4-ecbe34729bb3',
        MAX_RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 1000
    },
    
    CALIBRATION: {
        DURATION: 8000,
        POWER_FIT_COEFFICIENT: 1390.2,
        POWER_FIT_EXPONENT: 0.1549
    },
    
    DEFAULTS: {
        clearTime: 5000,
        historyLength: 1,
        radius: 80,          // Increased from 40 to create larger, more blended points
        blur: 0.95,          // Adjusted for better blending
        maxOpacity: 0.8,      // Increased for better visibility
        minOpacity: 0.02,    // Increased to keep points visible longer  
        maxValue: 2000,
        minValue: 200,
        copHistoryLength: 60,  //60 is good for controller fps of 30, so it's 2 seconds of CoP history
        matWidth: 46,          // inches
        matHeight: 22,          // inches
        sensorsX: 23,            // number of sensors in X direction
        sensorsY: 11,            // number of sensors in Y direction
        invertX: true,
        invertY: false,
        copTriggerThreshold: 0.2,  //0.1 was not quite enough to prevent false triggers //0.2 seemed pretty good  // inches - minimum movement to start recording  //0.5 was too much (started recording late)  //try 0.1
        swingDuration: 3.0,        // seconds
        stopTriggerThreshold: 0.3,  // inches - minimum movement to stop recording
        playbackSpeed: 1.0,
        useFixedDurationStop: true,
        useMovementThresholdStop: false
    }
};

// Utility Functions
const Utils = {
  
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    calculateDistance(point1, point2) {
        return Math.sqrt(
            Math.pow(point2.x - point1.x, 2) + 
            Math.pow(point2.y - point1.y, 2)
        );
    },

    zValueToWeight(zValue) {
        return Math.pow(
            (zValue / CONFIG.CALIBRATION.POWER_FIT_COEFFICIENT),
            (1 / CONFIG.CALIBRATION.POWER_FIT_EXPONENT)
        );
    },
    
    formatTimestamp(ms) {
        return (ms / 1000).toFixed(3);
    }
};

// Logger Class
class Logger {
  
    static log(level, component, message, data = null) {
        if (level > CONFIG.DEBUG.level) return;
        
        const timestamp = new Date().toISOString();
        //const logMessage = `[${timestamp}][${component}] ${message}`;
        const logBase = `[${timestamp}][${component}] ${message}`;
        
        /*
        if (data) {
            console.group(logMessage);
            console.log('Data:', data);
            console.groupEnd();
        } else {
            console.log(logMessage);
        }
        */
      
        // Properly handle data logging
        if (data !== null && data !== undefined) {
            console.group(logBase);
            console.dir(data, { depth: null, colors: true });
            console.groupEnd();
        } else {
            console.log(logBase);
        }
        
        this.updateUI(message, level === CONFIG.DEBUG.ERROR);
        
    }
    
    static updateUI(message, isError = false) {
        const connectionInfo = document.getElementById('connection-info');
        if (!connectionInfo) return;
      
        const timestamp = new Date().toLocaleTimeString();
        const color = isError ? '#ff4444' : '#4CAF50';
        
        connectionInfo.innerHTML += `
            <div style="color: ${color}">
                [${timestamp}] ${message}
            </div>
        `;
        connectionInfo.scrollTop = connectionInfo.scrollHeight;
    }
}

// State Management
class AppState {
  
    constructor() {
        this.settings = { ...CONFIG.DEFAULTS };
        this.bluetooth = {
            device: null,
            characteristic: null,
            isConnected: false
        };
        this.visualization = {
            heatmapInstance: null,
            dataHistory: [],
            copHistory: [],
            velocityHistory: [],
            forceHistory: []
        };
        this.recording = {
            isRecording: false,
            recordingStarted: false,
            startTime: null,
            lastCopPosition: null,
            maxSpeedRecorded: 0,
            copPathData: [],
            playbackData: [],
            staticForceReference: null
        };
        this.calibration = {
            isCalibrating: false,
            startTime: null,
            data: null
        };
        this.dataBuffer = '';
        this.clearTimeout = null;
    }
    
    updateSetting(key, value) {
        this.settings[key] = value;
        Logger.log(CONFIG.DEBUG.BASIC, 'Settings', `Updated ${key} to ${value}`);
    }
}


// Data Processing Module
class DataProcessor {
  
    constructor(appState) {
        this.state = appState;
        Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Initialized with state:', {
            settings: this.state.settings
        });
    }
    
    processFrame(frame) {
        //if (!frame) return;
        
        //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Processing frame', frame);        
        Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Raw frame received:', frame);
      
        // Clear previous timeout
        if (this.state.clearTimeout) {
            clearTimeout(this.state.clearTimeout);
        }
        
      
        try {

            //const timestamp = Date.now();
            const { readings, cop } = this.parsePressureData(frame);          
            Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Parsed pressure data:', { readings, cop });
            //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Parsed data:', { readings, cop });

            //if (readings.length > 0) {
            if (readings && readings.length > 0) {
                const timestamp = Date.now();
              
                // Update histories
                this.updateDataHistory(readings, timestamp); 
                //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated data history');
                Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated data history:', {
                    historyLength: this.state.visualization.dataHistory.length,
                    latestReadings: readings
                });
              
                if (cop) {
                    this.updateCopHistory(cop, timestamp);
                    //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated CoP history');
                    Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated CoP history:', {
                        historyLength: this.state.visualization.copHistory.length,
                        latestCoP: cop
                    });
                  
                    // Calculate velocities
                    const velocities = this.calculateVelocities(cop, timestamp);
                    Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Calculated velocities:', velocities);
                  
                }

                // Process calibration data if needed
                if (this.state.calibration.isCalibrating) {
                    this.processCalibrationData(readings);
                }

                // Calculate forces and update histories
                const forces = this.calculateForces(readings);
                this.updateForceHistory(forces, timestamp);
                Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated force history');

                // Process CoP data if recording
                if (this.state.recording.isRecording) {
                    this.processCoPData(readings, cop, timestamp);                    
                }

                Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated histories', {
                    dataHistoryLength: this.state.visualization.dataHistory.length,
                    copHistoryLength: this.state.visualization.copHistory.length,
                    forceHistoryLength: this.state.visualization.forceHistory.length
                });
              
                // Update all visualizations
                this.updateVisualizations({ readings, cop, forces, timestamp });

                return { readings, cop, forces, timestamp };
            }

        } catch (error) {
            Logger.log(CONFIG.DEBUG.ERROR, 'DataProcessor', 'Error processing frame:', error);
        }
      
        return null;
      
      
      
        
        // Set clear timeout
        this.state.clearTimeout = setTimeout(() => {
            this.clearData();
        }, this.state.settings.clearTime);
      
    }
  
    updateVisualizations(data) {
        if (this.state.app && this.state.app.visualizer) {
            // Update heatmap
            this.state.app.visualizer.updateHeatmap(data);

            // Update CoP graph if we have CoP data
            if (data.cop) {
                this.state.app.visualizer.updateCoPGraph();
            }

            // Update velocity graph if we have velocity history
            if (this.state.visualization.velocityHistory.length > 0) {
                this.state.app.visualizer.updateVelocityGraph();
            }

            // Update force graph if we have force history
            if (this.state.visualization.forceHistory.length > 0) {
                this.state.app.visualizer.updateForceGraph();
            }
        }
    }
    
    parsePressureData(data) {
        try {
            if (data === '[]') return { readings: [], cop: null };
            
            // Clean data and extract CoP
            let cleanData = data.replace(/^\[{1,2}|\]{1,2}$/g, '');            
            let copData = null;
            
            if (cleanData.includes('cop:')) {
                const [pressureData, cop] = cleanData.split('cop:');
                cleanData = pressureData.replace(/\]$/, '');
                
                const copCoords = cop.replace(/{|}|\s/g, '').split(',').map(Number);
                copData = { x: copCoords[0], y: copCoords[1] };
            }
            
            // Parse pressure readings
            const readings = cleanData.includes('},{') ?
                cleanData.split('},{').map(this.parseReading) :
                [this.parseReading(cleanData)];
            
            return { readings, cop: copData };
            
        } catch (error) {
            Logger.log(CONFIG.DEBUG.ERROR, 'DataProcessor', 'Error parsing data', error);
            return { readings: [], cop: null };
        }
    }  //end of processFrame method of DataProcessor class
    
    parseReading(reading) {
        const values = reading.replace(/{|}/g, '').split(',').map(Number);
        return {
            x: values[0],
            y: values[1],
            value: values[2]
        };
    }
  
    processCalibrationData(readings) {
        if (!this.state.calibration.isCalibrating) return;

        if (!this.state.calibration.data) {
            this.state.calibration.data = {
                startTime: Date.now(),
                readings: []
            };
        }

        this.state.calibration.data.readings.push(readings);

        // Check if calibration duration has elapsed
        const elapsed = Date.now() - this.state.calibration.data.startTime;
        if (elapsed >= CONFIG.CALIBRATION.DURATION) {
            this.completeCalibration();
        }
    }
  
    completeCalibration() {
        this.state.calibration.isCalibrating = false;

        // Process collected readings to determine boundaries
        const allReadings = this.state.calibration.data.readings.flat();

        const xValues = allReadings.map(r => r.x);
        const yValues = allReadings.map(r => r.y);

        this.state.calibration.data = {
            xRange: {
                min: Math.min(...xValues),
                max: Math.max(...xValues),
                mid: (Math.min(...xValues) + Math.max(...xValues)) / 2
            },
            yRange: {
                min: Math.min(...yValues),
                max: Math.max(...yValues),
                mid: (Math.min(...yValues) + Math.max(...yValues)) / 2
            }
        };

        Logger.log(CONFIG.DEBUG.CALIBRATION, 'Calibration', 'Calibration completed:', this.state.calibration.data);
    }
    
    updateDataHistory(readings, timestamp) {
        this.state.visualization.dataHistory.push({
            timestamp,
            readings
        });
        
        // Trim history if needed
        if (this.state.visualization.dataHistory.length > this.state.settings.historyLength) {
            this.state.visualization.dataHistory = 
                this.state.visualization.dataHistory.slice(-this.state.settings.historyLength);
        }
    }
    
    updateCopHistory(cop, timestamp) {
        this.state.visualization.copHistory.push({
            ...cop,
            timestamp
        });
        
        // Trim history if needed
        if (this.state.visualization.copHistory.length > this.state.settings.copHistoryLength) {
            this.state.visualization.copHistory = 
                this.state.visualization.copHistory.slice(-this.state.settings.copHistoryLength);
        }
        
        // Calculate and update velocity history
        this.calculateVelocities(cop, timestamp);
    }
  
    updateForceHistory(forces, timestamp) {
        if (!forces) return;

        this.state.visualization.forceHistory.push({
            ...forces,
            timestamp
        });

        // Trim history if needed
        if (this.state.visualization.forceHistory.length > this.state.settings.copHistoryLength) {
            this.state.visualization.forceHistory = 
                this.state.visualization.forceHistory.slice(-this.state.settings.copHistoryLength);
        }

        Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated force history:', {
            historyLength: this.state.visualization.forceHistory.length,
            latestForces: forces
        });
    }
    
    calculateVelocities(cop, timestamp) {
        const velocityHistory = this.state.visualization.velocityHistory;
        
        if (velocityHistory.length === 0) {
            velocityHistory.push({
                timestamp,
                vx: 0,
                vy: 0
            });
            return { vx: 0, vy: 0 };
        }
        
        const prevPoint = velocityHistory[velocityHistory.length - 1];
        const dt = (timestamp - prevPoint.timestamp) / 1000;
        
        if (dt === 0) return { vx: 0, vy: 0 };
        
        const inchesPerSensorX = this.state.settings.matWidth / this.state.settings.sensorsX;
        const inchesPerSensorY = this.state.settings.matHeight / this.state.settings.sensorsY;
        
        const dx = (cop.x - prevPoint.x) * inchesPerSensorX;
        const dy = (cop.y - prevPoint.y) * inchesPerSensorY;
        
        const vx = dx / dt;
        const vy = dy / dt;
        
        velocityHistory.push({
            timestamp,
            x: cop.x,
            y: cop.y,
            vx,
            vy
        });
        
        // Trim velocity history
        if (velocityHistory.length > this.state.settings.copHistoryLength) {
            this.state.visualization.velocityHistory = 
                velocityHistory.slice(-this.state.settings.copHistoryLength);
        }
        
        return { vx, vy };
    }
    
    calculateForces(readings) {
        //const method = document.querySelector('input[name="weightDistMethod"]:checked').value;
        const method = this.state.app.state.weightDistMethod || 'perFrame';
      
        //moved to global //const useLinearFit = true; // Could be made configurable
        
        let totalPressure = 0;
        let leftPressure = 0;
        let rightPressure = 0;
        
        if (method === 'calibrated' && this.state.calibration.data) {
            const boundaries = this.state.calibration.data;
            
            if (useLinearFit) {
                totalPressure = readings.reduce((sum, r) => sum + r.value, 0);
                const leftFootReadings = readings.filter(r => r.x <= boundaries.xRange.mid);
                const rightFootReadings = readings.filter(r => r.x > boundaries.xRange.mid);
                
                leftPressure = leftFootReadings.reduce((sum, r) => sum + r.value, 0);
                rightPressure = rightFootReadings.reduce((sum, r) => sum + r.value, 0);
            } else {
                totalPressure = readings.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
                const leftFootReadings = readings.filter(r => r.x <= boundaries.xRange.mid);
                const rightFootReadings = readings.filter(r => r.x > boundaries.xRange.mid);
                
                leftPressure = leftFootReadings.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
                rightPressure = rightFootReadings.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
            }
        } else {
            // Use per-frame method
            const xValues = readings.map(r => r.x);
            const minX = Math.min(...xValues);
            const maxX = Math.max(...xValues);
            const xMidpoint = minX + (maxX - minX) / 2;
            
            const leftFootReadings = readings.filter(r => r.x <= xMidpoint);
            const rightFootReadings = readings.filter(r => r.x > xMidpoint);
            
            if (useLinearFit) {
                totalPressure = readings.reduce((sum, r) => sum + r.value, 0);
                leftPressure = leftFootReadings.reduce((sum, r) => sum + r.value, 0);
                rightPressure = rightFootReadings.reduce((sum, r) => sum + r.value, 0);
            } else {
                totalPressure = readings.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
                leftPressure = leftFootReadings.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
                rightPressure = rightFootReadings.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
            }
        }
        
        return { total: totalPressure, left: leftPressure, right: rightPressure };
    }
    
    clearData() {
        this.state.visualization.dataHistory = [];
        this.state.visualization.copHistory = [];
        this.state.visualization.velocityHistory = [];
        this.state.visualization.forceHistory = [];
        
        if (this.state.visualization.heatmapInstance) {
            this.state.visualization.heatmapInstance.setData({ data: [] });
        }
        
        Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'All data cleared');
    }
  
}  //end of class DataProcessor



// Visualization Module
class Visualizer {
  
    constructor(appState) {
        this.state = appState;
        Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Initializing visualizer');
        
        // --- PATCH: Add throttling variables for chart updates ---
        this.lastVelocityUpdate = 0;
        this.lastForceUpdate = 0;
        this.coPGraphInitialized = false;
        this.velocityGraphInitialized = false;
        this.forceGraphInitialized = false;
        // --------------------------------------------------------        
      
        try{
            this.initializeHeatmap();
            this.initializeGraphs();
            Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Visualization components initialized');
        } catch (error) {
            Logger.log(CONFIG.DEBUG.ERROR, 'Visualizer', 'Error initializing visualizer:', error);
        }
      
    }
  
    initializeHeatmap() {
        const container = document.getElementById('heatmap-container');
        const heatmapElement = document.getElementById('heatmap');
        
        if (!container || !heatmapElement) {
            throw new Error('Required heatmap elements not found in DOM');
        }
        
        Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Container dimensions:', {
            width: container.offsetWidth,
            height: container.offsetHeight
        });
        
        this.adjustContainerDimensions();
        
        try {
            this.state.visualization.heatmapInstance = h337.create({
                container: heatmapElement,
                radius: this.state.settings.radius,
                maxOpacity: this.state.settings.maxOpacity,
                minOpacity: this.state.settings.minOpacity,
                blur: this.state.settings.blur,
                backgroundColor: 'rgba(0, 0, 58, 0.96)',    //blue  //with alpha so you can see through it  //higher alpha is less transparent
                gradient: {
                    '0.0': 'rgb(0, 0, 58)',     //blackish blue
                    '0.1': 'rgb(0, 0, 255)',    //blue
                    '0.2': 'rgb(128, 0, 255)',  //purple
                    '0.3': 'rgb(0, 128, 255)',  //greenish blue
                    '0.4': 'rgb(0, 255, 255)',  //aqua
                    '0.5': 'rgb(0, 255, 128)',  //blueish green
                    '0.6': 'rgb(0, 255, 0)',    //green
                    '0.7': 'rgb(128, 255, 0)',  //yellowish green
                    '0.8': 'rgb(255, 255, 0)',  //yellow
                    '0.9': 'rgb(255, 128, 0)',  //orange
                    '1.0': 'rgb(255, 0, 0)'     //red
                }
            });
            
            Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Heatmap instance created');
        } catch (error) {
            Logger.log(CONFIG.DEBUG.ERROR, 'Visualizer', 'Error creating heatmap instance:', error);
            throw error;
        }
    }  
  
    initializeGraphs() {        
        // Initialize CoP Graph (no throttling, usually cheap)
        const copLayout = {
            title: 'Center of Pressure (CoP) Graph',
            xaxis: {
                title: 'X Position (coordinate)',
                autorange: true,
                tickformat: '0.2f',
                nticks: 10,
                exponentformat: 'none',
                showexponent: 'none'
            },
            yaxis: {
                title: 'Y Position (coordinate)',
                autorange: true,
                tickformat: '0.2f',
                nticks: 10,
                exponentformat: 'none',
                showexponent: 'none'
            },
            showlegend: false
        };
        
        Plotly.newPlot('cop-graph', [], copLayout);        
        this.coPGraphInitialized = true;
                
        // Initialize Velocity Graph
        const velocityLayout = {
            title: 'CoP Velocity Components',
            xaxis: {
                title: 'Time (s)',
                showgrid: true,
                zeroline: true
            },
            yaxis: {
                title: 'Velocity (in/s)',
                showgrid: true,
                zeroline: true
            },
            showlegend: true
        };
        
        Plotly.newPlot('velocity-graph', [], velocityLayout);
        this.velocityGraphInitialized = true;
        
        // Initialize Force Graph
        const forceLayout = {
            title: {
                text: 'Vertical Ground Reaction Force',
                font: { size: 16 }
            },
            xaxis: {
                title: 'Time (s)',
                showgrid: true,
                zeroline: true
            },
            yaxis: {
                title: 'Force (% of static weight)',
                showgrid: true,
                zeroline: true
            },
            showlegend: true
        };
        
        Plotly.newPlot('force-graph', [], forceLayout);
        this.forceGraphInitialized = true;
        
        Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'All graphs initialized');
    }
    
    adjustContainerDimensions() {
        const container = document.getElementById('heatmap-container');
        const sensorCountX = this.state.settings.sensorsX;
        const sensorCountY = this.state.settings.sensorsY;
        
        const currentWidth = container.offsetWidth;
        const currentHeight = container.offsetHeight;
        
        const pixelsPerSensorX = Math.round(currentWidth / sensorCountX);
        const pixelsPerSensorY = Math.round(currentHeight / sensorCountY);
        
        const adjustedWidth = pixelsPerSensorX * sensorCountX;
        const adjustedHeight = pixelsPerSensorY * sensorCountY;
        
        container.style.width = `${adjustedWidth}px`;
        container.style.height = `${adjustedHeight}px`;
        
        // Adjust overlay canvas
        const overlayCanvas = document.getElementById('heatmap-overlay');
        if (overlayCanvas) {
            overlayCanvas.width = adjustedWidth;
            overlayCanvas.height = adjustedHeight;
        }
        
        // Force heatmap instance to update dimensions
        if (this.state.visualization.heatmapInstance) {
            this.state.visualization.heatmapInstance.setDataMax(this.state.settings.maxValue);
        }
    }
    
    updateHeatmap(data) {
      
        //if (!this.state.visualization.heatmapInstance || !data.readings.length) return;
        
        if (!this.state.visualization.heatmapInstance || !data?.readings?.length) {
            Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Skipping heatmap update - missing data or instance');
            return;
        }

        Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Updating heatmap with data:', data);

        
        const container = document.getElementById('heatmap-container');
      
        if (!container) {
            Logger.log(CONFIG.DEBUG.ERROR, 'Visualizer', 'Heatmap container not found');
            return;
        }
      
        const scaleX = container.offsetWidth / this.state.settings.sensorsX;
        const scaleY = container.offsetHeight / this.state.settings.sensorsY;
        
        const processedData = data.readings.map(reading => {
            let x = reading.x;
            let y = reading.y;
            
            if (this.state.settings.invertX) {
                x = this.state.settings.sensorsX - x;
            }
            if (!this.state.settings.invertY) {
                y = this.state.settings.sensorsY - y;
            }
            
            return {
                x: x * scaleX,
                y: y * scaleY,
                value: reading.value
            };
        });
      
        Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Processed heatmap data:', processedData);
        
        const dataMaxValue = Math.max(...processedData.map(d => d.value));
        
        this.state.visualization.heatmapInstance.setData({
            min: this.state.settings.minValue,
            max: dataMaxValue - 300,
            data: processedData
        });
        
        this.updateHeatmapOverlay(data.cop, processedData);
    }
    
    updateHeatmapOverlay(cop, pressureData) {
        const overlayCanvas = document.getElementById('heatmap-overlay');
        const ctx = overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        
        // Draw grid
        this.drawGrid(ctx, overlayCanvas);
        
        // Draw CoP path and current position
        if (cop) {
            this.drawCoPPath(ctx, overlayCanvas);
            this.drawCurrentCoP(ctx, overlayCanvas, cop);
        }
    }
    
    drawGrid(ctx, canvas) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        
        const xStep = canvas.width / this.state.settings.sensorsX;
        const yStep = canvas.height / this.state.settings.sensorsY;
        
        // Vertical lines
        for (let i = 0; i <= this.state.settings.sensorsX; i++) {
            ctx.beginPath();
            ctx.moveTo(i * xStep, 0);
            ctx.lineTo(i * xStep, canvas.height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let i = 0; i <= this.state.settings.sensorsY; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * yStep);
            ctx.lineTo(canvas.width, i * yStep);
            ctx.stroke();
        }
    }
    
    drawCoPPath(ctx, canvas) {
        const copHistory = this.state.visualization.copHistory;
        if (!copHistory.length) return;
        
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        copHistory.forEach((point, index) => {
            let x = point.x;
            let y = point.y;
            
            if (this.state.settings.invertX) {
                x = this.state.settings.sensorsX - x;
            }
            if (!this.state.settings.invertY) {
                y = this.state.settings.sensorsY - y;
            }
            
            const xScaled = (x * canvas.width) / this.state.settings.sensorsX;
            const yScaled = (y * canvas.height) / this.state.settings.sensorsY;
            
            if (index === 0) {
                ctx.moveTo(xScaled, yScaled);
            } else {
                ctx.lineTo(xScaled, yScaled);
            }
        });
        
        ctx.stroke();
    }
    
    drawCurrentCoP(ctx, canvas, cop) {
        let x = cop.x;
        let y = cop.y;
        
        if (this.state.settings.invertX) {
            x = this.state.settings.sensorsX - x;
        }
        if (!this.state.settings.invertY) {
            y = this.state.settings.sensorsY - y;
        }
        
        const xScaled = (x * canvas.width) / this.state.settings.sensorsX;
        const yScaled = (y * canvas.height) / this.state.settings.sensorsY;
        
        ctx.beginPath();
        ctx.fillStyle = 'yellow';
        ctx.arc(xScaled, yScaled, 4, 0, Math.PI * 2);
        ctx.fill();
    }
    
    updateCoPGraph() {
        const copHistory = this.state.visualization.copHistory;
        //if (!copHistory.length) return;
        if (!copHistory || copHistory.length === 0) {
            Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'No CoP history to display');
            return;
        }
        
        const inchesPerSensorX = this.state.settings.matWidth / this.state.settings.sensorsX;
        const inchesPerSensorY = this.state.settings.matHeight / this.state.settings.sensorsY;
        
        let xValues, yValues, title, xAxisTitle, yAxisTitle;
      
        //const copMode = document.querySelector('input[name="copMode"]:checked').value;
        const copMode = this.state.app.state.copMode || 'normal';
        
        // Adjust coordinates based on mode
        if (copMode === 'normal') {
            xValues = copHistory.map(point => point.x);
            yValues = copHistory.map(point => point.y);
            title = 'Center of Pressure (CoP) Graph';
            xAxisTitle = 'X Position (coordinate)';
            yAxisTitle = 'Y Position (coordinate)';
        } else {
            const basePoint = copHistory[0];
            xValues = copHistory.map(point => 
                (point.x - basePoint.x) * inchesPerSensorX
            );
            yValues = copHistory.map(point => 
                (point.y - basePoint.y) * inchesPerSensorY
            );
            title = 'Center of Pressure (CoP) Delta';
            xAxisTitle = 'X Delta (inches)';
            yAxisTitle = 'Y Delta (inches)';
        }
        
        const trace = {
            x: xValues,
            y: yValues,
            mode: 'lines+markers',
            //type: 'scatter',
            type: 'scattergl',  //uses WebGL to use GPU for higher performance
            marker: { color: 'blue', size: 6 }
        };
        
        const layout = {
            title: title,
            xaxis: {
                title: xAxisTitle,
                autorange: true,
                tickformat: '0.2f',
                nticks: 10,
                exponentformat: 'none',
                showexponent: 'none'
            },
            yaxis: {
                title: yAxisTitle,
                autorange: true,
                tickformat: '0.2f',
                nticks: 10,
                exponentformat: 'none',
                showexponent: 'none'
            }
        };
        
        //Plotly.newPlot('cop-graph', [trace], layout);
        
        if (this.coPGraphInitialized) {
            Plotly.react('cop-graph', [trace], layout);
        } else {
            Plotly.newPlot('cop-graph', [trace], layout);
            this.coPGraphInitialized = true;
        }
      
      
    }
    
    updateVelocityGraph() {
      
        const now = Date.now();
        if (now - this.lastVelocityUpdate < 100) return; // update at most every 100ms (10 FPS)
        this.lastVelocityUpdate = now;
      
        const velocityHistory = this.state.visualization.velocityHistory;
        //if (velocityHistory.length < 2) return;
        if (!velocityHistory || velocityHistory.length < 2) {
            Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Insufficient velocity history to display');
            return;
        }
        
        const mostRecentTime = velocityHistory[velocityHistory.length - 1].timestamp;
        const times = velocityHistory.map(point => 
            (point.timestamp - mostRecentTime) / 1000
        );
        
        const traces = [
            {
                x: times,
                y: velocityHistory.map(point => point.vx),
                mode: 'lines+markers',
                type: 'scattergl',  //uses WebGL to use GPU for higher performance
                //name: 'Lateral Velocity',
                name: 'Lateral',
                line: { color: 'blue' },
                marker: { size: 6, color: 'blue' }
            },
            {
                x: times,
                y: velocityHistory.map(point => point.vy),
                mode: 'lines+markers',
                type: 'scattergl',  //uses WebGL to use GPU for higher performance
                //name: 'Heel-Toe Velocity',
                name: 'Heel-Toe',
                line: { color: 'red' },
                marker: { size: 6, color: 'red' }
            }
        ];
        
        const layout = {
            title: 'CoP Velocity Components',
            xaxis: {
                title: 'Time (s)',
                showgrid: true,
                zeroline: true,
                autorange: 'reversed',
                range: [-(this.state.settings.copHistoryLength / 30), 0]
            },
            yaxis: {
                title: 'Velocity (in/s)',
                showgrid: true,
                zeroline: true
            },
            showlegend: true
        };
        
        //Plotly.newPlot('velocity-graph', traces, layout);
        
        // PATCH: Use Plotly.react for efficient updates
        if (this.velocityGraphInitialized) {
            Plotly.react('velocity-graph', traces, layout);
        } else {
            Plotly.newPlot('velocity-graph', traces, layout);
            this.velocityGraphInitialized = true;
        }
      
    }
    
    updateForceGraph() {
        
        const now = Date.now();
        if (now - this.lastForceUpdate < 100) return; // update at most every 100ms (10 FPS)
        this.lastForceUpdate = now;
        
        const forceHistory = this.state.visualization.forceHistory;
        if (forceHistory.length < 2) return;
        
        const mostRecentTime = forceHistory[forceHistory.length - 1].timestamp;
        const times = forceHistory.map(point => 
            (point.timestamp - mostRecentTime) / 1000
        );
        
        const referenceForce = this.state.recording.staticForceReference || 
                             forceHistory[0].total;
        
        //moved to global //const useLinearFit = true; // Could be made configurable
        
        let leftForces, rightForces, totalForces;
        
        if (useLinearFit) {
            leftForces = forceHistory.map(point => (point.left / point.total) * 100);
            rightForces = forceHistory.map(point => (point.right / point.total) * 100);
            totalForces = forceHistory.map(point => (point.total / referenceForce) * 100);
        } else {
            leftForces = forceHistory.map(point => (point.left / point.total) * 100);
            rightForces = forceHistory.map(point => (point.right / point.total) * 100);
            totalForces = forceHistory.map(point => (point.total / referenceForce) * 100);
        }
        
        const traces = [
            {
                x: times,
                y: leftForces,
                mode: 'lines+markers',
                type: 'scattergl',  //uses WebGL to use GPU for higher performance
                //name: 'Left Foot Force',
                name: 'Left',
                line: { color: 'blue' },
                marker: { size: 6, color: 'blue' }
            },
            {
                x: times,
                y: rightForces,
                mode: 'lines+markers',
                type: 'scattergl',  //uses WebGL to use GPU for higher performance
                //name: 'Right Foot Force',
                name: 'Right',
                line: { color: 'red' },
                marker: { size: 6, color: 'red' }
            },
            {
                x: times,
                y: totalForces,
                mode: 'lines+markers',
                type: 'scattergl',  //uses WebGL to use GPU for higher performance
                //name: 'Total Force',
                name: 'Total',
                line: { color: 'green' },
                marker: { size: 6, color: 'green' }
            }
        ];
        
        const layout = {
            title: {
                text: `Vertical Ground Reaction Force ${useLinearFit ? '(Linear)' : '(Power Fit)'}`,
                font: { size: 16 }
            },
            xaxis: {
                title: 'Time (s)',
                showgrid: true,
                zeroline: true,
                autorange: 'reversed',
                range: [-(this.state.settings.copHistoryLength / 30), 0]
            },
            yaxis: {
                title: 'Force (% of static weight)',
                showgrid: true,
                zeroline: true
            },
            showlegend: true
        };
        
        //Plotly.newPlot('force-graph', traces, layout);
        
        // PATCH: Use Plotly.react for efficient updates
        if (this.forceGraphInitialized) {
            Plotly.react('force-graph', traces, layout);
        } else {
            Plotly.newPlot('force-graph', traces, layout);
            this.forceGraphInitialized = true;
        }
        
    }
  
    clearAll() {
        // Clear heatmap data
        if (this.state.visualization.heatmapInstance) {
            this.state.visualization.heatmapInstance.setData({ data: [] });
        }

        // Clear all histories
        this.state.visualization.dataHistory = [];
        this.state.visualization.copHistory = [];
        this.state.visualization.velocityHistory = [];
        this.state.visualization.forceHistory = [];

        // Clear graphs
        Plotly.newPlot('cop-graph', [], {
            title: 'Center of Pressure (CoP) Graph',
            xaxis: { title: 'X Position (coordinate)' },
            yaxis: { title: 'Y Position (coordinate)' }
        });

        Plotly.newPlot('velocity-graph', [], {
            title: 'CoP Velocity Components',
            xaxis: { title: 'Time (s)' },
            yaxis: { title: 'Velocity (in/s)' }
        });

        Plotly.newPlot('force-graph', [], {
            title: 'Vertical Ground Reaction Force',
            xaxis: { title: 'Time (s)' },
            yaxis: { title: 'Force (% of static weight)' }
        });

        // Clear overlay canvas
        const overlayCanvas = document.getElementById('heatmap-overlay');
        if (overlayCanvas) {
            const ctx = overlayCanvas.getContext('2d');
            ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        // Reset pressure distribution display
        document.getElementById('front-toe-percentage').textContent = 'Toe: 0%';
        document.getElementById('front-percentage').textContent = '0';
        document.getElementById('front-heel-percentage').textContent = 'Heel: 0%';
        document.getElementById('back-toe-percentage').textContent = 'Toe: 0%';
        document.getElementById('back-percentage').textContent = '0';
        document.getElementById('back-heel-percentage').textContent = 'Heel: 0%';

        Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'All visualizations cleared');
      
    }
  
  
}  //end of class Visualizer


// Bluetooth Connection Handler
class BluetoothManager {
  
    constructor(appState) {
        this.state = appState;
        this.maxRetryAttempts = CONFIG.BLE.MAX_RETRY_ATTEMPTS;
        this.retryDelay = CONFIG.BLE.RETRY_DELAY;
    }
    
    async scanForDevices() {
        try {
            Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Starting device scan...');
            
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: [CONFIG.BLE.NORDIC_UART_SERVICE] },
                    { services: [CONFIG.BLE.MICROCHIP_UART_SERVICE] }
                ]
            });
            
            Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', `Device found: ${device.name || 'Unnamed Device'}`);
            
            await this.connectToDevice(device);
            
        } catch (error) {
            Logger.log(CONFIG.DEBUG.ERROR, 'Bluetooth', 'Scanning failed', error);
            throw error;
        }
    }
    
    async connectToDevice(device, retryCount = 0) {
        try {
            this.state.bluetooth.device = device;
            this.state.dataBuffer = '';
            
            Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 
                `Connecting to device: ${device.name || 'Unnamed Device'} (Attempt ${retryCount + 1})`
            );
            
            device.addEventListener('gattserverdisconnected', this.handleDisconnection.bind(this));
            
            const server = await device.gatt.connect();
            Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'GATT server connected');
            
            // Try Microchip UART first, then Nordic UART
            let service;
            try {
                service = await server.getPrimaryService(CONFIG.BLE.MICROCHIP_UART_SERVICE);
                Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Connected using Microchip UART Service');
                this.state.bluetooth.characteristic = await service.getCharacteristic(CONFIG.BLE.MICROCHIP_UART_TX);
            } catch {
                service = await server.getPrimaryService(CONFIG.BLE.NORDIC_UART_SERVICE);
                Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Connected using Nordic UART Service');
                this.state.bluetooth.characteristic = await service.getCharacteristic(CONFIG.BLE.NORDIC_UART_TX);
            }
            
            this.state.bluetooth.characteristic.addEventListener(
                'characteristicvaluechanged',
                this.handleData.bind(this)
            );
            await this.state.bluetooth.characteristic.startNotifications();
            
            this.state.bluetooth.isConnected = true;
            device.autoReconnectEnabled = true;
            
            this.updateUIForConnection(true);
            Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Notifications started - ready to receive data');
            
        } catch (error) {
            Logger.log(CONFIG.DEBUG.ERROR, 'Bluetooth', `Connection failed (Attempt ${retryCount + 1})`, error);
            
            if (retryCount < this.maxRetryAttempts) {
                Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 
                    `Retrying connection in ${this.retryDelay/1000} seconds...`
                );
                setTimeout(() => this.connectToDevice(device, retryCount + 1), this.retryDelay);
            } else {
                Logger.log(CONFIG.DEBUG.ERROR, 'Bluetooth', 'Maximum retry attempts reached');
                throw error;
            }
        }
    }
    
    handleData(event) {
        const decoder = new TextDecoder();
        const chunk = decoder.decode(event.target.value);
        
        //Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Received data chunk', chunk);
        //Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Raw data chunk received:', chunk);
      
        // Convert ArrayBuffer to regular array for logging
        const rawData = Array.from(event.target.value);
        Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Raw data received as bytes:', rawData);
        Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Decoded chunk:', chunk);

        
        this.state.dataBuffer += chunk;
        
        let newlineIndex;
        while ((newlineIndex = this.state.dataBuffer.indexOf('\n')) !== -1) {
            const frame = this.state.dataBuffer.substring(0, newlineIndex).trim();
            this.state.dataBuffer = this.state.dataBuffer.substring(newlineIndex + 1);
            
            //Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Complete frame extracted:', frame);
            Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Frame extracted:', frame);
          
            /*
            if (frame) {
                //app.processFrame(frame);
                this.state.app.processFrame(frame);
            }
            */
          
            if (frame) {
                try {
                    // Make sure we're calling the right instance method
                    if (this.state.app && typeof this.state.app.processFrame === 'function') {
                        this.state.app.processFrame(frame);
                    } else {
                        Logger.log(CONFIG.DEBUG.ERROR, 'Bluetooth', 'Invalid app reference or processFrame method');
                    }
                } catch (error) {
                    Logger.log(CONFIG.DEBUG.ERROR, 'Bluetooth', 'Error processing frame:', error);
                }
            }
          
          
        }
    }
    
    handleDisconnection(event) {
        const device = event.target;
        
        if (device.autoReconnectEnabled) {
            Logger.log(CONFIG.DEBUG.ERROR, 'Bluetooth', 'Device disconnected unexpectedly!');
        }
        
        this.state.bluetooth.isConnected = false;
        this.state.bluetooth.characteristic = null;
        this.state.dataBuffer = '';
        
        this.updateUIForConnection(false);
        
        if (device.autoReconnectEnabled) {
            Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Attempting to reconnect...');
            this.connectToDevice(device).catch(error => {
                Logger.log(CONFIG.DEBUG.ERROR, 'Bluetooth', 'Auto-reconnect failed', error);
            });
        } else {
            Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Device disconnected - scan to reconnect');
        }
    }
    
    async disconnect() {
        try {
            if (this.state.bluetooth.device && this.state.bluetooth.device.gatt.connected) {
                this.state.bluetooth.device.autoReconnectEnabled = false;
                await this.state.bluetooth.device.gatt.disconnect();
                
                Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Device disconnected successfully');
                
                this.state.bluetooth.isConnected = false;
                this.state.bluetooth.characteristic = null;
                this.state.dataBuffer = '';
                
                // Clear visualizations
                this.state.app.visualizer.clearAll();
                this.updateUIForConnection(false);
            }
          
        } catch (error) {
            Logger.log(CONFIG.DEBUG.ERROR, 'Bluetooth', 'Disconnect failed', error);
            throw error;
        }
    }  //end of disconnect method of BluetoothManager class
    
    updateUIForConnection(isConnected) {
        document.getElementById('disconnectButton').disabled = !isConnected;
        document.getElementById('scanButton').disabled = isConnected;
        document.getElementById('status').textContent = 
            isConnected ? 'Connected and receiving data' : 'Disconnected';
    }  
  
}  //end of class BluetoothManager

// Swing Recording Manager
class RecordingManager {
  
    constructor(appState) {
        this.state = appState;
    }
    
    startCountdown() {
        const readyButton = document.getElementById('readyButton');
        const countdownDisplay = document.getElementById('countdown');
        readyButton.disabled = true;
        let count = 5;
        
        const countInterval = setInterval(() => {
            countdownDisplay.textContent = count;
            count--;
            
            if (count < 0) {
                clearInterval(countInterval);
                countdownDisplay.textContent = 'START!';
                setTimeout(() => {
                    countdownDisplay.textContent = '';
                    this.startRecording();
                }, 1000);
            }
        }, 1000);
    }
    
    startRecording() {
        this.state.recording.isRecording = true;
        this.state.recording.recordingStarted = false;
        this.state.recording.copPathData = [];
        this.state.recording.playbackData = [];
        this.state.recording.lastCopPosition = null;
        this.state.recording.startTime = null;
        this.state.recording.maxSpeedRecorded = 0;
    }
    
    processCoPData(readings, cop) {
        if (!this.state.recording.isRecording) return;
        
        let copX = this.state.settings.invertX ? 
            (this.state.settings.sensorsX - cop.x) : cop.x;
        let copY = this.state.settings.invertY ? 
            (this.state.settings.sensorsY - cop.y) : cop.y;
        
        const inchesPerSensorX = this.state.settings.matWidth / this.state.settings.sensorsX;
        const inchesPerSensorY = this.state.settings.matHeight / this.state.settings.sensorsY;
        
        const xInches = copX * inchesPerSensorX;
        const yInches = copY * inchesPerSensorY;
        
        if (!this.state.recording.lastCopPosition) {
            this.state.recording.lastCopPosition = { x: xInches, y: yInches };
            return;
        }
        
        const distance = Utils.calculateDistance(
            { x: xInches, y: yInches },
            this.state.recording.lastCopPosition
        );
        
        if (!this.state.recording.recordingStarted && 
            distance >= this.state.settings.copTriggerThreshold) {
            this.state.recording.recordingStarted = true;
            this.state.recording.startTime = Date.now();
        }
        
        if (this.state.recording.recordingStarted) {
            const timestamp = Date.now();
            const currentTime = (timestamp - this.state.recording.startTime) / 1000;
            
            this.recordFrame(readings, cop, timestamp);
            
            if (this.checkSwingStop(currentTime, distance)) {
                this.stopRecording();
            }
        }
        
        this.state.recording.lastCopPosition = { x: xInches, y: yInches };
    }
  
    updateCoPStats(frame) {
        if (!frame || !frame.cop) return;

        const inchesPerSensorX = this.state.settings.matWidth / this.state.settings.sensorsX;
        const inchesPerSensorY = this.state.settings.matHeight / this.state.settings.sensorsY;

        // Convert sensor coordinates to inches
        const xInches = frame.cop.x * inchesPerSensorX;
        const yInches = frame.cop.y * inchesPerSensorY;

        this.state.recording.copPathData.push({
            x: xInches,
            y: yInches,
            timestamp: frame.timestamp
        });

        // Update stats if we have at least two points
        if (this.state.recording.copPathData.length >= 2) {
            const currentPoint = this.state.recording.copPathData[this.state.recording.copPathData.length - 1];
            const prevPoint = this.state.recording.copPathData[this.state.recording.copPathData.length - 2];

            const dt = (currentPoint.timestamp - prevPoint.timestamp) / 1000; // Convert to seconds
            if (dt > 0) {
                const dx = currentPoint.x - prevPoint.x;
                const dy = currentPoint.y - prevPoint.y;
                const speed = Math.sqrt(dx * dx + dy * dy) / dt;

                this.state.recording.maxSpeedRecorded = Math.max(
                    this.state.recording.maxSpeedRecorded,
                    speed
                );
            }
        }
    }
    
    recordFrame(readings, cop, timestamp) {
        const frame = {
            timestamp,
            pressure: readings.map(reading => ({
                ...reading,
                x: this.state.settings.invertX ? 
                    (this.state.settings.sensorsX - reading.x) : reading.x,
                y: this.state.settings.invertY ? 
                    (this.state.settings.sensorsY - reading.y) : reading.y,
                value: reading.value
            })),
            cop: {
                x: this.state.settings.invertX ? 
                    (this.state.settings.sensorsX - cop.x) : cop.x,
                y: this.state.settings.invertY ? 
                    (this.state.settings.sensorsY - cop.y) : cop.y
            }
        };
        
        this.state.recording.playbackData.push(frame);
        this.updateCoPStats(frame);
    }
    
    checkSwingStop(currentTime, distance) {
        if (!this.state.recording.recordingStarted) return false;
        
        if (this.state.settings.useFixedDurationStop && 
            currentTime >= this.state.settings.swingDuration) {
            return true;
        }
        
        if (this.state.settings.useMovementThresholdStop && 
            distance <= this.state.settings.stopTriggerThreshold) {
            return true;
        }
        
        return false;
    }
    
    stopRecording() {
        this.state.recording.isRecording = false;
        this.state.recording.recordingStarted = false;
        
        document.querySelector('.playback-controls').style.display = 'block';
        this.state.app.playbackManager.initializePlayback();
    }
  
}  //end of class RecordingManager {


// Playback Manager
class PlaybackManager {
  
    constructor(appState) {
        this.state = appState;
        this.isPlaying = false;
        this.playbackInterval = null;
        this.currentFrameIndex = 0;
        
        this.initializeControls();
    }
    
    initializeControls() {
        document.getElementById('skipStart').addEventListener('click', () => this.skipToFrame(0));
        document.getElementById('reversePlay').addEventListener('click', () => this.playReverse());
        document.getElementById('prevFrame').addEventListener('click', () => this.showPrevFrame());
        document.getElementById('playPause').addEventListener('click', () => this.togglePlay());
        document.getElementById('nextFrame').addEventListener('click', () => this.showNextFrame());
        document.getElementById('forwardPlay').addEventListener('click', () => this.playForward());
        document.getElementById('skipEnd').addEventListener('click', () => this.skipToFrame(-1));
        
        document.getElementById('frameSlider').addEventListener('input', (e) => {
            this.skipToFrame(parseInt(e.target.value));
        });
        
        document.getElementById('playbackSpeed').addEventListener('change', (e) => {
            this.state.settings.playbackSpeed = parseFloat(e.target.value);
            if (this.isPlaying) {
                this.stopPlayback();
                this.startPlayback();
            }
        });
    }
    
    initializePlayback() {
        if (!this.state.recording.playbackData?.length) {
            Logger.log(CONFIG.DEBUG.ERROR, 'Playback', 'No recorded data to playback');
            return;
        }
        
        const slider = document.getElementById('frameSlider');
        slider.max = this.state.recording.playbackData.length - 1;
        slider.value = 0;
        this.currentFrameIndex = 0;
        this.showFrame(0);
    }
    
    showFrame(frameIndex) {
        if (!this.state.recording.playbackData || 
            frameIndex < 0 || 
            frameIndex >= this.state.recording.playbackData.length) return;
        
        const frame = this.state.recording.playbackData[frameIndex];
        const startTime = this.state.recording.playbackData[0].timestamp;
        const frameTime = (frame.timestamp - startTime) / 1000;
        
        document.getElementById('timeDisplay').textContent = frameTime.toFixed(3) + 's';
        document.getElementById('frameSlider').value = frameIndex;
        
        this.updateVisualizationsForFrame(frame, frameIndex);
    }
    
    updateVisualizationsForFrame(frame, frameIndex) {
        if (!frame) {
            Logger.log(CONFIG.DEBUG.ERROR, 'Playback', 'No frame data provided');
            return;
        }
        
        this.state.app.visualizer.updateHeatmap({ readings: frame.pressure, cop: frame.cop });
        this.state.app.visualizer.updateCoPGraph();
        this.state.app.visualizer.updateVelocityGraph();
        this.state.app.visualizer.updateForceGraph();
        
        this.updatePressureDistribution(frame);
        this.updateRawDataDisplay(frame);
    }
  
    updatePressureDistribution(frame) {
        if (!frame || !frame.pressure) return;

        // Calculate total pressure
        const totalPressure = frame.pressure.reduce((sum, p) => sum + p.value, 0);
        if (totalPressure === 0) return;

        // Calculate midpoint for left/right foot separation
        const xValues = frame.pressure.map(p => p.x);
        const xMidpoint = (Math.min(...xValues) + Math.max(...xValues)) / 2;

        // Separate readings by foot
        const leftFoot = frame.pressure.filter(p => p.x <= xMidpoint);
        const rightFoot = frame.pressure.filter(p => p.x > xMidpoint);

        // Calculate percentages
        const leftTotal = leftFoot.reduce((sum, p) => sum + p.value, 0);
        const rightTotal = rightFoot.reduce((sum, p) => sum + p.value, 0);

        const leftPercentage = ((leftTotal / totalPressure) * 100).toFixed(1);
        const rightPercentage = ((rightTotal / totalPressure) * 100).toFixed(1);

        // Update display
        document.getElementById('front-percentage').textContent = leftPercentage;
        document.getElementById('back-percentage').textContent = rightPercentage;
    }

    updateRawDataDisplay(frame) {
        const rawData = document.getElementById('raw-data');
        if (!rawData || !frame) return;

        const timestamp = (frame.timestamp - this.state.recording.playbackData[0].timestamp) / 1000;

        const data = {
            time: timestamp.toFixed(3) + 's',
            cop: frame.cop ? 
                `(${frame.cop.x.toFixed(2)}, ${frame.cop.y.toFixed(2)})` : 
                'N/A',
            pressurePoints: frame.pressure.length
        };

        rawData.innerHTML = `
            Time: ${data.time}
            CoP: ${data.cop}
            Active Sensors: ${data.pressurePoints}
        `;
    }  
    
    togglePlay() {
        if (this.isPlaying) {
            this.stopPlayback();
        } else {
            this.playForward();
        }
    }
    
    playForward() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        document.getElementById('playPause').textContent = '⏸';
        this.startPlayback(1);
    }
    
    playReverse() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        document.getElementById('playPause').textContent = '⏸';
        this.startPlayback(-1);
    }
    
    startPlayback(direction) {
        const frameLength = this.state.recording.playbackData.length;
        const startTime = this.state.recording.playbackData[0].timestamp;
        const endTime = this.state.recording.playbackData[frameLength - 1].timestamp;
        const timePerFrameMs = (endTime - startTime) / frameLength;
        
        this.playbackInterval = setInterval(() => {
            if (direction === 1) {
                this.currentFrameIndex++;
                if (this.currentFrameIndex >= this.state.recording.playbackData.length) {
                    this.stopPlayback();
                    return;
                }
            } else {
                this.currentFrameIndex--;
                if (this.currentFrameIndex < 0) {
                    this.stopPlayback();
                    return;
                }
            }
            this.showFrame(this.currentFrameIndex);
        }, timePerFrameMs / this.state.settings.playbackSpeed);
    }
    
    stopPlayback() {
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval);
            this.playbackInterval = null;
        }
        this.isPlaying = false;
        document.getElementById('playPause').textContent = '⏯';
    }
    
    showNextFrame() {
        this.stopPlayback();
        if (this.currentFrameIndex < this.state.recording.playbackData.length - 1) {
            this.showFrame(++this.currentFrameIndex);
        }
    }
    
    showPrevFrame() {
        this.stopPlayback();
        if (this.currentFrameIndex > 0) {
            this.showFrame(--this.currentFrameIndex);
        }
    }
    
    skipToFrame(index) {
        this.stopPlayback();
        if (index === -1) index = this.state.recording.playbackData.length - 1;
        this.currentFrameIndex = index;
        this.showFrame(this.currentFrameIndex);
    }
  
}  //end of class PlaybackManager

// Main Application Class
class PressureSensorApp {
  
    constructor() {
        this.state = new AppState();
      
        // Add reference to app in state for components to access
        this.state.app = this;
      
        this.dataProcessor = new DataProcessor(this.state);
        this.visualizer = new Visualizer(this.state);
        this.bluetooth = new BluetoothManager(this.state);
        this.recordingManager = new RecordingManager(this.state);
        this.playbackManager = new PlaybackManager(this.state);
      
        this.state.copMode = 'normal'; // Default to normal mode
        
        this.state.weightDistMethod = 'perFrame';
        
        this.initialize();
    }
    
    async initialize() {
        try {
            this.setupEventListeners();
            
            if (this.state.copMode === 'normal') {
                document.getElementById('normalMode').checked = true;
            } else {
                document.getElementById('deltaMode').checked = true;
            }
            
            this.setupSettingsPanel();
            this.checkVisualizationStatus();
            Logger.log(CONFIG.DEBUG.BASIC, 'App', 'Application initialized successfully');
        } catch (error) {
            Logger.log(CONFIG.DEBUG.ERROR, 'App', 'Initialization failed', error);
        }
    }
  
    checkVisualizationStatus() {
        Logger.log(CONFIG.DEBUG.BASIC, 'App', 'Checking visualization status');

        const heatmapContainer = document.getElementById('heatmap-container');
        const heatmapElement = document.getElementById('heatmap');
        const heatmapOverlay = document.getElementById('heatmap-overlay');

        Logger.log(CONFIG.DEBUG.BASIC, 'App', 'Container dimensions:', {
            width: heatmapContainer?.offsetWidth,
            height: heatmapContainer?.offsetHeight
        });

        Logger.log(CONFIG.DEBUG.BASIC, 'App', 'Heatmap instance:', {
            exists: !!this.state.visualization.heatmapInstance,
            containerExists: !!heatmapElement,
            overlayExists: !!heatmapOverlay
        });
    }
    
    setupEventListeners() {
        document.getElementById('scanButton').addEventListener('click', () => 
            this.bluetooth.scanForDevices()
        );
        
        document.getElementById('disconnectButton').addEventListener('click', () => 
            this.bluetooth.disconnect()
        );
        
        document.getElementById('calibrateStanceButton').addEventListener('click', () => 
            this.startStanceCalibration()
        );
        
        document.getElementById('readyButton').addEventListener('click', () => 
            this.recordingManager.startCountdown()
        );
      
        document.getElementById('normalMode').addEventListener('change', () => {
            this.state.copMode = 'normal';
            this.visualizer.updateCoPGraph();
            this.visualizer.updateVelocityGraph();
            this.visualizer.updateForceGraph();
        });
        document.getElementById('deltaMode').addEventListener('change', () => {
            this.state.copMode = 'delta';
            this.visualizer.updateCoPGraph();
            this.visualizer.updateVelocityGraph();
            this.visualizer.updateForceGraph();
        });
        
        window.addEventListener('resize', Utils.debounce(() => {
            this.visualizer.adjustContainerDimensions();
            this.visualizer.updateHeatmap(this.state.visualization.dataHistory);
        }, 250));
      
        
        document.getElementsByName('weightDistMethod').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.state.weightDistMethod = e.target.value;
                // Update visualizations to reflect new calibration method
                // (update force/pressure/CoP/heatmap, etc)
                this.visualizer.updateCoPGraph();
                this.visualizer.updateVelocityGraph();
                this.visualizer.updateForceGraph();
                // Optional: update heatmap with latest data
                if (this.state.visualization.dataHistory.length > 0) {
                    const last = this.state.visualization.dataHistory[this.state.visualization.dataHistory.length - 1];
                    this.visualizer.updateHeatmap({
                        readings: last.readings,
                        cop: this.state.visualization.copHistory.length > 0
                            ? this.state.visualization.copHistory[this.state.visualization.copHistory.length - 1]
                            : null
                    });
                }
            });
        });

      
        const SETTINGS_SLIDERS = [
            'clearTime',
            'radius',
            'blur',
            'maxValue',
            'minValue',
            'maxOpacity',
            'minOpacity',
            'historyLength',
            'copHistoryLength'
        ];
      
        SETTINGS_SLIDERS.forEach(setting => {
            const input = document.getElementById(setting);
            const slider = document.getElementById(setting + 'Slider');
            if (!input || !slider) return;

            input.addEventListener('input', (e) => {
                slider.value = e.target.value;
                this.updateSettingAndVisuals(setting, e.target.value);
            });

            slider.addEventListener('input', (e) => {
                input.value = e.target.value;
                this.updateSettingAndVisuals(setting, e.target.value);
            });
        });

        // Mat settings (width, height, sensorsX, sensorsY)
        ['matWidth', 'matHeight', 'sensorsX', 'sensorsY'].forEach(setting => {
            const input = document.getElementById(setting);
            if (!input) return;
            input.addEventListener('input', (e) => {
                this.updateSettingAndVisuals(setting, e.target.value);
            });
        });

        // Invert axes checkboxes
        ['invertX', 'invertY'].forEach(setting => {
            const checkbox = document.getElementById(setting);
            if (!checkbox) return;
            checkbox.addEventListener('change', (e) => {
                this.updateSettingAndVisuals(setting, e.target.checked);
            });
        });
        
    }
  
    
    setupSettingsPanel() {
        // Initialize settings toggle visibility
        document.getElementById('settingsSection').style.display = 'none';
        document.getElementById('matSettingsSection').style.display = 'none';
        document.getElementById('connection-info').style.display = 'none';
        
        // Add toggle event listeners
        document.getElementById('settingsToggle').addEventListener('change', (e) => {
            document.getElementById('settingsSection').style.display = 
                e.target.checked ? 'block' : 'none';
        });
        
        document.getElementById('matSettingsToggle').addEventListener('change', (e) => {
            document.getElementById('matSettingsSection').style.display = 
                e.target.checked ? 'block' : 'none';
        });
        
        document.getElementById('debugInformationToggle').addEventListener('change', (e) => {
            document.getElementById('connection-info').style.display = 
                e.target.checked ? 'block' : 'none';
        });
    }
    
    
        
    updateSettingAndVisuals(setting, value) {
        // Parse value as number or boolean
        let parsedValue = value;
        if (typeof value === 'string' && value !== '' && !isNaN(value)) parsedValue = Number(value);

        this.state.updateSetting(setting, parsedValue);

        // Re-initialize or update visualizations as needed
        switch (setting) {
            case 'radius':
            case 'blur':
            case 'maxValue':
            case 'minValue':
            case 'maxOpacity':
            case 'minOpacity':
                this.visualizer.initializeHeatmap();
                this.visualizer.adjustContainerDimensions();
                // Fallthrough to update heatmap with history
            case 'historyLength':
            case 'copHistoryLength':
            case 'matWidth':
            case 'matHeight':
            case 'sensorsX':
            case 'sensorsY':
            case 'invertX':
            case 'invertY':
                this.visualizer.adjustContainerDimensions();
                // Show latest data/history again
                if (this.state.visualization.dataHistory.length > 0) {
                    // Use most recent dataHistory frame for update
                    const last = this.state.visualization.dataHistory[this.state.visualization.dataHistory.length - 1];
                    this.visualizer.updateHeatmap({
                        readings: last.readings,
                        cop: this.state.visualization.copHistory.length > 0
                            ? this.state.visualization.copHistory[this.state.visualization.copHistory.length - 1]
                            : null
                    });
                }
                this.visualizer.updateCoPGraph();
                this.visualizer.updateVelocityGraph();
                this.visualizer.updateForceGraph();
                break;
            case 'clearTime':
                // No direct visualization update, but could reset timeout if needed
                break;
            default:
                // For any other settings, optionally update heatmap
                break;
        }
    }
    
    processFrame(frame) {
        const processedData = this.dataProcessor.processFrame(frame);
        if (processedData) {
            this.visualizer.updateHeatmap(processedData);
            
            if (this.state.recording.isRecording) {
                this.recordingManager.processCoPData(
                    processedData.readings,
                    processedData.cop
                );
            }
        }
    }
  
    startStanceCalibration() {
        const button = document.getElementById('calibrateStanceButton');
        const countdownDisplay = document.getElementById('calibrationCountdown');
        button.disabled = true;

        let timeLeft = CONFIG.CALIBRATION.DURATION / 1000;
        this.state.calibration.isCalibrating = true;
        this.state.calibration.data = null; // Reset calibration data
        this.state.calibration.startTime = Date.now();

        countdownDisplay.textContent = `${timeLeft}s remain - Rock left to right, heel to toe`;

        // Start the countdown interval
        const countInterval = setInterval(() => {
            timeLeft = Math.max(
                0,
                Math.round((CONFIG.CALIBRATION.DURATION - (Date.now() - this.state.calibration.startTime)) / 1000)
            );
            countdownDisplay.textContent = `${timeLeft}s remain - Rock left to right, heel to toe`;

            if (timeLeft <= 0) {
                clearInterval(countInterval);
                this.dataProcessor.completeCalibration();
                countdownDisplay.textContent = '';
                button.disabled = false;
            }
        }, 100);
    }
	
}  //end of class PressureSensorApp 


// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new PressureSensorApp();
});

