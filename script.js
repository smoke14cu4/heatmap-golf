/**
 * Pressure Sensor Visualization Application
 * Version: 2.0.0
 * Author: smoke14cu4
 * Last Updated: 04-26-2025 
 */


//let useLinearFit = true;  //set to true to use linear fit for weight calcs  //set to false to use power fit

var useLinearFit = true;  //set to true to use linear fit for weight calcs  //set to false to use power fitforceHistory
//var useLinearFit = false;  //set to true to use linear fit for weight calcs  //set to false to use power fitforceHistory

var debug = 0;  //0 to disable  //2 is for useLinearFit debugging  //3 is for midpoint calculations display

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
    },
  
    // --- NEW: Left/Right split based on X inversion ---
    splitLeftRight(readings, xMid, invertX) {
        if (invertX) {
            return {
                left: readings.filter(r => r.x > xMid),
                right: readings.filter(r => r.x <= xMid)
            };
        } else {
            return {
                left: readings.filter(r => r.x <= xMid),
                right: readings.filter(r => r.x > xMid)
            };
        }
    },
    
    // --- NEW: Toe/Heel split based on Y inversion ---
    splitToeHeel(footReadings, yMid, invertY) {
        if (invertY) {
            return {
                toe: footReadings.filter(r => r.y <= yMid),
                heel: footReadings.filter(r => r.y > yMid)
            };
        } else {
            return {
                toe: footReadings.filter(r => r.y > yMid),
                heel: footReadings.filter(r => r.y <= yMid)
            };
        }
    }
  
};


// Logger Class
class Logger {
  
    static log(level, component, message, data = null) {
        if (level > CONFIG.DEBUG.level) return;
        
        const timestamp = new Date().toISOString();        
        const logBase = `[${timestamp}][${component}] ${message}`;
      
        // Properly handle data logging
        if (data !== null && data !== undefined) {
            console.group(logBase);
            console.dir(data, { depth: null, colors: true });
            console.groupEnd();
        } else {
            console.log(logBase);
        }
        
        //this.updateUI(message, level === CONFIG.DEBUG.ERROR);
        
    }
  
    /*
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
    */
    
    // Update connection info
    static updateConnectionInfo(message, isError = false) {
        const connectionInfo = document.getElementById('connection-info');
        const timestamp = new Date().toLocaleTimeString();
        const color = isError ? '#ff4444' : '#4CAF50';
        connectionInfo.innerHTML += `<div style="color: ${color}">[${timestamp}] ${message}</div>`;
        connectionInfo.scrollTop = connectionInfo.scrollHeight;
    }
    
    //Logger.updateConnectionInfo(`Connecting to device: ${device.name || 'Unnamed Device'} (Attempt ${retryCount + 1})`);
    
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
        this.latestMidpoints = {
            xMid: null,         // from getLeftRight
            yMidLeft: null,     // from getToeHeel on left foot
            yMidRight: null     // from getToeHeel on right foot
        };
        this.dataBuffer = '';
        this.clearTimeout = null;
        this.isPlayback = false; 
    }
    
    updateSetting(key, value) {
        this.settings[key] = value;
        //Logger.log(CONFIG.DEBUG.BASIC, 'Settings', `Updated ${key} to ${value}`);
    }
}

// Data Processing Module
class DataProcessor {
  
    constructor(appState) {
        this.state = appState;
        //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Initialized with state:', {
        //    settings: this.state.settings
        //});
    }
    
    processFrame(frame) {
        //if (!frame) return;
        
        //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Processing frame', frame);        
        //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Raw frame received:', frame);
      
        // Clear previous timeout
        if (this.state.clearTimeout) {
            clearTimeout(this.state.clearTimeout);
        }        
      
        try {

            //const timestamp = Date.now();
            const { readings, cop } = this.parsePressureData(frame);          
            //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Parsed pressure data:', { readings, cop });
            //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Parsed data:', { readings, cop });

            //if (readings.length > 0) {
            if (readings && readings.length > 0) {
                const timestamp = Date.now();
              
                // Update histories
                this.updateDataHistory(readings, timestamp); 
                //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated data history');
                //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated data history:', {
                //    historyLength: this.state.visualization.dataHistory.length,
                //    latestReadings: readings
                //});
              
                if (cop) {
                    this.updateCopHistory(cop, timestamp);
                    //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated CoP history');
                    //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated CoP history:', {
                    //    historyLength: this.state.visualization.copHistory.length,
                    //    latestCoP: cop
                    //});
                  
                    // Calculate velocities
                    const velocities = this.calculateVelocities(cop, timestamp);
                    //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Calculated velocities:', velocities);
                  
                }

                // Process calibration data if needed
                if (this.state.calibration.isCalibrating) {
                    this.processCalibrationData(readings);
                }

                // Calculate forces and update histories
                const forces = this.calculateForces(readings);
                this.updateForceHistory(forces, timestamp);
                //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated force history');

                //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated histories', {
                //    dataHistoryLength: this.state.visualization.dataHistory.length,
                //    copHistoryLength: this.state.visualization.copHistory.length,
                //    forceHistoryLength: this.state.visualization.forceHistory.length
                //});
              
                return { readings, cop, forces, timestamp };
            }

        } catch (error) {
            //Logger.log(CONFIG.DEBUG.ERROR, 'DataProcessor', 'Error processing frame:', error);
        }
      
        return null;      
      
        // Set clear timeout
        this.state.clearTimeout = setTimeout(() => {
            this.clearData();
        }, this.state.settings.clearTime);
      
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
            //Logger.log(CONFIG.DEBUG.ERROR, 'DataProcessor', 'Error parsing data', error);
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
        
        if (debug == 3) {
            //console.log("DataProcessor.completeCalibration xRange:", xRange);
            console.log("DataProcessor.completeCalibration xRange:", this.state.calibration.data.xRange);
            //console.log("DataProcessor.completeCalibration yRange:", yRange);
            console.log("DataProcessor.completeCalibration yRange:", this.state.calibration.data.yRange);
        }

        //Logger.log(CONFIG.DEBUG.CALIBRATION, 'Calibration', 'Calibration completed:', this.state.calibration.data);
    }
  
    // Left/right foot split
      // Returns { left, right } arrays according to inversion and calibration/setting
    getLeftRight(readings) {
        //const isPlayback = this.state.isPlayback;
        const isPlayback = window.app.state.isPlayback;
        const method = this.state.app.state.weightDistMethod || 'perFrame';
        let xMid, invertX = this.state.settings.invertX;
        
        if (method === 'calibrated' && this.state.calibration.data) {
            xMid = this.state.calibration.data.xRange.mid;
        } else {
            const xVals = readings.map(r => r.x);
            xMid = Math.min(...xVals) + ((Math.max(...xVals) - Math.min(...xVals)) / 2);
        }
        
        //if (this.state.settings.invertX) {
        //    xMid = this.state.settings.sensorsX - xMid;
        //}
        
        // Store xMid for use elsewhere
        this.state.latestMidpoints.xMid = xMid;
      
        if (debug == 3) console.log("DataProcessor.getLeftRight xMid:", xMid);
      
        if (isPlayback) {
            return Utils.splitLeftRight(readings, xMid, false); //don't apply any inversion here during playback            
        }
        else {
            return Utils.splitLeftRight(readings, xMid, invertX);
        }
      
    }
  
    // Toe/heel split (used for one foot at a time)
    //getToeHeel(footReadings) {
    getToeHeel(footReadings, footLabel = "left") {
        //const isPlayback = this.state.isPlayback;
        const isPlayback = window.app.state.isPlayback;
        if (!footReadings.length) return { toe: [], heel: [] };
        const yVals = footReadings.map(r => r.y);
        const yMid = Math.min(...yVals) + (Math.max(...yVals) - Math.min(...yVals)) / 2;
        
        //if (!this.state.settings.invertY) {
        //    yMid = this.state.settings.sensorsY - yMid;
        //}
        
        // Store yMid for left/right foot
        if (footLabel === "left") {
            this.state.latestMidpoints.yMidLeft = yMid;
        } else if (footLabel === "right") {
            this.state.latestMidpoints.yMidRight = yMid;
        }
        
        if (debug == 3) console.log("DataProcessor.getToeHeel yMid:", yMid);
        
        const invertY = this.state.settings.invertY;
      
        if (isPlayback) {
            return Utils.splitToeHeel(footReadings, yMid, false);  //don't apply any inversion here during playback
        }
        else {
            return Utils.splitToeHeel(footReadings, yMid, invertY);
        }
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

        //Logger.log(CONFIG.DEBUG.BASIC, 'DataProcessor', 'Updated force history:', {
        //    historyLength: this.state.visualization.forceHistory.length,
        //    latestForces: forces
        //});
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
        const { left: leftFoot, right: rightFoot } = this.getLeftRight(readings);
        let totalPressure, leftPressure, rightPressure;
        if (useLinearFit) {
            totalPressure = readings.reduce((sum, r) => sum + r.value, 0);
            leftPressure = leftFoot.reduce((sum, r) => sum + r.value, 0);
            rightPressure = rightFoot.reduce((sum, r) => sum + r.value, 0);
        } else {
            totalPressure = readings.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
            leftPressure = leftFoot.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
            rightPressure = rightFoot.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
        }
        
        //Logger.log(CONFIG.DEBUG.WEIGHT_CALC, 'DataProcessor.calculateForces', 'Initializing visualizer');        
        if (debug == 2) {
            console.log("DataProcessor.calculateForces totalPressure:", totalPressure);
            console.log("DataProcessor.calculateForces leftPressure:", leftPressure);
            console.log("DataProcessor.calculateForces rightPressure:", rightPressure);
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
        
        Logger.updateConnectionInfo('All data cleared');
    }
  
}  //end of class DataProcessor



// Visualization Module
class Visualizer {
  
    constructor(appState) {
        this.state = appState;
        //Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Initializing visualizer');
        
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
            //Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Visualization components initialized');
        } catch (error) {
            //Logger.log(CONFIG.DEBUG.ERROR, 'Visualizer', 'Error initializing visualizer:', error);
        }
      
    }
  
    initializeHeatmap() {
        const container = document.getElementById('heatmap-container');
        const heatmapElement = document.getElementById('heatmap');
        
        if (!container || !heatmapElement) {
            throw new Error('Required heatmap elements not found in DOM');
        }
        
        //Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Container dimensions:', {
        //    width: container.offsetWidth,
        //    height: container.offsetHeight
        //});
        
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
            
            Logger.updateConnectionInfo('Heatmap instance created');
        } catch (error) {
            Logger.updateConnectionInfo('Error creating heatmap instance:', error);
            throw error;
        }
    }
  
    // Utility to create overlay layouts with titles and legend inside the plot area
    getOverlayLayout(titleText, xTitle, yTitle, showLegend = true) {
        return {
            title: '', // Remove default
            xaxis: { title: '', automargin: false, showgrid: true, zeroline: true },
            yaxis: { title: '', automargin: false, showgrid: true, zeroline: true },
            annotations: [
                {
                    text: titleText,
                    x: 0.5,
                    //y: 1.07,
                    y: 0.97,
                    xref: 'paper',
                    yref: 'paper',
                    showarrow: false,
                    //font: { size: 22 },
                    font: { size: 18 },
                    xanchor: 'center',
                    yanchor: 'bottom'
                },
                {
                    text: xTitle,
                    x: 0.5,
                    //y: -0.17,
                    y: 0.05,
                    xref: 'paper',
                    yref: 'paper',
                    showarrow: false,
                    //font: { size: 16 },
                    font: { size: 12 },
                    xanchor: 'center',
                    yanchor: 'top'
                },
                {
                    text: yTitle,
                    //x: -0.13,
                    x: 0.02,
                    y: 0.5,
                    xref: 'paper',
                    yref: 'paper',
                    showarrow: false,
                    //font: { size: 16 },
                    font: { size: 12 },
                    textangle: -90,
                    xanchor: 'center',
                    yanchor: 'middle'
                }
            ],
            legend: showLegend ? {
                orientation: 'h',
                x: 0.5,
                //y: 1.03,
                y: 0.9,
                xanchor: 'center',
                yanchor: 'bottom',
                bgcolor: 'rgba(255,255,255,0.7)',
                borderwidth: 0,
                //font: { size: 13 }
                font: { size: 9 }
            } : { visible: false },
            //margin: { l: 18, r: 8, t: 34, b: 18 },
            margin: { l: 36, r: 8, t: 18, b: 18 },  //dec top margin   //increased left margin to let 3 digits display
            plot_bgcolor: 'rgba(0,0,0,0)',
            paper_bgcolor: 'rgba(0,0,0,0)',
            autosize: true
        };
    }  
  
    initializeGraphs() {
        //using getOverlayLayout to overlay most of graph info including titles and axes labels  
      
        // CoP Graph (NO legend)
        Plotly.newPlot(
            'cop-graph',
            [],
            this.getOverlayLayout(
                'Center of Pressure (CoP) Graph',
                'X Position (coordinate)',
                'Y Position (coordinate)',
                false // no legend
            )
        );
        this.coPGraphInitialized = true;
      
        // Velocity Graph (legend horizontal, overlayed)
        Plotly.newPlot(
            'velocity-graph',
            [],
            this.getOverlayLayout(
                'CoP Velocity Components',
                'Time (s)',
                'Velocity (in/s)',
                true
            )
        );
        this.velocityGraphInitialized = true;
      
        // Force Graph (legend horizontal, overlayed)
        Plotly.newPlot(
            'force-graph',
            [],
            this.getOverlayLayout(
                `Vertical Ground Reaction Force ${window.useLinearFit ? '(Linear)' : '(Power Fit)'}`,
                'Time (s)',
                'Force (% of static weight)',
                true
            )
        );
        this.forceGraphInitialized = true;      
        
        //Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'All graphs initialized');
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
            //Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Skipping heatmap update - missing data or instance');
            return;
        }
      
        //console.log("Visualizer.updateHeatmap isPlayback:", this.state.isPlayback, this.state);

        //Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Updating heatmap with data:', data);
        
        const container = document.getElementById('heatmap-container');
      
        if (!container) {
            //Logger.log(CONFIG.DEBUG.ERROR, 'Visualizer', 'Heatmap container not found');
            return;
        }
      
        const scaleX = container.offsetWidth / this.state.settings.sensorsX;
        const scaleY = container.offsetHeight / this.state.settings.sensorsY;
      
        //skip inversion/scaling if playback
        //const isPlayback = this.state.isPlayback;
        const isPlayback = window.app.state.isPlayback;
      
        //console.log("Visualizer.updateHeatmap isPlayback = " + window.app.state.isPlayback);
      
        const processedData = data.readings.map(reading => {
            let x = reading.x;
            let y = reading.y;
            if (!isPlayback) {  //NOT playback data
                if (this.state.settings.invertX) {
                  x = this.state.settings.sensorsX - x;
                }
                if (!this.state.settings.invertY) {
                  y = this.state.settings.sensorsY - y;
                }
            }
            else {  //it IS playback data
                //pressure data has already been properly inverted... but that's for cartesian
                  //so for heatmap display, need to convert to screen coordinates (i.e. invert y again)
                y = this.state.settings.sensorsY - y; 
            }
            return {
                x: x * scaleX,
                y: y * scaleY,
                value: reading.value
            };
        });
      
        //Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'Processed heatmap data:', processedData);
        
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
        
        const isPlayback = window.app.state.isPlayback;
        const invertX = this.state.settings.invertX;
        const invertY = this.state.settings.invertY;
        const sensorsX = this.state.settings.sensorsX;
        const sensorsY = this.state.settings.sensorsY;
        
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
        
        let { xMid, avgYMid } = this.getStanceMidpoints();      
        //apply inversions to Xmid and avgYMid taking into account whether playback or not
        if (!isPlayback) {   //NOT playback data 
            if (invertX) {
              xMid = sensorsX - xMid;
            }
            if (invertY) {
              avgYMid = sensorsY - avgYMid;
            }
        }
        
        //not have xMid and avgYMid as display-ready values for showing the X and Y axis of the stance midpoint
        
        //draw horizontal X axis for stance midpoint at y=avgYMid
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, avgYMid);
        ctx.lineTo(canvas.width, avgYMid);
        ctx.stroke();
        
        //draw vertical Y axis for stance midpoint at X = xMid
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xMid, 0);
        ctx.lineTo(xMid, canvas.height);
        ctx.stroke();
        
        
    }
    
    drawCoPPath(ctx, canvas) {
        const copHistory = this.state.visualization.copHistory;
        if (!copHistory.length) return;
        
        //const isPlayback = this.state.isPlayback;
        const isPlayback = window.app.state.isPlayback;      
        
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;
        ctx.beginPath();
      
        //console.log("Visualizer.drawCoPPath isPlayback = " + isPlayback);
      
        copHistory.forEach((point, index) => {
            let x = point.x;
            let y = point.y;
            if (!isPlayback) {  //NOT playback data
                if (this.state.settings.invertX) {
                  x = this.state.settings.sensorsX - x;
                }
                if (!this.state.settings.invertY) {
                  y = this.state.settings.sensorsY - y;
                }
            }
            else {  //it IS playback data
                //CoP data has already been properly inverted... but that's for cartesian
                  //so for heatmap display, need to convert to screen coordinates (i.e. invert y again)
                y = this.state.settings.sensorsY - y;
            }
          
            const xScaled = (x * canvas.width) / this.state.settings.sensorsX;
            const yScaled = (y * canvas.height) / this.state.settings.sensorsY;
            if (index === 0) ctx.moveTo(xScaled, yScaled);
            else ctx.lineTo(xScaled, yScaled);
        });
      
        ctx.stroke();
    }
    
    drawCurrentCoP(ctx, canvas, cop) {
        let x = cop.x;
        let y = cop.y;
      
        //console.log("Visualizer.drawCurrentCoP this.state.isPlayback = " + window.app.state.isPlayback);
      
        //if (!this.state.isPlayback) {
        if (!window.app.state.isPlayback) {   //NOT playback data 
            if (this.state.settings.invertX) {
              x = this.state.settings.sensorsX - x;
            }
            if (!this.state.settings.invertY) {
              y = this.state.settings.sensorsY - y;
            }
        }
        else {  //it IS playback data            
            //pressure data has already been properly inverted... but that's for cartesian
              //so for heatmap display, need to convert to screen coordinates (i.e. invert y again)
            y = this.state.settings.sensorsY - y;
        }
        
        const xScaled = (x * canvas.width) / this.state.settings.sensorsX;
        const yScaled = (y * canvas.height) / this.state.settings.sensorsY;
        
        ctx.beginPath();
        ctx.fillStyle = 'yellow';
        ctx.arc(xScaled, yScaled, 4, 0, Math.PI * 2);
        ctx.fill();
    }
  
    formatTimeWithMillis(timestamp) {
        const date = new Date(timestamp);
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const millis = String(date.getMilliseconds()).padStart(3, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        if (hours === 0) hours = 12; // hour '0' should be '12'
        return `${hours}:${minutes}:${seconds}.${millis} ${ampm}`;
    }
  
    updateRawDataLive(readings, cop, timestamp, settings) {
        const rawData = document.getElementById('raw-data');
        if (!rawData) return;
        
        const timeString = this.formatTimeWithMillis(timestamp);
      
        //const isPlayback = this.state.isPlayback;
        const isPlayback = window.app.state.isPlayback;
      
        //console.log("Visualizer.updateRawDataLive isPlayback = " + isPlayback);
      
        const adjustedReadings = readings.map(reading => ({
            adjustedX: isPlayback ? reading.x : (settings.invertX ? (settings.sensorsX - reading.x) : reading.x),
            adjustedY: isPlayback ? reading.y : (settings.invertY ? (settings.sensorsY - reading.y) : reading.y),
            adjustedPressure: reading.value
        }));
        let copHtml = "";
        if (cop) {
            let adjustedCoPx = isPlayback ? cop.x : (settings.invertX ? (settings.sensorsX - cop.x) : cop.x);
            let adjustedCoPy = isPlayback ? cop.y : (settings.invertY ? (settings.sensorsY - cop.y) : cop.y);
            copHtml = `<div>CoP: x=${adjustedCoPx.toFixed(2)}, y=${adjustedCoPy.toFixed(2)}</div>`;
        }      

        // Compose readings HTML
        let readingsHtml = adjustedReadings.map(r =>
            `<div>x: ${r.adjustedX}, y: ${r.adjustedY}, pressure: ${r.adjustedPressure}</div>`
        ).join("");
      
        rawData.innerHTML = `            
            <div>[${timeString}]</div>
            <div>Latest active sensors (${readings.length}):</div>
            ${readingsHtml}
            ${copHtml}
        `;
      
    }
    
    // --- Encapsulate CoP coordinate inversion ---
    getInvertedCoPCoords(point, invertX, invertY, sensorsX, sensorsY, isPlayback) {
        if (isPlayback) return { x: point.x, y: point.y };
        return {
            x: invertX ? (sensorsX - point.x) : point.x,
            y: invertY ? (sensorsY - point.y) : point.y
        };
    }
    
    getStanceMidpoints() {
        const { xMid, yMidLeft, yMidRight } = this.state.latestMidpoints;
        const avgYMid = (yMidLeft + yMidRight) / 2;
        return { xMid, avgYMid };
    }
  
    updateCoPGraph() {
        const copHistory = this.state.visualization.copHistory;
        if (!copHistory || copHistory.length === 0) {
            //Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'No CoP history to display');
            return;
        }
        const inchesPerSensorX = this.state.settings.matWidth / this.state.settings.sensorsX;
        const inchesPerSensorY = this.state.settings.matHeight / this.state.settings.sensorsY;
        const copMode = this.state.app.state.copMode || 'normal';
        //const isPlayback = this.state.isPlayback;
        const isPlayback = window.app.state.isPlayback;
        const invertX = this.state.settings.invertX;
        const invertY = this.state.settings.invertY;
        const sensorsX = this.state.settings.sensorsX;
        const sensorsY = this.state.settings.sensorsY;
        
        //const { xMid, avgYMid } = this.getStanceMidpoints();
        let { xMid, avgYMid } = this.getStanceMidpoints();
      
        //apply inversions to Xmid and avgYMid taking into account whether playback or not
        if (!isPlayback) {   //NOT playback data 
            if (invertX) {
              xMid = sensorsX - xMid;
            }
            if (invertY) {
              avgYMid = sensorsY - avgYMid;
            }
        }
        
        if (debug == 3) {
            console.log("Visualizer.updateCoPGraph corrected xMid:", xMid);
            console.log("Visualizer.updateCoPGraph corrected avgYMid:", avgYMid);          
        }
        
        //console.log("Visualizer.updateCoPGraph isPlayback = " + isPlayback);

        let xValues, yValues, title, xAxisTitle, yAxisTitle;

        if (copMode === 'normal') {
              // Lateral (X): negative is right foot, positive is left foot (reverse sign)
              // Heel-Toe (Y): positive towards toe, negative towards heel
            
            //xValues = copHistory.map(point => this.getInvertedCoPCoords(point, invertX, invertY, sensorsX, sensorsY, isPlayback).x);
            //yValues = copHistory.map(point => this.getInvertedCoPCoords(point, invertX, invertY, sensorsX, sensorsY, isPlayback).y);            
            xValues = copHistory.map(point => -(this.getInvertedCoPCoords(point, invertX, invertY, sensorsX, sensorsY, isPlayback).x - xMid) * inchesPerSensorX);
            yValues = copHistory.map(point => (this.getInvertedCoPCoords(point, invertX, invertY, sensorsX, sensorsY, isPlayback).y - avgYMid) * inchesPerSensorY);
            
            title = 'Center of Pressure (CoP) Graph';
            //xAxisTitle = 'X Position (coordinate)';
            //yAxisTitle = 'Y Position (coordinate)';
            xAxisTitle = 'Lateral (inches)';
            yAxisTitle = 'Heel-Toe (inches)';
        } else {
            // Delta mode
            const basePoint = this.getInvertedCoPCoords(copHistory[0], invertX, invertY, sensorsX, sensorsY, isPlayback);
            xValues = copHistory.map(point =>
                (this.getInvertedCoPCoords(point, invertX, invertY, sensorsX, sensorsY, isPlayback).x - basePoint.x) * inchesPerSensorX);
            yValues = copHistory.map(point =>
                (this.getInvertedCoPCoords(point, invertX, invertY, sensorsX, sensorsY, isPlayback).y - basePoint.y) * inchesPerSensorY);
            title = 'Center of Pressure (CoP) Delta';
            xAxisTitle = 'X Delta (inches)';
            yAxisTitle = 'Y Delta (inches)';
        }

        const trace = {
            x: xValues,
            y: yValues,
            mode: 'lines+markers',
            type: 'scattergl',
            marker: { color: 'blue', size: 6 }
        };

        const layout = this.getOverlayLayout(title, xAxisTitle, yAxisTitle, false);      
        if (copMode === 'normal') {
            layout.xaxis.autorange = 'reversed';          
        }
        
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
        
        // For "normal" mode, lateral (vx) should be NEGATIVE for rightward movement, POSITIVE for leftward
        // So, reverse the sign of vx
        const copMode = this.state.app.state.copMode || 'normal';
        
        let lateralVel, heelToeVel;
        if (copMode === 'normal') {
            lateralVel = velocityHistory.map(point => -point.vx);
            heelToeVel = velocityHistory.map(point => point.vy);
        } else {
            lateralVel = velocityHistory.map(point => point.vx);
            heelToeVel = velocityHistory.map(point => point.vy);
        }
        
        const traces = [
            {
                x: times,
                //y: velocityHistory.map(point => point.vx),
                y: lateralVel,
                mode: 'lines+markers',
                type: 'scattergl',  //uses WebGL to use GPU for higher performance
                //name: 'Lateral Velocity',
                name: 'Lateral',
                line: { color: 'blue' },
                marker: { size: 6, color: 'blue' }
            },
            {
                x: times,
                //y: velocityHistory.map(point => point.vy),
                y: heelToeVel,
                mode: 'lines+markers',
                type: 'scattergl',  //uses WebGL to use GPU for higher performance
                //name: 'Heel-Toe Velocity',
                name: 'Heel-Toe',
                line: { color: 'red' },
                marker: { size: 6, color: 'red' }
            }
        ];
        
        //using getOverlayLayout to overlay most of graph info including titles and axes labels
        const layout = this.getOverlayLayout(
            'CoP Velocity Components',
            'Time (s)',
            'Velocity (in/s)',
            true
        );
        layout.xaxis.autorange = 'reversed';
        layout.xaxis.range = [-(this.state.settings.copHistoryLength / 30), 0];      
        
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
        
        //this is the forceHistory built with DataProcessor class with the appropriate history length and all
        const forceHistory = this.state.visualization.forceHistory;  
        if (forceHistory.length < 2) return;
        
        const mostRecentTime = forceHistory[forceHistory.length - 1].timestamp;
        //changes the times to relative times:
        const times = forceHistory.map(point => (point.timestamp - mostRecentTime) / 1000);
        
        const referenceForce = this.state.recording.staticForceReference || forceHistory[0].total;
        
        if (debug == 2) {
            console.log("Visualizer.updateForceGraph - forceHistory:", forceHistory);
            console.log("Visualizer.updateForceGraph - referenceForce:", referenceForce);
        }
        
        const forcesHistory = forceHistory.map(f => {
              // Use the same calculation as DataProcessor, but readings are already inverted/scaled
              const readings = f.pressure;          
              //this determines the xMid based on selected calibration method and also decides to invertX or not based on isPlayback
              const { left: leftFoot, right: rightFoot } = DataProcessor.getLeftRight(readings);
              let total, left, right;
              if (useLinearFit) {
                  total = readings.reduce((sum, r) => sum + r.value, 0);
                  left = leftFoot.reduce((sum, r) => sum + r.value, 0);
                  right = rightFoot.reduce((sum, r) => sum + r.value, 0);
              } else {
                  total = readings.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
                  left = leftFoot.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
                  right = rightFoot.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
              }
              return { total, left, right, timestamp: f.timestamp };                
          });
        
        //let leftForces, rightForces, totalForces;
        
          //per-frame (sum of left foot z values / sum of all z values):
        const leftForces = forcesHistory.map(point => (point.left / point.total) * 100);

          //per-frame (sum of right foot z values / sum of all z values):
        const rightForces = forcesHistory.map(point => (point.right / point.total) * 100);

          //sum of all z values / sum of all z values of first frame)
        //const totalForces = forcesHistory.map(point => (point.total / referenceForce) * 100);

          // per-frame ((sum of all right foot values + sum of all left foot values) / sum of all z values)
            //this should be basically a per-frame method of calc the 'total' relative force, 
            //and it should always be 100% (I think)                
        const totalForces = forcesHistory.map(point => ((point.right + point.left) / point.total) * 100);
        
    
        /*
        //if (window.useLinearFit) {
        if (useLinearFit) {
            leftForces = forceHistory.map(point => (point.left / point.total) * 100);            
            rightForces = forceHistory.map(point => (point.right / point.total) * 100);
          
              //sum of all z values in current frame / referenceForce  
                //need to have better algorithm for determining referenceForce
            //totalForces = forceHistory.map(point => (point.total / referenceForce) * 100);
              //more like a per-frame method of total force ... should always be 100%
            totalForces = forceHistory.map(point => ((point.left + point.right) / point.total) * 100);
        } else {
          
            //leftForces = forceHistory.map(point => (point.left / point.total) * 100);
            //rightForces = forceHistory.map(point => (point.right / point.total) * 100);
            //totalForces = forceHistory.map(point => (point.total / referenceForce) * 100);
          
            // Use power fit for left, right, and total
            leftForces = forceHistory.map(point => {
                const leftPower = Math.pow(
                    (point.left / CONFIG.CALIBRATION.POWER_FIT_COEFFICIENT),
                    1 / CONFIG.CALIBRATION.POWER_FIT_EXPONENT
                );
                const totalPower = Math.pow(
                    (point.total / CONFIG.CALIBRATION.POWER_FIT_COEFFICIENT),
                    1 / CONFIG.CALIBRATION.POWER_FIT_EXPONENT
                );
                return totalPower !== 0 ? (leftPower / totalPower) * 100 : 0;
            });
            rightForces = forceHistory.map(point => {
                const rightPower = Math.pow(
                    (point.right / CONFIG.CALIBRATION.POWER_FIT_COEFFICIENT),
                    1 / CONFIG.CALIBRATION.POWER_FIT_EXPONENT
                );
                const totalPower = Math.pow(
                    (point.total / CONFIG.CALIBRATION.POWER_FIT_COEFFICIENT),
                    1 / CONFIG.CALIBRATION.POWER_FIT_EXPONENT
                );
                return totalPower !== 0 ? (rightPower / totalPower) * 100 : 0;
            });
            
            //this is not a very good way to calculate... if not just flat out wrong!!!
            totalForces = forceHistory.map(point => {
                const totalPower = Math.pow(
                    (point.total / CONFIG.CALIBRATION.POWER_FIT_COEFFICIENT),
                    1 / CONFIG.CALIBRATION.POWER_FIT_EXPONENT
                );
                const refPower = Math.pow(
                    (referenceForce / CONFIG.CALIBRATION.POWER_FIT_COEFFICIENT),
                    1 / CONFIG.CALIBRATION.POWER_FIT_EXPONENT
                );
                return refPower !== 0 ? (totalPower / refPower) * 100 : 0;
            });
            
            if (debug == 2) {
                console.log("Visualizer.updateForceGraph - leftForces:", leftForces);
                console.log("Visualizer.updateForceGraph - rightForces:", rightForces);
                console.log("Visualizer.updateForceGraph - totalForces:", totalForces);
            }            
            
        }
        */
              
      
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
        
        //using getOverlayLayout to overlay most of graph info including titles and axes labels
        const layout = this.getOverlayLayout(
            `Vertical Ground Reaction Force ${window.useLinearFit ? '(Linear)' : '(Power Fit)'}`,
            'Time (s)',
            'Force (% of static weight)',
            true
        );
        layout.xaxis.autorange = 'reversed';
        layout.xaxis.range = [-(this.state.settings.copHistoryLength / 30), 0];      
        
        //Plotly.newPlot('force-graph', traces, layout);
        
        // PATCH: Use Plotly.react for efficient updates
        if (this.forceGraphInitialized) {
            Plotly.react('force-graph', traces, layout);
        } else {
            Plotly.newPlot('force-graph', traces, layout);
            this.forceGraphInitialized = true;
        }
        
    }
    
    // Helper for inverting for display (not for logic/splits)
    _invertForDisplay(r, settings, isPlayback) {
        if (isPlayback) return r;
        return {
            ...r,
            x: settings.invertX ? (settings.sensorsX - r.x) : r.x,
            y: settings.invertY ? (settings.sensorsY - r.y) : r.y,
        };
    }
    
    updatePressureDistributionLive(readings, cop, settings, dataProcessor) {
        if (!readings || readings.length === 0) return;
      
        // --- LOGIC SPLITS: always use raw readings ---
          // Use DataProcessor logic for left/right split        
        //const { left: leftFoot, right: rightFoot } = dataProcessor.getLeftRight(adjReadings);  //this did double inversion
        
        //this returns the readings (x,y,z) for the left foot and for the right foot
        const { left: leftFoot, right: rightFoot } = dataProcessor.getLeftRight(readings);

        // Value function
        //const useLinearFit = (typeof window.useLinearFit !== "undefined" ? window.useLinearFit : true);        
        const useLinearFitFlag = window.useLinearFit;
        
        //const valueFunc = useLinearFitFlag ? (r) => r.value : (r) => Math.pow(
        //        (r.value / (settings.POWER_FIT_COEFFICIENT || 1390.2)),
        //        1 / (settings.POWER_FIT_EXPONENT || 0.1549));        
        const valueFunc = useLinearFitFlag ? (r) => r.value : (r) => Utils.zValueToWeight(r.value);
        
        // Toe/heel split per foot (always use raw readings)
          // Toe/heel split using DataProcessor method
        //function toeHeelPerc(footReadings) {
        function toeHeelPerc(footReadings, footLabel = "left") {
            if (!footReadings.length) return { toe: 0, heel: 0 };
            //const { toe, heel } = dataProcessor.getToeHeel(footReadings);
            const { toe, heel } = dataProcessor.getToeHeel(footReadings, footLabel);
          
            const toeSum = toe.reduce((sum, r) => sum + valueFunc(r), 0);
            const heelSum = heel.reduce((sum, r) => sum + valueFunc(r), 0);
            const footTotal = footReadings.reduce((sum, r) => sum + valueFunc(r), 0);
            return {
                //toe: footTotal ? ((toeSum / footTotal) * 100).toFixed(1) : "0.0",
                //heel: footTotal ? ((heelSum / footTotal) * 100).toFixed(1) : "0.0"
                toe: footTotal ? ((toeSum / footTotal) * 100).toFixed(0) : "0",
                heel: footTotal ? ((heelSum / footTotal) * 100).toFixed(0) : "0"
            };
        }
      
        // Forces are always calculated using raw readings
        const forces = dataProcessor.calculateForces(readings);  //returns sum of left foot z values, sum of right foot z values, and sum of total (all z values)
        const total = forces.total;  //sum of all z readings for this frame
        //const leftTotal = forces.left;  //sum of left foot z readings for this frame
        //const rightTotal = forces.right;  //sum or right foot z readings for this frame

        const leftTotal = leftFoot.reduce((sum, r) => sum + valueFunc(r), 0);
        const rightTotal = rightFoot.reduce((sum, r) => sum + valueFunc(r), 0);

        //const leftPercent = total ? ((leftTotal / total) * 100).toFixed(1) : "0.0";        
        //const rightPercent = total ? ((rightTotal / total) * 100).toFixed(1) : "0.0";
        const leftPercent = total ? ((leftTotal / total) * 100).toFixed(0) : "0";
        const rightPercent = total ? ((rightTotal / total) * 100).toFixed(0) : "0";

        document.getElementById('front-percentage').textContent = leftPercent;
        document.getElementById('back-percentage').textContent = rightPercent;

        // Per-foot toe/heel
        //const leftTH = toeHeelPerc(leftFoot);        
        //const rightTH = toeHeelPerc(rightFoot);
        const leftTH = toeHeelPerc(leftFoot, "left");
        const rightTH = toeHeelPerc(rightFoot, "right");

        document.getElementById('front-toe-percentage').textContent = `Toe: ${leftTH.toe}%`;
        document.getElementById('front-heel-percentage').textContent = `Heel: ${leftTH.heel}%`;
        document.getElementById('back-toe-percentage').textContent = `Toe: ${rightTH.toe}%`;
        document.getElementById('back-heel-percentage').textContent = `Heel: ${rightTH.heel}%`;
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
      
        // Clear graphs - updated for titles and axes titles overlay
        // CoP Graph (NO legend)
        Plotly.newPlot(
            'cop-graph',
            [],
            this.getOverlayLayout(
                'Center of Pressure (CoP) Graph',
                'X Position (coordinate)',
                'Y Position (coordinate)',
                false // no legend
            )
        );        
      
        // Velocity Graph (legend horizontal, overlayed)
        Plotly.newPlot(
            'velocity-graph',
            [],
            this.getOverlayLayout(
                'CoP Velocity Components',
                'Time (s)',
                'Velocity (in/s)',
                true
            )
        );        
      
        // Force Graph (legend horizontal, overlayed)
        Plotly.newPlot(
            'force-graph',
            [],
            this.getOverlayLayout(
                `Vertical Ground Reaction Force ${window.useLinearFit ? '(Linear)' : '(Power Fit)'}`,
                'Time (s)',
                'Force (% of static weight)',
                true
            )
        );

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

        //Logger.log(CONFIG.DEBUG.BASIC, 'Visualizer', 'All visualizations cleared');
      
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
            
            //Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 
            //    `Connecting to device: ${device.name || 'Unnamed Device'} (Attempt ${retryCount + 1})`
            //);
            
            Logger.updateConnectionInfo(`Connecting to device: ${device.name || 'Unnamed Device'} (Attempt ${retryCount + 1})`);
            
            device.addEventListener('gattserverdisconnected', this.handleDisconnection.bind(this));
            
            const server = await device.gatt.connect();
            //Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'GATT server connected');
            Logger.updateConnectionInfo('GATT server connected');
            
            // Try Microchip UART first, then Nordic UART
            let service;
            try {
                service = await server.getPrimaryService(CONFIG.BLE.MICROCHIP_UART_SERVICE);
                Logger.updateConnectionInfo('Connected using Microchip UART Service');
                this.state.bluetooth.characteristic = await service.getCharacteristic(CONFIG.BLE.MICROCHIP_UART_TX);
            } catch {
                service = await server.getPrimaryService(CONFIG.BLE.NORDIC_UART_SERVICE);
                Logger.updateConnectionInfo('Connected using Nordic UART Service');
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
            Logger.updateConnectionInfo('Notifications started - ready to receive data');
            
        } catch (error) {
            Logger.updateConnectionInfo(`Connection failed (Attempt ${retryCount + 1})`, error);
            
            if (retryCount < this.maxRetryAttempts) {
                Logger.updateConnectionInfo(`Retrying connection in ${this.retryDelay/1000} seconds...`);
                setTimeout(() => this.connectToDevice(device, retryCount + 1), this.retryDelay);
            } else {
                Logger.updateConnectionInfo('Maximum retry attempts reached');
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
        //Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Raw data received as bytes:', rawData);
        //Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Decoded chunk:', chunk);
        
        this.state.dataBuffer += chunk;
        
        let newlineIndex;
        while ((newlineIndex = this.state.dataBuffer.indexOf('\n')) !== -1) {
            const frame = this.state.dataBuffer.substring(0, newlineIndex).trim();
            this.state.dataBuffer = this.state.dataBuffer.substring(newlineIndex + 1);
            
            //Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Complete frame extracted:', frame);
            //Logger.log(CONFIG.DEBUG.BASIC, 'Bluetooth', 'Frame extracted:', frame);          
            
            if (frame) {
                try {
                    // Make sure we're calling the right instance method
                    if (this.state.app && typeof this.state.app.processFrame === 'function') {
                        this.state.app.processFrame(frame);
                    } else {
                        //Logger.log(CONFIG.DEBUG.ERROR, 'Bluetooth', 'Invalid app reference or processFrame method');
                    }
                } catch (error) {
                    //Logger.log(CONFIG.DEBUG.ERROR, 'Bluetooth', 'Error processing frame:', error);
                }
            }          
          
        }
      
    }
    
    handleDisconnection(event) {
        const device = event.target;
        
        if (device.autoReconnectEnabled) {
            Logger.updateConnectionInfo('Device disconnected unexpectedly!');
        }
        
        this.state.bluetooth.isConnected = false;
        this.state.bluetooth.characteristic = null;
        this.state.dataBuffer = '';
        
        this.updateUIForConnection(false);
        
        if (device.autoReconnectEnabled) {
            Logger.updateConnectionInfo('Attempting to reconnect...');
            this.connectToDevice(device).catch(error => {
                Logger.updateConnectionInfo('Auto-reconnect failed', error);
            });
        } else {
            Logger.updateConnectionInfo('Device disconnected - scan to reconnect');
        }
    }
    
    async disconnect() {
        try {
            if (this.state.bluetooth.device && this.state.bluetooth.device.gatt.connected) {
                this.state.bluetooth.device.autoReconnectEnabled = false;
                await this.state.bluetooth.device.gatt.disconnect();
                
                Logger.updateConnectionInfo('Device disconnected successfully');
                
                this.state.bluetooth.isConnected = false;
                this.state.bluetooth.characteristic = null;
                this.state.dataBuffer = '';
                
                // Clear visualizations
                this.state.app.visualizer.clearAll();
                this.updateUIForConnection(false);
            }
          
        } catch (error) {
            Logger.updateConnectionInfo('Disconnect failed', error);
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
        // --- PATCH: Store invert state at start of recording ---
        //this.state.recording.invertXAtRecord = this.state.settings.invertX;
        //this.state.recording.invertYAtRecord = this.state.settings.invertY;
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
        
        // PATCH: Display CoP stats for the completed swing immediately          
        if (this.state.recording.copPathData && this.state.recording.copPathData.length > 1) {
            this.state.app.playbackManager.updateCoPStatsDisplay(
                this.state.recording.copPathData,
                this.state.recording.copPathData.length - 1
            );
        }        
    }
  
}  //end of class RecordingManager 


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
                this.startPlayback(this.playDirection || 1);
            }
        });
    }

    initializePlayback() {
      
        //this.state.isPlayback = true;
        window.app.state.isPlayback = true;
        
        //console.log("PlaybackManager starting playback, setting state.isPlayback to true", this.state);
        
        //console.log("PlaybackManager.initializePlayback window.app.state.isPlayback = " + window.app.state.isPlayback);
      
        if (!this.state.recording.playbackData?.length) {
            //Logger.log(CONFIG.DEBUG.ERROR, 'Playback', 'No recorded data to playback');
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

        this.currentFrameIndex = frameIndex;
        const frame = this.state.recording.playbackData[frameIndex];
        const startTime = this.state.recording.playbackData[0].timestamp;
        const frameTime = (frame.timestamp - startTime) / 1000;

        document.getElementById('timeDisplay').textContent = frameTime.toFixed(3) + 's';
        document.getElementById('frameSlider').value = frameIndex;

        this.updateVisualizationsForFrame(frame, frameIndex);
    }
    
    
    //before fix for playback data inverting incorrectly    
    // --- PATCH: Main playback visualization update logic ---
    updateVisualizationsForFrame(frame, frameIndex) {
        if (!frame) {
            Logger.log(CONFIG.DEBUG.ERROR, 'Playback', 'No frame data provided');
            return;
        }

      // 1. Prepare playback history arrays for visualizations
        // These arrays are already adjusted for inversion/scaling in recording, so pass as-is.
        const startTime = this.state.recording.playbackData[0].timestamp;                

        // Build CoP history up to this frame for CoP path drawing (and velocity)
        const copHistory = this.state.recording.playbackData.slice(0, frameIndex + 1)
            .map(f => ({
                ...f.cop,
                timestamp: f.timestamp
            }));        
        this.state.visualization.copHistory = copHistory;

        // Build pressure history up to this frame if needed
        const dataHistory = this.state.recording.playbackData.slice(0, frameIndex + 1)
            .map(f => ({
                timestamp: f.timestamp,
                readings: f.pressure
            }));

      // 2. Update Visualizer's temporary state for playback
        // (This avoids overwriting live data, and all updates use these arrays)
        //this.state.visualization.dataHistory = dataHistory;        
        this.state.visualization.dataHistory = [{
            timestamp: frame.timestamp,
            readings: frame.pressure
        }];        

      // 3. Update heatmap (pass current readings, CoP, and full CoP path for overlay)
        this.state.app.visualizer.updateHeatmap({
            readings: frame.pressure,
            cop: frame.cop
        });
        // Overlay path and dot will use .copHistory

        // Get total duration for x-axis range
        const totalDuration = (this.state.recording.playbackData[this.state.recording.playbackData.length - 1].timestamp - startTime) / 1000;
              
      // 4. Update CoP graph
        this.state.app.visualizer.updateCoPGraph();
      
      // 5. Update velocity graph
        //this.state.app.visualizer.updateVelocityGraph();
        
        // Build velocity history for this playback segment
        const velocityHistory = [];
        for (let i = 1; i < copHistory.length; i++) {
            const prev = copHistory[i - 1];
            const curr = copHistory[i];
            const dt = (curr.timestamp - prev.timestamp) / 1000;
            if (dt === 0) continue;
          
            const inchesPerSensorX = this.state.settings.matWidth / this.state.settings.sensorsX;
            const inchesPerSensorY = this.state.settings.matHeight / this.state.settings.sensorsY;                    
          
            const dx = (curr.x - prev.x) * inchesPerSensorX;
            const dy = (curr.y - prev.y) * inchesPerSensorY;
            
            velocityHistory.push({
                timestamp: curr.timestamp,
                x: curr.x,
                y: curr.y,
                vx: dx / dt,
                vy: dy / dt
            });
        }
        // Pad with initial zero velocity
        if (copHistory.length)
            velocityHistory.unshift({
                timestamp: copHistory[0].timestamp,
                x: copHistory[0].x,
                y: copHistory[0].y,
                vx: 0,
                vy: 0
            });
        
        this.state.visualization.velocityHistory = velocityHistory;
        
        const copMode = this.state.app.state.copMode || 'normal';
      
        let lateralVel, heelToeVel;
        if (copMode === 'normal') {
            lateralVel = velocityHistory.map(point => -point.vx);
            heelToeVel = velocityHistory.map(point => point.vy);
        } else {
            lateralVel = velocityHistory.map(point => point.vx);
            heelToeVel = velocityHistory.map(point => point.vy);
        }  
      
        // Update velocity graph with modified layout
        const velocityTraces = [
            {
                x: velocityHistory.map(point => (point.timestamp - startTime) / 1000),
                //y: velocityHistory.map(point => point.vx),
                y: lateralVel,
                mode: 'lines+markers',
                type: 'scattergl',
                name: 'Lateral',
                line: { color: 'blue' },
                marker: { size: 6, color: 'blue' }
            },
            {
                x: velocityHistory.map(point => (point.timestamp - startTime) / 1000),
                //y: velocityHistory.map(point => point.vy),
                y: heelToeVel,
                mode: 'lines+markers',
                type: 'scattergl',
                name: 'Heel-Toe',
                line: { color: 'red' },
                marker: { size: 6, color: 'red' }
            }
        ];

        const velocityLayout = this.state.app.visualizer.getOverlayLayout(
            'CoP Velocity Components',
            'Time (s)',
            'Velocity (in/s)',
            true
        );
        velocityLayout.xaxis.range = [0, totalDuration];

        Plotly.react('velocity-graph', velocityTraces, velocityLayout);

      // 6. Update force graph
        //this.state.app.visualizer.updateForceGraph();
        
        //const xMid = this.state.latestMidpoints.xMid;  //retrieves the latest xMid x midpoint calculated        
        // Build force history up to this frame
        const forcesHistory = this.state.recording.playbackData.slice(0, frameIndex + 1)
            .map(f => {
                // Use the same calculation as DataProcessor, but readings are already inverted/scaled
                const readings = f.pressure;              
                
                // Calculate left/right split at x midpoint
                //const xVals = readings.map(r => r.x);
                //const minX = Math.min(...xVals), maxX = Math.max(...xVals);
                //const xMid = minX + (maxX - minX) / 2;
              
                //this didn't take into account the invertX setting when determining leftFoot and rightFoot
                //let leftFoot = readings.filter(r => r.x <= xMid);
                //let rightFoot = readings.filter(r => r.x > xMid);
                
                //still run the readings thru the Utils.splitLeftRight to determine which is left and which is right based on inversion
                  // Always use invertX = false here because playback data is already in display-space
                //const { left: leftFoot, right: rightFoot } = Utils.splitLeftRight(readings, xMid, false);
                
                //this determines the xMid based on selected calibration method and also decides to invertX or not based on isPlayback
                const { left: leftFoot, right: rightFoot } = DataProcessor.getLeftRight(readings);
                                
                let total, left, right;
              
                if (useLinearFit) {
                    total = readings.reduce((sum, r) => sum + r.value, 0);
                    left = leftFoot.reduce((sum, r) => sum + r.value, 0);
                    right = rightFoot.reduce((sum, r) => sum + r.value, 0);
                } else {
                    total = readings.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
                    left = leftFoot.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
                    right = rightFoot.reduce((sum, r) => sum + Utils.zValueToWeight(r.value), 0);
                }
                return { total, left, right, timestamp: f.timestamp };
                
            });        
        this.state.visualization.forceHistory = forcesHistory;
        
        
        // Update force graph with modified layout
        const forceTraces = [
            {
                x: forcesHistory.map(point => (point.timestamp - startTime) / 1000),
                
                //per-frame (sum of left foot z values / sum of all z values)
                y: forcesHistory.map(point => (point.left / point.total) * 100),  
                
                mode: 'lines+markers',
                type: 'scattergl',
                name: 'Left',
                line: { color: 'blue' },
                marker: { size: 6, color: 'blue' }
            },
            {
                x: forcesHistory.map(point => (point.timestamp - startTime) / 1000),
                
                //per-frame (sum of right foot z values / sum of all z values)
                y: forcesHistory.map(point => (point.right / point.total) * 100), 
              
                mode: 'lines+markers',
                type: 'scattergl',
                name: 'Right',
                line: { color: 'red' },
                marker: { size: 6, color: 'red' }
            },
            {
                x: forcesHistory.map(point => (point.timestamp - startTime) / 1000),
                
                // per-frame (sum of all z values / sum of all z values of first frame)
                //y: forcesHistory.map(point => (point.total / forcesHistory[0].total) * 100), 
                
                // per-frame ((sum of all right foot values + sum of all left foot values) / sum of all z values)
                  //this should be basically a per-frame method of calc the 'total' relative force, 
                  //and it should always be 100% (I think)                
                y: forcesHistory.map(point => ((point.right + point.left) / point.total) * 100), 
                
                mode: 'lines+markers',
                type: 'scattergl',
                name: 'Total',
                line: { color: 'green' },
                marker: { size: 6, color: 'green' }
            }
        ];

        const forceLayout = this.state.app.visualizer.getOverlayLayout(
            `Vertical Ground Reaction Force ${window.useLinearFit ? '(Linear)' : '(Power Fit)'}`,
            'Time (s)',
            'Force (% of static weight)',
            true
        );
        forceLayout.xaxis.range = [0, totalDuration];

        Plotly.react('force-graph', forceTraces, forceLayout);      
      

      // 7. Update pressure distribution (now with heel/toe splits)
        this.state.app.visualizer.updatePressureDistributionLive(
            frame.pressure,
            frame.cop,
            this.state.settings,
            this.state.app.dataProcessor // for value function and calibration info
        );

        // 8. Update raw data panel
        this.state.app.visualizer.updateRawDataLive(
            frame.pressure,
            frame.cop,
            frame.timestamp,
            this.state.settings
        );

        //have this here only if want to update the CoP stats on a per-frame basis during playback
        //comment this out to have the CoP Stats update once when the swing finishes recording and then stay the same
        //this.updateCoPStatsDisplay(copHistory, frameIndex);

    }  //end of updateVisualizationsForFrame method
  
  
    updateCoPStatsDisplay(copHistory, frameIndex) {
        // Default to playback's full path unless a subset is wanted
        if (!copHistory || copHistory.length < 2) {
            // Clear
            [
                'pathDistance', 'avgSpeed', 'maxSpeed',
                'totalTime', 'xDistance', 'yDistance'
            ].forEach(id => document.getElementById(id).textContent = '0.00');
            return;
        }

        // Compute path length, avg/max speed, etc
        let pathLen = 0, maxSpeed = 0, xDist = 0, yDist = 0, totalTime = 0, speeds = [];
    
        let xMin = Infinity, xMax = -Infinity;
        let yMin = Infinity, yMax = -Infinity;

        const inchesPerSensorX = this.state.settings.matWidth / this.state.settings.sensorsX;
        const inchesPerSensorY = this.state.settings.matHeight / this.state.settings.sensorsY;

        for (let i = 1; i < copHistory.length; ++i) {
            const a = copHistory[i - 1], b = copHistory[i];
            const dx = (b.x - a.x) * inchesPerSensorX;
            const dy = (b.y - a.y) * inchesPerSensorY;
            const dt = (b.timestamp - a.timestamp) / 1000;
            pathLen += Math.sqrt(dx * dx + dy * dy);
            if (dt > 0) {
                const speed = Math.sqrt(dx * dx + dy * dy) / dt;
                maxSpeed = Math.max(maxSpeed, speed);
                speeds.push(speed);
            }
            
            // Track min/max coordinates  (for x and y bounding box of CoP data)
            xMin = Math.min(xMin, copHistory[i].x);
            xMax = Math.max(xMax, copHistory[i].x);
            yMin = Math.min(yMin, copHistory[i].y);
            yMax = Math.max(yMax, copHistory[i].y);
            
        }
        
        Logger.updateConnectionInfo(`Recorded History Length = ${copHistory.length} frames.`);
      
        // X dist. (lateral distance) and Y dist (heel-toe distance)
          //the two below show the dist of the finish point from the start point... not quite what I want
        xDist = Math.abs((copHistory[copHistory.length - 1].x - copHistory[0].x) * inchesPerSensorX);
        yDist = Math.abs((copHistory[copHistory.length - 1].y - copHistory[0].y) * inchesPerSensorY);
        
        //I want the x and y bounding box for the CoP data
        
        totalTime = (copHistory[copHistory.length - 1].timestamp - copHistory[0].timestamp) / 1000;
        
        
        const avgSpeed = speeds.length ? (speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;

        document.getElementById('pathDistance').textContent = pathLen.toFixed(2);
        document.getElementById('avgSpeed').textContent = avgSpeed.toFixed(2);
        document.getElementById('maxSpeed').textContent = maxSpeed.toFixed(2);
        //max lateral speed (vel)
        //max heel-toe speed (vel)
        document.getElementById('totalTime').textContent = totalTime.toFixed(2);
        //document.getElementById('xDistance').textContent = xDist.toFixed(2);
        document.getElementById('xDistance').textContent = (xMax - xMin).toFixed(2);
        //document.getElementById('yDistance').textContent = yDist.toFixed(2);
        document.getElementById('yDistance').textContent = (yMax - yMin).toFixed(2);
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
        this.playDirection = 1;
        this.isPlaying = true;
        document.getElementById('playPause').textContent = '⏸';
        this.startPlayback(1);
    }

    playReverse() {
        if (this.isPlaying) return;
        this.playDirection = -1;
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
  
}  //end of PlaybackManager class


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
        
        this.state.weightDistMethod = 'perFrame';  // Default to perFrame method
        
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
            //Logger.log(CONFIG.DEBUG.BASIC, 'App', 'Application initialized successfully');
        } catch (error) {
            //Logger.log(CONFIG.DEBUG.ERROR, 'App', 'Initialization failed', error);
        }
    }
  
    checkVisualizationStatus() {
        Logger.log(CONFIG.DEBUG.BASIC, 'App', 'Checking visualization status');

        const heatmapContainer = document.getElementById('heatmap-container');
        const heatmapElement = document.getElementById('heatmap');
        const heatmapOverlay = document.getElementById('heatmap-overlay');

        //Logger.log(CONFIG.DEBUG.BASIC, 'App', 'Container dimensions:', {
        //    width: heatmapContainer?.offsetWidth,
        //    height: heatmapContainer?.offsetHeight
        //});

        //Logger.log(CONFIG.DEBUG.BASIC, 'App', 'Heatmap instance:', {
        //    exists: !!this.state.visualization.heatmapInstance,
        //    containerExists: !!heatmapElement,
        //    overlayExists: !!heatmapOverlay
        //});
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
            'copHistoryLength',
            'copTriggerThreshold',
            'swingDuration',
            'stopTriggerThreshold',
            'playbackSpeed'            
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
      
        // Invert axes checkboxes  useFixedDurationStop   useMovementThresholdStop
        ['useFixedDurationStop', 'useMovementThresholdStop'].forEach(setting => {
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
            case 'swingDuration':
            case 'stopTriggerThreshold':
            case 'playbackSpeed':            
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
            case 'useFixedDurationStop':
            case 'useMovementThresholdStop':
            case 'clearTime':
                // No direct visualization update, but could reset timeout if needed
                break;
            default:
                // For any other settings, optionally update heatmap
                break;
        }
    }
    
    processFrame(frame) {
        
        // PATCH: If currently in playback mode, ignore any live frames
        if (this.state.isPlayback) {
            // Optionally log this for debugging:
            //console.log("Ignoring live data frame because playback is active.");
            return;
        }
        this.state.isPlayback = false;
        
        //window.app.state.isPlayback = false;
      
        //console.log("PressureSensorApp.processFrame setting state.isPlayback to false", this.state);
        
        //console.log("PressureSensorApp.processFrame window.app.state.isPlayback = " + window.app.state.isPlayback);
      
      
        const processedData = this.dataProcessor.processFrame(frame);
        if (processedData) {
          
            this.updateVisualizations(processedData);
            
            // Handle swing recording logic
            if (this.state.recording.isRecording) {
                this.recordingManager.processCoPData(
                    processedData.readings,
                    processedData.cop
                );
            }
        }
    }
    
    updateVisualizations(processedData) {
        // Update the heatmap
        this.visualizer.updateHeatmap(processedData);

        // Update raw data panel
        this.visualizer.updateRawDataLive(
            processedData.readings,
            processedData.cop,
            processedData.timestamp,
            this.state.settings
        );

        // Update pressure distribution
        this.visualizer.updatePressureDistributionLive(
            processedData.readings,
            processedData.cop,
            this.state.settings,
            this.dataProcessor
        );

        // Update CoP graph if we have CoP data
        if (processedData.cop) {
            this.visualizer.updateCoPGraph();
        }

        // Update velocity graph if we have velocity history
        if (this.state.visualization.velocityHistory.length > 0) {
            this.visualizer.updateVelocityGraph();
        }

        // Update force graph if we have force history
        if (this.state.visualization.forceHistory.length > 0) {
            this.visualizer.updateForceGraph();
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

