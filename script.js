
// BLE UUIDs
const NORDIC_UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NORDIC_UART_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const NORDIC_UART_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

const MICROCHIP_UART_SERVICE = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
const MICROCHIP_UART_TX = '49535343-1e4d-4bd9-ba61-23c647249616';
const MICROCHIP_UART_RX = '49535343-8841-43f4-a8d4-ecbe34729bb3';

const debug = 0;  //4 is for foot pressure %  //5 is for playback stuff  //6 shows recorded data  //set to 1 to allow console.log debug messages  //set to 0 to turn off

let linearFit = true;  //set to true to use linear fit for weight calcs  //set to false to use power fit

//let useMinThreshold = false;  //set to true to use a minimum threshold for weight calcs and CoP display  //set to false to disable this
//let minThreshold = 1000;  //min threshold below which to ignore z readings for weight dist calcs and CoP calcs

let bluetoothDevice;
let characteristic;
let heatmapInstance;
let lastDataTimestamp = Date.now();
//let clearTimeout;
let myClearTimeout;
let dataHistory = [];
let dataBuffer = ''; // Buffer to store incomplete data chunks
let copHistory = [];
let copGraphCanvas;
let copGraphCtx;

let isRecording = false;
let recordingStarted = false;
let copPathData = [];
let lastCopPosition = null;
let startTime = null;
let maxSpeedRecorded = 0;

//let playbackData = null;
let playbackData = [];
let isPlaying = false;
let playbackInterval = null;
let currentFrameIndex = 0;
let recordedReadings = [];

let copMode = 'normal'; // Default mode

//Weight Distribution Calculation Method Selection and Calibration Button variables
let stanceCalibrationData = null;
let isCalibrating = false;
let calibrationStartTime = null;
const CALIBRATION_DURATION = 8000; // 8 seconds in milliseconds



// Default settings
const settings = {
    clearTime: 5000,        // 5 seconds
    historyLength: 1,      // Number of frames to keep in history
    /*
    //radius: 20,
    radius: 40,
    //blur: 0.75,
    blur: 0.95,
    //maxOpacity: 0.8,
    maxOpacity: 0.6,
    minOpacity: 0,
    */    
    radius: 80,        // Increased from 40 to create larger, more blended points
    //radius: 30,        // mvoed back down to 30
    blur: 0.95,         // Adjusted for better blending
    maxOpacity: 0.8,   // Increased for better visibility
    minOpacity: 0.02,   // Increased to keep points visible longer  
    //maxOpacity: 0.6,   // decreaded 
    //minOpacity: 0,   // decreased tp 0 to try to not show so much history, even when history length set to 0  
    maxValue: 2000,
    minValue: 200,
    copHistoryLength: 60,  //60 is good for controller fps of 30, so it's 2 seconds of CoP history
    matWidth: 46,          // inches
    matHeight: 22,         // inches
    sensorsX: 23,          // number of sensors in X direction
    sensorsY: 11,          // number of sensors in Y direction
    invertX: true,        // invert X axis
    invertY: false,         // invert Y axis
    
    copTriggerThreshold: 0.2,  //0.1 was not quite enough to prevent false triggers //0.2 seemed pretty good  // inches - minimum movement to start recording  //0.5 was too much (started recording late)  //try 0.1
    //inchesPerSensorX: settings.matWidth / settings.sensorsX,
    //inchesPerSensorY: settings.matHeight / settings.sensorsY
    swingDuration: 3.0,        // seconds
    stopTriggerThreshold: 0.3, // inches - minimum movement to stop recording
    playbackSpeed: 1.0,         // 1.0 = normal speed
  
    useFixedDurationStop: true,
    useMovementThresholdStop: false

  
};

// Initialize heatmap configuration remains the same...
window.onload = function() {
  
    initializeHeatmap();
  
    //if (debug == 1) console.log("h337 heatmap initialized"); 
    initializeControls();
      //if (debug == 1) console.log("initializeControls fcn run and returned"); 
    initializeCoPGraph(); // Add this line
      //if (debug == 1) console.log("initializeCoPGraph fcn run and returned"); 
    initializeCoPModeToggle(); // Add this line
    updateConnectionInfo('Heatmap initialized successfully');
      //if (debug == 1) console.log("updateConnectionInfo fcn run and returned"); 
    initializeCoPStats();
    initializeSwingControls();
    initializeWeightDistributionControls();
  
    /*
    try {
        heatmapInstance = h337.create({
            container: document.getElementById('heatmap'),
            radius: settings.radius,
            maxOpacity: settings.maxOpacity,
            minOpacity: settings.minOpacity,
            blur: settings.blur,
            backgroundColor: 'rgba(0, 0, 58, 0.96)',  //blue  //with alpha so you can see through it  //higher alpha is less transparent
                        
            //gradient: {
            //    '0.0': 'rgb(0, 0, 58)',      //blackish blue
            //    '0.1': 'rgb(0, 0, 255)',     //blue
            //    '0.2': 'rgb(128, 0, 255)',   //purple0
            //    '0.3': 'rgb(0, 128, 255)',   //greenish blue
            //    '0.4': 'rgb(0, 255, 255)',   //aqua
            //    '0.5': 'rgb(0, 255, 128)',   //blueish green
            //    '0.6': 'rgb(0, 255, 0)',     //green
            //    '0.7': 'rgb(128, 255, 0)',   //yellowish green
            //    '0.8': 'rgb(255, 255, 0)',   //yellow
            //    '0.9': 'rgb(255, 128, 0)',   //orange
            //    '1.0': 'rgb(255, 0, 0)'      //red
            //}
                        
            gradient: {
                '0.0': 'rgb(0, 0, 58)',      //blackish blue
                '0.2': 'rgb(0, 0, 255)',     //blue
                '0.6': 'rgb(0, 255, 255)',   //aqua
                '0.8': 'rgb(0, 255, 0)',     //green
                '0.9': 'rgb(255, 255, 0)',   //yellow
                '1.0': 'rgb(255, 0, 0)'      //red
            }            
          
        });
          //if (debug == 1) console.log("h337 heatmap initialized"); 
        initializeControls();
          //if (debug == 1) console.log("initializeControls fcn run and returned"); 
        initializeCoPGraph(); // Add this line
          //if (debug == 1) console.log("initializeCoPGraph fcn run and returned"); 
        updateConnectionInfo('Heatmap initialized successfully');
          //if (debug == 1) console.log("updateConnectionInfo fcn run and returned"); 
        initializeCoPStats();
        initializeSwingControls();
      
    } catch (error) {
        updateConnectionInfo('Error initializing heatmap: ' + error.message, true);
    }
    */
  
};

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


function initializeHeatmap(){
    try {
      
        adjustContainerDimensions(); // Add this line before creating heatmap instance
      
        heatmapInstance = h337.create({
            container: document.getElementById('heatmap'),
            radius: settings.radius,
            maxOpacity: settings.maxOpacity,
            minOpacity: settings.minOpacity,
            blur: settings.blur,
            backgroundColor: 'rgba(0, 0, 58, 0.96)',  //blue  //with alpha so you can see through it  //higher alpha is less transparent
            
            
            gradient: {
                '0.0': 'rgb(0, 0, 58)',      //blackish blue
                '0.1': 'rgb(0, 0, 255)',     //blue
                '0.2': 'rgb(128, 0, 255)',   //purple0
                '0.3': 'rgb(0, 128, 255)',   //greenish blue
                '0.4': 'rgb(0, 255, 255)',   //aqua
                '0.5': 'rgb(0, 255, 128)',   //blueish green
                '0.6': 'rgb(0, 255, 0)',     //green
                '0.7': 'rgb(128, 255, 0)',   //yellowish green
                '0.8': 'rgb(255, 255, 0)',   //yellow
                '0.9': 'rgb(255, 128, 0)',   //orange
                '1.0': 'rgb(255, 0, 0)'      //red
            }
            
            
          
            /*
            gradient: {
                '0.0': 'rgb(0, 0, 58)',      //blackish blue
                '0.2': 'rgb(0, 0, 255)',     //blue
                '0.6': 'rgb(0, 255, 255)',   //aqua
                '0.8': 'rgb(0, 255, 0)',     //green
                '0.9': 'rgb(255, 255, 0)',   //yellow
                '1.0': 'rgb(255, 0, 0)'      //red
            }
            */
          
        });
      
    } catch (error) {
        updateConnectionInfo('Error initializing heatmap: ' + error.message, true);
    }
  
}


// Initialize control sliders
function initializeControls() {
    // Add event listeners for all controls
    //['clearTime', 'historyLength', 'radius', 'blur'].forEach(setting => {
    //['clearTime', 'historyLength', 'radius', 'blur', 'copHistoryLength'].forEach(setting => {
    //['clearTime', 'radius', 'blur', 'maxValue', 'historyLength', 'copHistoryLength'].forEach(setting => {
    ['clearTime', 'radius', 'blur', 'maxValue', 'minValue', 'maxOpacity', 'minOpacity', 'historyLength', 'copHistoryLength'].forEach(setting => {
        const input = document.getElementById(setting);
        const slider = document.getElementById(setting + 'Slider');
        //const checkbox = document.getElementById(setting);
        
        if (debug == 1) console.log("initializeControls fcn - foor loop for settings entered");
      
        input.addEventListener('input', (e) => {
            slider.value = e.target.value;
            updateSetting(setting, e.target.value);
        });
        
        slider.addEventListener('input', (e) => {
            input.value = e.target.value;
            updateSetting(setting, e.target.value);
        });      
      
    });  
        
    // Add event listeners for mat settings
    ['matWidth', 'matHeight', 'sensorsX', 'sensorsY'].forEach(setting => {
        const input = document.getElementById(setting);
      
        if (debug == 1) console.log("initializeControls fcn - foor loop for mat settings entered");
      
        input.addEventListener('input', (e) => {
            input.value = e.target.value;
            updateSetting(setting, e.target.value);
        });
    });  
    
    ['invertX', 'invertY'].forEach(setting => {
        const checkbox = document.getElementById(setting);

        checkbox.addEventListener('change', (e) => {
            settings[setting] = e.target.checked;
            if (debug == 1) console.log(`${setting} changed to:`, e.target.checked);
            adjustContainerDimensions(); // Add this line before calling updateHeatmapWithHistory() function
            updateHeatmapWithHistory();
            updateCoPGraph();
        });
    });
  
}


function initializeCoPModeToggle() {
  
    // Add event listeners
    document.getElementById('normalMode').addEventListener('change', () => {
        copMode = 'normal';
        updateCoPGraph();
    });
    document.getElementById('deltaMode').addEventListener('change', () => {
        copMode = 'delta';
        updateCoPGraph();
    });
}


// Add this function to initialize the new controls
function initializeWeightDistributionControls() {
    const calibrateButton = document.getElementById('calibrateStanceButton');
    calibrateButton.addEventListener('click', startStanceCalibration);

    // Add event listeners for method selection
    document.getElementsByName('weightDistMethod').forEach(radio => {
        radio.addEventListener('change', (e) => {
            settings.weightDistMethod = e.target.value;
            // Update both real-time and playback displays if needed
            if (playbackData && playbackData.length > 0) {
                showFrame(currentFrameIndex);
            }
        });
    });
}


// Update setting values
function updateSetting(setting, value) {
    value = parseFloat(value);
    switch(setting) {
        case 'clearTime':
            settings.clearTime = value * 1000; // Convert to milliseconds
            break;
        
        case 'radius':
            settings.radius = value;
            /*
            if (heatmapInstance) {
                heatmapInstance.configure({ radius: value });
                updateHeatmapWithHistory();
            }
            */
            initializeHeatmap();
            break;
        case 'blur':
            settings.blur = value;
            /*
            if (heatmapInstance) {
                heatmapInstance.configure({ blur: value });
                updateHeatmapWithHistory();
            }
            */
            initializeHeatmap();
            break;
        case 'maxValue':
            settings.maxValue = value;
            initializeHeatmap();
            adjustContainerDimensions(); // Add this line before calling updateHeatmapWithHistory() function
            updateHeatmapWithHistory();
            break;
        case 'minValue':
            settings.minValue = value;
            initializeHeatmap();
            adjustContainerDimensions(); // Add this line before calling updateHeatmapWithHistory() function
            updateHeatmapWithHistory();
            break;
        case 'maxOpacity':
            settings.maxOpacity = value;
            initializeHeatmap();
            adjustContainerDimensions(); // Add this line before calling updateHeatmapWithHistory() function
            updateHeatmapWithHistory();
            break;
        case 'minOpacity':
            settings.minOpacity = value;
            initializeHeatmap();
            adjustContainerDimensions(); // Add this line before calling updateHeatmapWithHistory() function
            updateHeatmapWithHistory();            
            break;
        case 'historyLength':
            settings.historyLength = value;
            dataHistory = dataHistory.slice(-value); // Trim history if needed
            break;
        case 'copHistoryLength':
            settings.copHistoryLength = value;
            copHistory = copHistory.slice(-value); // Trim CoP history if needed
            adjustContainerDimensions(); // Add this line before calling updateHeatmapWithHistory() function
            updateHeatmapWithHistory();
            break;
        case 'matWidth':
        case 'matHeight':
        case 'sensorsX':
        case 'sensorsY':
            settings[setting] = parseInt(value);
            adjustContainerDimensions(); // Add this line before calling updateHeatmapWithHistory() function
            updateHeatmapWithHistory();
            updateCoPGraph();
            break;
        case 'invertX':
        case 'invertY':
            settings[setting] = value;
            adjustContainerDimensions(); // Add this line before calling updateHeatmapWithHistory() function
            updateHeatmapWithHistory();
            updateCoPGraph();
            break;        
    }
}

function clearCoPGraph() {
    if (copGraphCtx) {
        copGraphCtx.clearRect(0, 0, copGraphCanvas.width, copGraphCanvas.height);
    }
}


//initialize CoP graph - Plotly style
function initializeCoPGraph() {
    const container = document.getElementById('cop-graph');
    container.innerHTML = ''; // Clear any existing content

    // Create a Plotly graph
    const layout = {
        title: 'Center of Pressure (CoP) Graph',
        xaxis: {
            //title: 'X Position (inches)',
            title: 'X Position (coordinate)',
            autorange: true,
        },
        yaxis: {
            //title: 'Y Position (inches)',
            title: 'Y Position (coordinate)',
            autorange: true,
        },
        showlegend: false,
    };

    Plotly.newPlot(container, [], layout);
}



function updateCoPGraph() {
    if (!copHistory || copHistory.length < 1) return;

    let inchesPerSensorX = settings.matWidth / settings.sensorsX;
    let inchesPerSensorY = settings.matHeight / settings.sensorsY;

    // Prepare data points based on mode
    let xValues, yValues;
    let title, xAxisTitle, yAxisTitle;

    // First, adjust all points for inversion settings
    const adjustedCoPHistory = copHistory.map(point => ({
        x: settings.invertX ? (settings.sensorsX - point.x) : point.x,
        y: settings.invertY ? (settings.sensorsY - point.y) : point.y,
    }));

    if (copMode === 'normal') {
        // Normal mode - use absolute coordinates
        if (settings.invertX) {
            xValues = adjustedCoPHistory.map(point => point.x);
        } else {
            xValues = adjustedCoPHistory.map(point => point.x);
        }
        
        if (settings.invertY) {
            yValues = adjustedCoPHistory.map(point => point.y);
        } else {
            yValues = adjustedCoPHistory.map(point => point.y);
        }
        
        title = 'Center of Pressure (CoP) Graph';
        xAxisTitle = 'X Position (coordinate)';
        yAxisTitle = 'Y Position (coordinate)';
    } else {
        // Delta mode - calculate relative to oldest point
        const basePoint = adjustedCoPHistory[0]; // Oldest point
        
        if (settings.invertX) {
            xValues = adjustedCoPHistory.map(point => 
                (point.x - basePoint.x) * inchesPerSensorX
            );
        } else {
            xValues = adjustedCoPHistory.map(point => 
                (point.x - basePoint.x) * inchesPerSensorX
            );
        }
        
        if (settings.invertY) {
            yValues = adjustedCoPHistory.map(point => 
                (point.y - basePoint.y) * inchesPerSensorY
            );
        } else {
            yValues = adjustedCoPHistory.map(point => 
                (point.y - basePoint.y) * inchesPerSensorY
            );
        }
        
        title = 'Center of Pressure (CoP) Delta';
        xAxisTitle = 'X Delta (inches)';
        yAxisTitle = 'Y Delta (inches)';
    }

    const trace = {
        x: xValues,
        y: yValues,
        mode: 'lines+markers',
        type: 'scatter',
        marker: { color: 'blue', size: 6 },
    };

    // Prepare layout with axis directions based on inversion settings
    const layout = {
        title: title,
        xaxis: {
            title: xAxisTitle,
            autorange: settings.invertX ? true : true, // You can change this to 'reverse' if needed
            // autorange: settings.invertX ? 'reversed' : true, // Alternative if you want to reverse the axis            
            //tickformat: '.2f',  // Format to 2 decimal places
            tickformat: '0.2f',    // Changed from '.2f' to '0.2f' for better compatibility  
            //tickformat: '0.1f',    // changed to 1 decimal place
            //dtick: 0.01        // Minimum tick increment of 0.01
            //dtick: 0.05,        // Minimum tick increment of 0.01
            nticks: 10,            // Suggest number of ticks
            /*
            tickformatstops: [
                {
                    dtickrange: [null, 0.01],  // For very zoomed in views
                    value: '.2f'
                },
                {
                    dtickrange: [0.01, 0.1],   // For moderate zoom
                    value: '.2f'
                },
                {
                    dtickrange: [0.1, null],    // For zoomed out views
                    value: '.1f'
                }
            ],
            */
            exponentformat: 'none', // Prevent scientific notation
            showexponent: 'none'    // Prevent scientific notation
            
        },
        yaxis: {
            title: yAxisTitle,
            autorange: settings.invertY ? true : true, // You can change this to 'reverse' if needed
            // autorange: settings.invertY ? 'reversed' : true, // Alternative if you want to reverse the axis
            //tickformat: '.2f',  // Format to 2 decimal places
            tickformat: '0.2f',    // Changed from '.2f' to '0.2f' for better compatibility
            //tickformat: '0.1f',    // changed to 1 decimal place
            //dtick: 0.01        // Minimum tick increment of 0.01            
            //dtick: 0.05,        // Minimum tick increment of 0.01            
            nticks: 10,            // Suggest number of ticks
            /*
            tickformatstops: [
                {
                    dtickrange: [null, 0.01],  // For very zoomed in views
                    value: '.2f'
                },
                {
                    dtickrange: [0.01, 0.1],   // For moderate zoom
                    value: '.2f'
                },
                {
                    dtickrange: [0.1, null],    // For zoomed out views
                    value: '.1f'
                }
            ],
            */
            exponentformat: 'none', // Prevent scientific notation
            showexponent: 'none'    // Prevent scientific notation
            
        },
        showlegend: false,
    };

    // Update the graph
    Plotly.newPlot('cop-graph', [trace], layout);
}



//updated to help prevent the heatmap not rendering correctly  //creates seperate overlay canvases
// Create a debounced version of the update function
const debouncedUpdateHeatmap = debounce((dataHistory, copHistory, settings) => {
//function debouncedUpdateHeatmap(dataHistory, copHistory, settings) {
//function updateHeatmapWithHistory() {
    if (!heatmapInstance || dataHistory.length === 0) return;

    //const now = Date.now();  // timestamp since epoch in ms
    //const maxAge = settings.historyLength * 1000;  // converts historyLength in seconds to milliseconds   
  
    const histLen = settings.historyLength;  //mult by X (* 2) makes scale down more slowly  //divide by X ( / 1.5) makes the opacity scale downwards more quickly for each historical reading

    //these overwrite the minValue and maxValue set by the settings sliders
    //let minValue = Infinity;   // Start with the largest possible value
    //let maxValue = -Infinity;  // Start with the smallest possible value  
    let dataMinValue = Infinity;   // Start with the largest possible value
    let dataMaxValue = -Infinity;  // Start with the smallest possible value

    // Get canvas dimensions and scaling factors
    const container = document.getElementById('heatmap-container');
    const canvas = document.getElementById('heatmap');
  
    const scaleX = container.offsetWidth / settings.sensorsX;    
    const scaleY = container.offsetHeight / settings.sensorsY; 
  
    var counter = 0;
    
    // Process and scale the data points
    const allDataPoints = [];
    for (const { timestamp, readings } of dataHistory) {
        //const age = now - timestamp;
        //const opacity = Math.max(settings.minOpacity, 1 - (age / maxAge));
        //if (debug == 5) console.log("age= " + age + "   maxAge= " + maxAge + "   opacity= " + opacity);
        
        const opacity = Math.min(settings.maxOpacity, (Math.max(settings.minOpacity, 1 - (counter / histLen))));
        if (debug == 5) console.log("counter=" + counter + "  historyLength=" + histLen + "  counter/historyLength=" + (counter / histLen) + "  1-counter/historyLength=" + (1 - (counter / histLen)) + "  opacity=" + opacity);
        
        counter++;

        for (const reading of readings) {
            let x = reading.x;
            let y = reading.y;

            // Apply inversion if enabled
            if (settings.invertX) {
                x = settings.sensorsX - x;
            }
            if (!settings.invertY) {
                y = settings.sensorsY - y;
            }

            // Scale coordinates to canvas size
            const xScaled = x * scaleX;
            const yScaled = y * scaleY;

            //if (maxValue < reading.value) maxValue = reading.value;
            //if (minValue > reading.value) minValue = reading.value;
            if (dataMaxValue < reading.value) dataMaxValue = reading.value;
            if (dataMinValue > reading.value) dataMinValue = reading.value;
          
          
            allDataPoints.push({
                x: xScaled,
                y: yScaled,
                value: reading.value,
                opacity: opacity
            });
            
        }
    }

    // Update heatmap data
    heatmapInstance.setData({
        //min: dataMinValue,  //this uses the overall min value of the datapoints  - this will cause valid data to be blue - this will mask active points - NOT GOOD
        min: settings.minValue,  //this uses the min value set in the settings
        //max: dataMaxValue,  //this uses the overall max value of the datapoints - this will make sure that there is red on the heatmap
        max: (dataMaxValue - 300),  //this gives the (overall max value)-300 counts the color of red - to ensure theres a lot of red on the heatmap
        //max: settings.maxValue,  //this uses the max value set in the settings
        data: allDataPoints
    });

    // Ensure overlay canvas exists and is properly sized
    let overlayCanvas = document.getElementById('heatmap-overlay');
    if (!overlayCanvas) {
        overlayCanvas = document.createElement('canvas');
        overlayCanvas.id = 'heatmap-overlay';
        overlayCanvas.style.position = 'absolute';
        overlayCanvas.style.top = '0';
        overlayCanvas.style.left = '0';
        overlayCanvas.style.pointerEvents = 'none';
        overlayCanvas.style.zIndex = '1';
        container.appendChild(overlayCanvas);
    }
    overlayCanvas.width = container.offsetWidth;
    overlayCanvas.height = container.offsetHeight;
    
    // Draw grid and CoP on overlay canvas
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;

    // Draw vertical grid lines
    const xStep = overlayCanvas.width / settings.sensorsX;
    for (let i = 0; i <= settings.sensorsX; i++) {
        ctx.beginPath();
        ctx.moveTo(i * xStep, 0);
        ctx.lineTo(i * xStep, overlayCanvas.height);
        ctx.stroke();
    }

    // Draw horizontal grid lines
    const yStep = overlayCanvas.height / settings.sensorsY;
    for (let i = 0; i <= settings.sensorsY; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * yStep);
        ctx.lineTo(overlayCanvas.width, i * yStep);
        ctx.stroke();
    }

    // Draw CoP path
    if (copHistory.length > 0) {
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;
        ctx.beginPath();

        copHistory.forEach((point, index) => {
            let x = point.x;
            let y = point.y;
            
            // Apply inversion if enabled
            if (settings.invertX) {
                x = settings.sensorsX - x;
            }
            if (!settings.invertY) {
                y = settings.sensorsY - y;
            }
            
            // Scale coordinates to canvas size
            x = x * scaleX;
            y = y * scaleY;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Draw current CoP point
        const lastPoint = copHistory[copHistory.length - 1];
        let x = lastPoint.x;
        let y = lastPoint.y;
        
        if (settings.invertX) {
            x = settings.sensorsX - x;
        }
        if (!settings.invertY) {
            y = settings.sensorsY - y;
        }
        
        x = x * scaleX;
        y = y * scaleY;

        ctx.beginPath();
        ctx.fillStyle = 'yellow';
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
//}
  
}, 16 );  //50 ms (approx 20 fps) // 16ms debounce time (approximately 60fps)  
          //16 works with fixed heatmap container dimension checking

// Replace your existing updateHeatmapWithHistory function with this wrapper
function updateHeatmapWithHistory() {
    debouncedUpdateHeatmap(dataHistory, copHistory, settings);
}


//Ensures container and canvas both width and height are exact multiples of sensor count
//this was the big thing to fix the heatmap not always showing up 
function adjustContainerDimensions() {
    const container = document.getElementById('heatmap-container');
    const sensorCountX = settings.sensorsX;
    const sensorCountY = settings.sensorsY;
    
    // Get current dimensions
    const currentWidth = container.offsetWidth;
    const currentHeight = container.offsetHeight;
    
    // Calculate pixels per sensor
    const pixelsPerSensorX = Math.round(currentWidth / sensorCountX);
    const pixelsPerSensorY = Math.round(currentHeight / sensorCountY);
    
    // Calculate adjusted dimensions
    const adjustedWidth = pixelsPerSensorX * sensorCountX;
    const adjustedHeight = pixelsPerSensorY * sensorCountY;
    
    // Apply adjusted dimensions
    container.style.width = `${adjustedWidth}px`;
    container.style.height = `${adjustedHeight}px`;

    // Also adjust the overlay canvas
    const overlayCanvas = document.getElementById('heatmap-overlay');
    if (overlayCanvas) {
        overlayCanvas.width = adjustedWidth;
        overlayCanvas.height = adjustedHeight;
    }

    // Force heatmap instance to update its dimensions
    if (heatmapInstance) {
        heatmapInstance.setDataMax(settings.maxValue);
    }
}


// function to handle stance calibration
function startStanceCalibration() {
    const button = document.getElementById('calibrateStanceButton');
    const countdownDisplay = document.getElementById('calibrationCountdown');
    button.disabled = true;
    
    let timeLeft = CALIBRATION_DURATION / 1000;
    stanceCalibrationData = [];
    isCalibrating = true;
    calibrationStartTime = Date.now();
  
  
    const countInterval = setInterval(() => {
        timeLeft = Math.max(0, Math.round((CALIBRATION_DURATION - (Date.now() - calibrationStartTime)) / 1000));
        //countdownDisplay.textContent = `${timeLeft}s remaining`;
        countdownDisplay.textContent = `${timeLeft}s remain - Rock left to right, heel to toe`;        
        
        if (timeLeft <= 0) {
            clearInterval(countInterval);
            finishCalibration();
            countdownDisplay.textContent = '';
            button.disabled = false;
        }
    }, 100);
}


function finishCalibration() {
    isCalibrating = false;
    if (stanceCalibrationData.length === 0) {
        console.error('No calibration data collected');
        return;
    }
  
    // Process each calibration frame with inversions
    const adjustedCalibrationData = stanceCalibrationData.map(frame => 
        frame.map(reading => ({
            ...reading,
            x: settings.invertX ? (settings.sensorsX - reading.x) : reading.x,
            y: settings.invertY ? (settings.sensorsY - reading.y) : reading.y
        }))
    );

    // Calculate boundaries from adjusted data
    const boundaries = calculateCalibrationBoundaries(adjustedCalibrationData);
    stanceCalibrationData = boundaries; // Store only the boundaries

    
    if (debug == 7) {
        console.log('Calibration boundaries:', boundaries);
    }
      //boundaries stucture:
        //xRange: { min: overallMinX, max: overallMaxX, mid: xMidpoint },
        //frontFoot: { minY: frontFootMinY, maxY: frontFootMaxY },
        //backFoot: { minY: backFootMinY, maxY: backFootMaxY }
  //so boundaries.frontFoot.minY, or boundaries.backFoot.maxY, or boundaries.xRange.max, or boundaries.xRange.mid
  
}


function calculateCalibrationBoundaries(calibrationFrames) {
    let overallMinX = Infinity;
    let overallMaxX = -Infinity;
    let frontFootMinY = Infinity;
    let frontFootMaxY = -Infinity;
    let backFootMinY = Infinity;
    let backFootMaxY = -Infinity;

    // First pass: find overall X boundaries
    calibrationFrames.forEach(frame => {
        frame.forEach(point => {
            overallMinX = Math.min(overallMinX, point.x);
            overallMaxX = Math.max(overallMaxX, point.x);
        });
    });

    const xMidpoint = overallMinX + ((overallMaxX - overallMinX) / 2);

    // Second pass: find Y boundaries for each foot  
    
    calibrationFrames.forEach(frame => {
        frame.forEach(point => {
            if (point.x <= xMidpoint) { // Front foot
                frontFootMinY = Math.min(frontFootMinY, point.y);
                frontFootMaxY = Math.max(frontFootMaxY, point.y);
            } else { // Back foot
                backFootMinY = Math.min(backFootMinY, point.y);
                backFootMaxY = Math.max(backFootMaxY, point.y);
            }
        });
    });

    return {
        xRange: { min: overallMinX, max: overallMaxX, mid: xMidpoint },
        frontFoot: { minY: frontFootMinY, maxY: frontFootMaxY },
        backFoot: { minY: backFootMinY, maxY: backFootMaxY }
    };
}


/*
//weight distribution calculation function before adding the 'calibration' option
  //moved these calculations to a new function called calculatePressureDistributionPerFrame
function calculatePressureDistribution(readings) {  //this is for the weight distribution stuff
    if (!readings || readings.length === 0) return;

    // Adjust X and Y coordinates based on inversion setting
    const adjustedReadings = readings.map(reading => ({
        ...reading,
        adjustedX: settings.invertX ? (settings.sensorsX - reading.x) : reading.x,
        adjustedY: settings.invertY ? (settings.sensorsY - reading.y) : reading.y      
    }));
  
    if (debug == 4) console.log("adjustedReadings= " + adjustedReadings);

    // Find min and max X values to determine front/back split
    const xValues = adjustedReadings.map(r => r.adjustedX);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const xMidpoint = minX + (maxX - minX) / 2;
  
    if (debug == 4) console.log("xMidpoint= " + xMidpoint + "   minX= " + minX + "   maxX= " + maxX);

    // Separate front and back foot readings
    //const frontFootReadings = adjustedReadings.filter(r => r.adjustedX >= xMidpoint); // before fixing inverts
    //const backFootReadings = adjustedReadings.filter(r => r.adjustedX < xMidpoint);   // before fixing inverts
    const frontFootReadings = adjustedReadings.filter(r => r.adjustedX <= xMidpoint);   // after fixing inverts
    const backFootReadings = adjustedReadings.filter(r => r.adjustedX > xMidpoint);     // after fixing inverts

    // Calculate total pressure
    const totalPressure = adjustedReadings.reduce((sum, r) => sum + r.value, 0);

    // Process front foot
    const frontFootData = processFootData(frontFootReadings, totalPressure);

    // Process back foot
    const backFootData = processFootData(backFootReadings, totalPressure);

    // Update display
    updatePressureDisplay('front', frontFootData);
    updatePressureDisplay('back', backFootData);
}
*/



// Add this helper function to convert z-value to weight
function zValueToWeight(zValue) {
    // Using the given equation: z = 1390.2 * x^0.1549  //this was taken from using water bucket to calibrate x12y6 of Golf-T-2000
    // We need to solve for x (weight): x = (z/1390.2)^(1/0.1549)
    return Math.pow((zValue / 1390.2), (1 / 0.1549));
}

// Modify the calculatePressureDistribution function
function calculatePressureDistribution(readings) {
    if (!readings || readings.length === 0) return;

    const method = document.querySelector('input[name="weightDistMethod"]:checked').value;
    
    if (method === 'calibrated' && !stanceCalibrationData) {
        // If calibrated method is selected but no calibration data exists,
        // fall back to per-frame method
        calculatePressureDistributionPerFrame(readings);
        return;
    }

    if (method === 'calibrated') {
        calculatePressureDistributionCalibrated(readings);
    } else {
        calculatePressureDistributionPerFrame(readings);
    }
}


//for using power fit relationship:
function calculatePressureDistributionPerFrame(readings) {
    // Adjust X and Y coordinates based on inversion setting
    const adjustedReadings = readings.map(reading => ({
        ...reading,
        adjustedX: settings.invertX ? (settings.sensorsX - reading.x) : reading.x,
        adjustedY: settings.invertY ? (settings.sensorsY - reading.y) : reading.y      
    }));

    // Find min and max X values to determine front/back split
    const xValues = adjustedReadings.map(r => r.adjustedX);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const xMidpoint = minX + (maxX - minX) / 2;

    if (debug == 4) console.log("xMidpoint= " + xMidpoint + "   minX= " + minX + "   maxX= " + maxX);  
    
    // Separate front and back foot readings
    const frontFootReadings = adjustedReadings.filter(r => r.adjustedX <= xMidpoint);
    const backFootReadings = adjustedReadings.filter(r => r.adjustedX > xMidpoint);
  
    if (linearFit) {
        //for linear fit
        // Calculate total pressure (sum of all activated points Z value)
        const totalPressure = adjustedReadings.reduce((sum, r) => sum + r.value, 0);
        const frontFootData = processFootData(frontFootReadings, totalPressure);
        const backFootData = processFootData(backFootReadings, totalPressure);    
        if (debug == 4) console.log("totalPressure (sum of all Z values) = " + totalPressure);
        // Update display
        updatePressureDisplay('front', frontFootData);    
        updatePressureDisplay('back', backFootData);      
    }
    else {
        //for power fit:
        // Calculate total weight instead of total pressure
        const totalWeight = readings.reduce((sum, r) => sum + zValueToWeight(r.value), 0);  
        const frontFootData = processFootData(frontFootReadings, totalWeight);
        const backFootData = processFootData(backFootReadings, totalWeight);    
        if (debug == 4) console.log("totalWeight (sum of all Z values (converted to weight)) = " + totalWeight);
        // Update display
        updatePressureDisplay('front', frontFootData);    
        updatePressureDisplay('back', backFootData);
    }
  
}


function processFootData(footReadings, totalPressure) {
    if (footReadings.length === 0) return { total: 0, toe: 0, heel: 0 };
  
    // Find toe/heel split based on this foot's data
    const yValues = footReadings.map(r => r.adjustedY);
    //const yMidpoint = (Math.min(...yValues) + Math.max(...yValues)) / 2;  //(min + max)/2 gives same as ((max-min)/2)+min
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const yMidpoint = minY + ((maxY - minY) / 2);
  
    //if (debug == 4) console.log("yMidpoint= " + yMidpoint + "   minY= " + minY + "   maxY= " + maxY);
  
    let footPercentage = 0;
    let toePercentage = 0;
    let heelPercentage = 0;
    
    if (linearFit) {
        //for linear relationship:  
        const footTotal = footReadings.reduce((sum, r) => sum + r.value, 0);
        footPercentage = Math.round((footTotal / totalPressure) * 100);
      
        const toeReadings = footReadings.filter(r => r.adjustedY >= yMidpoint);  // <= xMidpoint
        const heelReadings = footReadings.filter(r => r.adjustedY < yMidpoint);  //  > xMidpoint
      
        const toeTotal = toeReadings.reduce((sum, r) => sum + r.value, 0);
        const heelTotal = heelReadings.reduce((sum, r) => sum + r.value, 0);
      
        toePercentage = Math.round((toeTotal / footTotal) * 100);
        heelPercentage = Math.round((heelTotal / footTotal) * 100);
    }  
    else { //for power relationship:  
      
        // Convert z-values to weights
        const footWeights = footReadings.map(r => ({
            ...r,
            weight: zValueToWeight(r.value)
        }));
      
        // Calculate total weight instead of pressure  ...  //for power relationship:  
        const totalWeight = footWeights.reduce((sum, r) => sum + r.weight, 0);
        //updated the calc pressure dist functions to send total weight which is already converted from raw z values to weight with the power fit eqn.
        //const allTotalWeight = zValueToWeight(totalPressure); // Convert total pressure to weight
        const allTotalWeight = totalPressure; //already converted from raw z values to weight in the calling function
        footPercentage = Math.round((totalWeight / allTotalWeight) * 100);
        
        const toeReadings = footWeights.filter(r => r.adjustedY >= yMidpoint);
        const heelReadings = footWeights.filter(r => r.adjustedY < yMidpoint);

        const toeWeight = toeReadings.reduce((sum, r) => sum + r.weight, 0);
        const heelWeight = heelReadings.reduce((sum, r) => sum + r.weight, 0);

        toePercentage = Math.round((toeWeight / totalWeight) * 100);
        heelPercentage = Math.round((heelWeight / totalWeight) * 100);
    }
  
    return {
        total: footPercentage,
        toe: toePercentage,
        heel: heelPercentage
    };
}



//for power fit relation between wegith and Z value
function calculatePressureDistributionCalibrated(readings) {
    if (!stanceCalibrationData) return;    

    // Apply inversion settings to readings
    const adjustedReadings = readings.map(reading => ({
        ...reading,
        x: settings.invertX ? (settings.sensorsX - reading.x) : reading.x,
        y: settings.invertY ? (settings.sensorsY - reading.y) : reading.y
    }));  
  
    // The calibration boundaries were captured with inversion settings applied,
      // so we can use them directly
    const boundaries = stanceCalibrationData;  
    const xMidpoint = boundaries.xRange.mid;

    if (debug == 7) console.log('xMidpoint:', xMidpoint);

    // Separate front and back foot readings using calibrated xMidpoint
    const frontFootReadings = adjustedReadings.filter(r => r.x <= xMidpoint);    
    const backFootReadings = adjustedReadings.filter(r => r.x > xMidpoint);
  
    if (debug == 7) console.log('frontFootReadings:', frontFootReadings);
    if (debug == 7) console.log('backFootReadings:', backFootReadings);
  
  
    if (linearFit) {
        //for linear fit:
        // Calculate total pressure    
        const totalPressure = adjustedReadings.reduce((sum, r) => sum + r.value, 0);

        if (debug == 7) console.log('totalPressure:', totalPressure);  

        // Process front foot using calibrated boundaries
        const frontFootData = processFootDataWithBoundaries(
            frontFootReadings,
            totalPressure,
            boundaries.frontFoot
        );

        // Process back foot using calibrated boundaries
        const backFootData = processFootDataWithBoundaries(
            backFootReadings,
            totalPressure,
            boundaries.backFoot
        );

        // Update display
        updatePressureDisplay('front', frontFootData);
        updatePressureDisplay('back', backFootData);
    }
    else {
        //for power fit:
        // Calculate total weight instead of total pressure
        const totalWeight = readings.reduce((sum, r) => sum + zValueToWeight(r.value), 0);

        if (debug == 7) console.log('totalWeight:', totalWeight);

        // Process front foot using calibrated boundaries
        const frontFootData = processFootDataWithBoundaries(
            frontFootReadings,
            totalWeight,
            boundaries.frontFoot
        );

        // Process back foot using calibrated boundaries
        const backFootData = processFootDataWithBoundaries(
            backFootReadings,
            totalWeight,
            boundaries.backFoot
        );

        // Update display
        updatePressureDisplay('front', frontFootData);
        updatePressureDisplay('back', backFootData);
    }
  
}


function processFootDataWithBoundaries(footReadings, totalPressure, boundaries) {
    if (footReadings.length === 0) return { total: 0, toe: 0, heel: 0 };
  
    const yMidpoint = boundaries.minY + ((boundaries.maxY - boundaries.minY) / 2);
  
    let footPercentage = 0;
    let toePercentage = 0;
    let heelPercentage = 0;
  
    if (linearFit) {
        //for linear relationship:
        const footTotal = footReadings.reduce((sum, r) => sum + r.value, 0);
        footPercentage = Math.round((footTotal / totalPressure) * 100);
        
        // Separate toe and heel readings using calibrated yMidpoint
        const toeReadings = footReadings.filter(r => r.y >= yMidpoint);
        const heelReadings = footReadings.filter(r => r.y < yMidpoint);
        
        const toeTotal = toeReadings.reduce((sum, r) => sum + r.value, 0);
        const heelTotal = heelReadings.reduce((sum, r) => sum + r.value, 0);
        
        toePercentage = Math.round((toeTotal / footTotal) * 100) || 0;
        heelPercentage = Math.round((heelTotal / footTotal) * 100) || 0;
    }
    else {
        //for power relationship: 

        // Convert z-values to weights
        const footWeights = footReadings.map(r => ({
            ...r,
            weight: zValueToWeight(r.value)
        }));  

        const totalWeight = footWeights.reduce((sum, r) => sum + r.weight, 0);
        //updated the calc pressure dist functions to send total weight which is already converted from raw z values to weight with the power fit eqn.  
        //const allTotalWeight = zValueToWeight(totalPressure); // Convert total pressure to weight
        const allTotalWeight = totalPressure; //already converted from raw z values to weight in the calling function
        footPercentage = Math.round((totalWeight / allTotalWeight) * 100);  
        
        const toeReadings = footWeights.filter(r => r.y >= yMidpoint);
        const heelReadings = footWeights.filter(r => r.y < yMidpoint);
        
        const toeWeight = toeReadings.reduce((sum, r) => sum + r.weight, 0);
        const heelWeight = heelReadings.reduce((sum, r) => sum + r.weight, 0);
        
        toePercentage = Math.round((toeWeight / totalWeight) * 100) || 0;
        heelPercentage = Math.round((heelWeight / totalWeight) * 100) || 0;
    }
  
    return {
        total: footPercentage,
        toe: toePercentage,
        heel: heelPercentage
    };
  
}



function updatePressureDisplay(foot, data) {
    document.getElementById(`${foot}-percentage`).textContent = data.total;
    document.getElementById(`${foot}-toe-percentage`).textContent = `Toe: ${data.toe}%`;
    document.getElementById(`${foot}-heel-percentage`).textContent = `Heel: ${data.heel}%`;
}



function initializeCoPStats() {
    const readyButton = document.getElementById('readyButton');
    readyButton.addEventListener('click', startCountdown);
}


function startCountdown() {
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
                startRecording();
            }, 1000);
        }
    }, 1000);
}

function startRecording() {
    isRecording = true;
    recordingStarted = false;
    copPathData = [];
    recordedReadings = [];
    lastCopPosition = null;
    startTime = null;
    maxSpeedRecorded = 0;
}

function processCoPData(readings, cop) {
    if (!isRecording) return;
  
    // Adjust CoP coordinates based on inversion settings
    let copX = settings.invertX ? (settings.sensorsX - cop.x) : cop.x;
    let copY = settings.invertY ? (settings.sensorsY - cop.y) : cop.y;
  
    let inchesPerSensorX = settings.matWidth / settings.sensorsX;
    let inchesPerSensorY = settings.matHeight / settings.sensorsY;
    const xInches = copX * inchesPerSensorX;
    const yInches = copY * inchesPerSensorY;

    if (!lastCopPosition) {
        lastCopPosition = { x: xInches, y: yInches };
        return;
    }

    // Calculate movement distance
    const distance = Math.sqrt(
        Math.pow(xInches - lastCopPosition.x, 2) + 
        Math.pow(yInches - lastCopPosition.y, 2)
    );

    // Check if movement exceeds threshold to start recording
    if (!recordingStarted && distance >= settings.copTriggerThreshold) {
        recordingStarted = true;
        startTime = Date.now();  //ms since the epoch
    }

    if (recordingStarted) {
        const timestamp = Date.now();  //ms since the epoch
      
        const timeElapsed = (timestamp - startTime) / 1000; // in seconds
        const currentTime = (Date.now() - startTime) / 1000; //in seconds
        
        //keep copPathData structure for now so it works in the updateCoPStats function just below this
        //also, copPathData has x and y units of inches, not coordinates, so for the path data, copPathData is best
        copPathData.push({
            x: xInches,
            y: yInches,
            timestamp: timestamp
        });

        //here is an example of playbackData structure:
        /*
        playbackData = [
            {
                timestamp: 1630000000000,
                pressure: [{ x: 12, y: 8, value: 450 }, { x: 10, y: 6, value: 300 }],
                cop: { x: 15, y: 10 }
            },
            {
                timestamp: 1630000000500,
                pressure: [{ x: 14, y: 7, value: 400 }, { x: 9, y: 5, value: 280 }],
                cop: { x: 16, y: 11 }
            }
        ];
        */
      
        // Construct the frame for playback
        //this isn't quite right, bec it's including multiple frames of data (the dataHistory length amount of frames)
        /*
        const frame = {
            timestamp: timestamp,
            pressure: dataHistory.flatMap(({ readings }) => readings.map(r => ({
                x: settings.invertX ? (settings.sensorsX - r.x) : r.x,
                y: settings.invertY ? (settings.sensorsY - r.y) : r.y,
                value: r.value
            }))),
            //cop: { x: xInches, y: yInches }
            cop: { x: copX, y: copY }
        };
        */
      
      
        //this is taken from updateRawData that also has readings passed in
        const frame = {
            timestamp: timestamp,              
            pressure: readings.map(reading => ({
              ...reading,
              x: settings.invertX ? (settings.sensorsX - reading.x) : reading.x,
              y: settings.invertY ? (settings.sensorsY - reading.y) : reading.y,
              value: reading.value
            })),
            //cop: { x: xInches, y: yInches }
            cop: { x: copX, y: copY }
        };

        // Append frame to playbackData
        playbackData.push(frame);
      
      
        // Check stop conditions
        if (checkSwingStop(currentTime, distance)) {
            stopSwing();
            return;
        }

        updateCoPStats();
        //updateCoPStats(frame.cop);
    }

    lastCopPosition = { x: xInches, y: yInches };  // Update last CoP position
}

function updateCoPStats() {
    if (copPathData.length < 2) return;
    //if (playbackData.length < 2) return;  //do this and the other commented outs if get rid of copPathData structure...

    // Calculate path distance
    let totalDistance = 0;
    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;

    //for (let i = 1; i < playbackData.length; i++) {
    for (let i = 1; i < copPathData.length; i++) {
        const dist = Math.sqrt(
            //Math.pow(playbackData[i].cop.x - playbackData[i-1].cop.x, 2) + 
            //Math.pow(playbackData[i].cop.y - playbackData[i-1].cop.y, 2)
            Math.pow(copPathData[i].x - copPathData[i-1].x, 2) + 
            Math.pow(copPathData[i].y - copPathData[i-1].y, 2)
        );
        totalDistance += dist;

        // Calculate instantaneous speed
        const timeDiff = (copPathData[i].timestamp - copPathData[i-1].timestamp) / 1000;
        const speed = dist / timeDiff;
        maxSpeedRecorded = Math.max(maxSpeedRecorded, speed);

        // Track min/max coordinates
        xMin = Math.min(xMin, copPathData[i].x);
        xMax = Math.max(xMax, copPathData[i].x);
        yMin = Math.min(yMin, copPathData[i].y);
        yMax = Math.max(yMax, copPathData[i].y);
    }

    const totalTime = (copPathData[copPathData.length-1].timestamp - startTime) / 1000;
    const avgSpeed = totalDistance / totalTime;

    // Update display
    document.getElementById('pathDistance').textContent = totalDistance.toFixed(2);    
    document.getElementById('avgSpeed').textContent = avgSpeed.toFixed(2);
    document.getElementById('maxSpeed').textContent = maxSpeedRecorded.toFixed(2);
    document.getElementById('totalTime').textContent = totalTime.toFixed(2);
    document.getElementById('xDistance').textContent = (xMax - xMin).toFixed(2);
    document.getElementById('yDistance').textContent = (yMax - yMin).toFixed(2);
}



function initializeSwingControls() {
    // Only need to set up event listeners since controls are now in HTML
    setupSettingControl('swingDuration');
    setupSettingControl('stopTriggerThreshold');
    setupSettingControl('copTriggerThreshold');
    
    // Add checkbox event listeners
    document.getElementById('useFixedDurationStop').addEventListener('change', (e) => {
        settings.useFixedDurationStop = e.target.checked;
    });
    
    document.getElementById('useMovementThresholdStop').addEventListener('change', (e) => {
        settings.useMovementThresholdStop = e.target.checked;
    });
    
    // Initialize playback controls
    initializePlaybackControls();
}


function setupSettingControl(settingName) {
    const input = document.getElementById(settingName);
    const slider = document.getElementById(`${settingName}Slider`);
    
    input.addEventListener('input', (e) => {
        slider.value = e.target.value;
        settings[settingName] = parseFloat(e.target.value);
    });
    
    slider.addEventListener('input', (e) => {
        input.value = e.target.value;
        settings[settingName] = parseFloat(e.target.value);
    });
}

function checkSwingStop(currentTime, distance) {
    if (!recordingStarted) return false;
    
    // Check fixed duration stop condition
    //if (currentTime >= settings.swingDuration) return true;
    
    // Check movement threshold stop condition
    //if (distance <= settings.stopTriggerThreshold) return true;
  
    // Check fixed duration stop condition
    if (settings.useFixedDurationStop && currentTime >= settings.swingDuration) {
        return true;
    }
    
    // Check movement threshold stop condition
    if (settings.useMovementThresholdStop && distance <= settings.stopTriggerThreshold) {
        return true;
    }
    
    return false;
}

function stopSwing() {
    isRecording = false;
    recordingStarted = false;
    
    // Prepare playback data  //this has been moved to the initializePlayback function
    /*
    playbackData = {
        frames: copPathData,
        pressureData: [], // You'll need to store pressure data for each frame
        copStats: []     // Store CoP stats for each frame
    };
    */
    
    // Show playback controls
    document.querySelector('.playback-controls').style.display = 'block';
  
    initializePlayback();
}

function initializePlaybackControls() {
    document.getElementById('skipStart').addEventListener('click', () => skipToFrame(0));
    document.getElementById('reversePlay').addEventListener('click', () => playReverse());
    document.getElementById('prevFrame').addEventListener('click', () => showPrevFrame());
    document.getElementById('playPause').addEventListener('click', () => togglePlay());
    document.getElementById('nextFrame').addEventListener('click', () => showNextFrame());
    document.getElementById('forwardPlay').addEventListener('click', () => playForward());
    document.getElementById('skipEnd').addEventListener('click', () => skipToFrame(-1));
    
    document.getElementById('frameSlider').addEventListener('input', (e) => {
        skipToFrame(parseInt(e.target.value));
    });
    
    document.getElementById('playbackSpeed').addEventListener('change', (e) => {
        settings.playbackSpeed = parseFloat(e.target.value);
        if (isPlaying) {
            stopPlayback();
            startPlayback();
        }
    });
}

function initializePlayback() {
  
    if (!playbackData || playbackData.length === 0) {
        updateConnectionInfo("No recorded data to playback.", true);
        return;
    }
  
    /*
    // Reset playback state
    isPlaying = true;
    currentFrameIndex = 0;
  
    // Start playback
    playbackInterval = setInterval(() => {
        if (currentFrameIndex >= playbackData.length) {
            stopPlayback();
            return;
        }

        // Render the current frame
        const frame = playbackData[currentFrameIndex];
        renderFrame(frame);

        currentFrameIndex++;
    }, 100); // Adjust playback speed (100ms per frame)
    */
  

    //if (debug == 6) console.log("plabackData.length= " + playbackData.length);  
    //if (debug == 6) console.log("plabackData= " + playbackData);
    if (debug == 6) console.log("plabackData.length= ", playbackData.length);  
    if (debug == 6) console.log("plabackData= ", playbackData);
  
    const slider = document.getElementById('frameSlider');
    slider.max = playbackData.length - 1;
    slider.value = 0;
    currentFrameIndex = 0;
    showFrame(0);    
  
}

//I don't think that renderFrame function is called anymore.  
  //I think the updateVisualizationsForFrame function is done instead
function renderFrame(frame) {
    if (!frame) return;
  
    if (debug == 5) console.log("renderFrame (below)");
    if (debug == 5) console.log("frame.timestamp: " + frame.timestamp);
    //if (debug == 5) console.log("frame.pressure: " + frame.pressure);
    if (debug == 5) console.log("frame.pressure: ");
    if (debug == 5) console.log(frame.pressure);
    if (debug == 5) console.log("frame.cop.x: " + frame.cop.x + "   frame.cop.y: " + frame.cop.y);
  

    // Update heatmap
    if (heatmapInstance && frame.pressure) {
        heatmapInstance.setData({
            min: 0,
            max: settings.maxValue,
            data: frame.pressure
        });
    }

    // Update CoP graph
    if (frame.cop) {
        const trace = {
            x: [frame.cop.x],
            y: [frame.cop.y],
            mode: 'markers',
            type: 'scatter',
            marker: { color: 'red', size: 8 }
        };

        const layout = {
            title: 'Center of Pressure (CoP) Playback',
            xaxis: { title: 'X Position (inches)' },
            yaxis: { title: 'Y Position (inches)' }
        };

        Plotly.newPlot('cop-graph', [trace], layout);
    }
}


function showFrame(frameIndex) {  
    if (!playbackData || frameIndex < 0 || frameIndex >= playbackData.length) return;
  
    if (debug == 6) console.log("playbackData = (below): ");
    if (debug == 6) console.log(playbackData);
    
    const frame = playbackData[frameIndex];
    const startTime = playbackData[0].timestamp;
    const frameTime = (frame.timestamp - startTime) / 1000;  //timestamps in ms / 1000 => seconds
    
    if (debug == 5) console.log("startTime: " + startTime + "   frameTime: " + frameTime);
    if (debug == 5) console.log("frame[" + frameIndex + "] (below): ");
    if (debug == 5) console.log(frame);
  
  
    // Update time display
    document.getElementById('timeDisplay').textContent = frameTime.toFixed(3) + 's';
    
    // Update slider
    document.getElementById('frameSlider').value = frameIndex;
    
    // Update visualizations with frame data
    updateVisualizationsForFrame(frame, frameIndex);  //frame=playbackData[frameIndex];
  
}

function updateVisualizationsForFrame(frame, frameIndex) {
  
    //the input frame is playbackData[frameIndex]
  
    if (!frame) {
        console.error("No frame data provided.");
        return;
    }
  
    // Apply frame data to visualizations
     
    //updateHeatmapWithRecordedSwing(frame.pressure);
    //updateHeatmapWithRecordedSwing(frame);  //sending whole frame so it gets pressure data and cop
    updateHeatmapWithRecordedSwing(frame, frameIndex);  //sending whole frame so it gets pressure data and cop
  
    //drawing the recorded swing CoP on the heatmap in the update heatmap function now instead
    //drawRecordedSwingCoPOnHeatmap(frame.cop);  //draw the CoP overlay over the heatmap
  
    updateCoPGraphWithRecordedSwing(frame.cop, frameIndex);    
    
    //calculatePressureDistributionFromRecordedSwing(frame.pressure);  // Update weight distribution
    calculatePressureDistributionFromRecordedSwing(frame);  // Update weight distribution
    
    //prob don't want them to re-update, since they're calculated based on the full swing
    //updateCoPStatsForFrame(frame.cop);  // Update CoP stats //prob don't want them to re-update, since they're calculated based on the full swing    
  
    updateRawDataWithRecordedSwing(frame);
  
}



//function updateHeatmapWithRecordedSwing(pressureData) {
//function updateHeatmapWithRecordedSwing(frame) {
function updateHeatmapWithRecordedSwing(frame, frameIndex) {
    //if (!heatmapInstance || pressureData.length === 0) return;
    if (!heatmapInstance || frame.pressure.length === 0) return;

    //const now = Date.now();  //timestamp since epoch in ms
    //const maxAge = settings.historyLength * 1000;  //converts historyLength in seconds to milliseconds
  
    //var minValue = 5000;   //seed min with largest possible value
    //var maxValue = 0;      //seed max with smallest possible value
    const pressureData = frame.pressure;
  
    //var minValue = Infinity;   // Start with the largest possible value
    //var maxValue = -Infinity;  // Start with the smallest possible value
    let dataMinValue = Infinity;   // Start with the largest possible value
    let dataMaxValue = -Infinity;  // Start with the smallest possible value
  
    var adjustedPressureData = [];

    // Get canvas dimensions and scaling factors
    const canvas = document.getElementById('heatmap');
    //const scaleX = canvas.offsetWidth / settings.matWidth;
    const scaleX = canvas.offsetWidth / settings.sensorsX;
    //const scaleX = canvas.width / settings.sensorsX;
    //const scaleY = canvas.offsetHeight / settings.matHeight;
    const scaleY = canvas.offsetHeight / settings.sensorsY;
    //const scaleY = canvas.height / settings.sensorsY;
  
    if (debug == 5) console.log("scaleX= " + scaleX + "   scaleY= " + scaleY);
  
    
     // Process pressure data  //the inversion checking has already been done...
    pressureData.forEach((reading) => {
        // Scale coordinates to canvas size
        const xScaled = reading.x * scaleX;
        //const yScaled = reading.y * scaleY;
          //pressure data has already been properly inverted... but that's for cartesian
          //so for heatmap display, need to convert to screen coordinates (i.e. invert y again)          
        const yScaled = (settings.sensorsY - reading.y) * scaleY;
        
        // Scale the value to create more variation in colors
        const scaledValue = Math.min(settings.maxValue, reading.value);
        const normalizedValue = (scaledValue / settings.maxValue) * reading.value;

        if (dataMaxValue < reading.value) dataMaxValue = reading.value;  
        if (dataMinValue > reading.value) dataMinValue = reading.value;

        const element = {
            x: xScaled,
            y: yScaled,
            value: reading.value // You may decide to use normalizedValue instead
        };
        
        adjustedPressureData.push(element);
    });
  
    //if (debug == 5) console.log("maxValue= " + maxValue + "  minValue= " + minValue);
    //if (debug == 5) console.log("heatmap pressureData: (below) ");
    //if (debug == 5) console.log(pressureData);
    if (debug == 5) {
        console.log("maxValue= " + maxValue + "  minValue= " + minValue);
        console.log("dataMaxValue= " + dataMaxValue + "  dataMinValue= " + dataMinValue);
        console.log("heatmap adjustedPressureData: ", adjustedPressureData);
    }
    //if (debug == 2) console.log("heatmap allDataPoints:");
    //if (debug == 2) console.log(allDataPoints);
  
    
    //heatmapInstance.setData({ data: [] }); // Clear previous data
  
    /*
    
    // Update using addData instead of setData
    heatmapInstance.configure({
        min: 0,
        max: settings.maxValue
    });
    
    // Add new data points individually
    allDataPoints.forEach(point => {
        heatmapInstance.addData(point);
    });
    */
  
  
    // Update heatmap data
    heatmapInstance.setData({
        min: settings.minValue,
        //max: settings.maxValue,
        //max: dataMaxValue,  //this gives the overall max value the color of red
        max: (dataMaxValue - 300),  //this gives the (overall max value)-300 counts the color of red - to ensure theres a lot of red on the heatmap
        //data: pressureData
        data: adjustedPressureData
    });
    
    
    //heatmapInstance.setDataMin(dataMinValue);  //this is especially bad, since it would set the activated point with the lowest reading to be dark blue and not show up at all
    //heatmapInstance.setDataMax(dataMaxValue);  
  
    /*
      //update suggested by Claude 3.5 using poe.com
      //introduces a "slight variation" to force updates and also calls .addData instead of .setData
    heatmapInstance.setData({
        min: minValue,
        max: maxValue,
        data: allDataPoints
    });
    */
  

    // Draw grid 
    //const canvas = document.getElementById('heatmap').querySelector('canvas');
    const canvas2 = document.getElementById('heatmap').querySelector('canvas');
    const ctx = canvas2.getContext('2d');
    
    //ctx.save();  //can't tell if these help or not.  commenting the save and restores out seems to maybe help a little on the heatmap problem
  
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;

    // Draw vertical grid lines
    const xStep = canvas2.width / settings.sensorsX;
    for (let i = 0; i <= settings.sensorsX; i++) {
        ctx.beginPath();
        ctx.moveTo(i * xStep, 0);
        ctx.lineTo(i * xStep, canvas2.height);
        ctx.stroke();
    }

    // Draw horizontal grid lines
    const yStep = canvas2.height / settings.sensorsY;
    for (let i = 0; i <= settings.sensorsY; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * yStep);
        ctx.lineTo(canvas2.width, i * yStep);
        ctx.stroke();
    }
  
  
    //draw recorded swing current CoP on heatmap
    let x = frame.cop.x;
    let y = frame.cop.y;
  
    //CoP data has already been properly inverted... but that's for cartesian
    //so for heatmap display, need to convert to screen coordinates (i.e. invert y again)  
    y = settings.sensorsY - y;
  
    if (debug == 5) console.log("cop.x= " + x + "   cop.y= " + y);

    //inversions already applied

    // Scale coordinates to canvas size
    //x = (x * canvas2.width) / settings.sensorsX;
    x = (x * canvas2.offsetWidth) / settings.sensorsX;
    //y = (y * canvas2.height) / settings.sensorsY;
    y = (y * canvas2.offsetHeight) / settings.sensorsY;
  
    if (debug == 5) console.log("scaled cop.x= " + x + "   scaled cop.y= " + y);

    ctx.beginPath();
    ctx.fillStyle = 'yellow';
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    //ctx.restore();  //can't tell if these help or not.  commenting the save and restores out seems to maybe help a little on the heatmap problem
  
    //drawRecordedSwingCoPOnHeatmap();
  
    //draw recorded swing history CoP on heatmap
    const slicedPlaybackData = playbackData.slice(0, frameIndex + 1);
  
    if (debug == 5) console.log("slicedPlaybackData= ", slicedPlaybackData);
    
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 2;
    ctx.beginPath();

    slicedPlaybackData.forEach((point, index) => {
        let x = point.cop.x;
        let y = point.cop.y;
        
          //pressure data has already been properly inverted... but that's for cartesian
          //so for heatmap display, need to convert to screen coordinates (i.e. invert y again)       
        y = settings.sensorsY - y;
      
        
        // Scale coordinates to canvas size
        //x = (x * canvas.width) / settings.sensorsX;
        //y = (y * canvas.height) / settings.sensorsY;
        x = (x * canvas2.offsetWidth) / settings.sensorsX;    
        y = (y * canvas2.offsetHeight) / settings.sensorsY;

        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();
  
    
}



//update recorded swing CoP Graph for Plotly Graphing
function updateCoPGraphWithRecordedSwing(frame, frameIndex) {
    if (!frame) return;
  
    let inchesPerSensorX = settings.matWidth / settings.sensorsX;
    let inchesPerSensorY = settings.matHeight / settings.sensorsY;
    //const xInches = copX * inchesPerSensorX;
    //const yInches = copY * inchesPerSensorY;
  
    const slicedPlaybackData = playbackData.slice(0, frameIndex + 1);  //slice the playbackData array to the correct length based on the curent frame to show the history up through the current frame of the playback
  
    // Prepare data for Plotly
      //for coordinate display
    //const xValues = slicedPlaybackData.map(slicedPlaybackData => slicedPlaybackData.cop.x);
    //const yValues = slicedPlaybackData.map(slicedPlaybackData => slicedPlaybackData.cop.y);
      
      //for inches display
    //const xValues = slicedPlaybackData.map(slicedPlaybackData => slicedPlaybackData.cop.x * inchesPerSensorX);
    //const yValues = slicedPlaybackData.map(slicedPlaybackData => slicedPlaybackData.cop.y * inchesPerSensorY);
  
  
    // Determine min and max values
    //const xMin = Math.min(...xValues);
    //const xMax = Math.max(...xValues);
    //const yMin = Math.min(...yValues);
    //const yMax = Math.max(...yValues);

    
    let xValues, yValues;
    let title, xAxisTitle, yAxisTitle;

    if (copMode === 'normal') {
        // Normal mode - use absolute coordinates
        xValues = slicedPlaybackData.map(data => data.cop.x);
        yValues = slicedPlaybackData.map(data => data.cop.y);
        title = 'Center of Pressure (CoP) Graph';
        xAxisTitle = 'X Position (coordinate)';
        yAxisTitle = 'Y Position (coordinate)';
    } else {
        // Delta mode - calculate relative to oldest point
        const basePoint = slicedPlaybackData[0].cop;
        xValues = slicedPlaybackData.map(data => 
            (data.cop.x - basePoint.x) * inchesPerSensorX
        );
        yValues = slicedPlaybackData.map(data => 
            (data.cop.y - basePoint.y) * inchesPerSensorY
        );
        title = 'Center of Pressure (CoP) Delta';
        xAxisTitle = 'X Delta (inches)';
        yAxisTitle = 'Y Delta (inches)';
    }
  
  
    const trace = {
        x: xValues,
        y: yValues,
        mode: 'lines+markers',
        type: 'scatter',
        marker: { color: 'blue', size: 6 },
    };

    
    /*
    // Prepare layout
    const layout = {
        title: 'Center of Pressure (CoP) Graph',
        xaxis: {
            title: 'X Position (inches)',
            //title: 'X Position (coordinate)',
            autorange: true,
            //range: invertX ? [xMax + 1, xMin - 1] : [xMin - 1, xMax + 1], // Adjust range for inversion
        },
        yaxis: {
            title: 'Y Position (inches)',
            //title: 'Y Position (coordinate)',
            autorange: true,
            //range: invertY ? [yMax + 1, yMin - 1] : [yMin - 1, yMax + 1],  // Invert Y axis based on checkbox state
            //range: invertY ? [yMin - 1, yMax + 1] : [yMax + 1, yMin - 1],  //this inverts it back again // Invert Y axis based on checkbox state
        },
    };
    */
  
  
    const layout = {
        title: title,
        xaxis: {
            title: xAxisTitle,
            autorange: true,
            //tickformat: '.2f',  // Format to 2 decimal places
            //dtick: 0.01        // Minimum tick increment of 0.01
            tickformat: '0.2f',    // Changed from '.2f' to '0.2f' for better compatibility
            //tickformat: '0.1f',    // changed to 1 decimal place
            nticks: 10,            // Suggest number of ticks
            exponentformat: 'none', // Prevent scientific notation
            showexponent: 'none'    // Prevent scientific notation
        },
        yaxis: {
            title: yAxisTitle,
            autorange: true,
            //tickformat: '.2f',  // Format to 2 decimal places
            //dtick: 0.01        // Minimum tick increment of 0.01
            tickformat: '0.2f',    // Changed from '.2f' to '0.2f' for better compatibility
            //tickformat: '0.1f',    // changed to 1 decimal place
            nticks: 10,            // Suggest number of ticks
            exponentformat: 'none', // Prevent scientific notation
            showexponent: 'none'    // Prevent scientific notation
        }
    };
  

    // Update the graph
    Plotly.newPlot('cop-graph', [trace], layout);
}


/*
//calculating with just the per-frame X and Y bounds for heel/toe and front foot/back foot
function calculatePressureDistributionFromRecordedSwing(frame) {  //this is for the weight distribution stuff
    //if (!readings || readings.length === 0) return;
    if (!frame || frame.pressure.length === 0) return;
  
    const pressureData = frame.pressure;    
  
    if (debug == 4) console.log("pressureData= ", pressureData);

    // Find min and max X values to determine front/back split
    const xValues = pressureData.map(r => r.x);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const xMidpoint = minX + (maxX - minX) / 2;
  
    if (debug == 4) console.log("xMidpoint= " + xMidpoint + "   minX= " + minX + "   maxX= " + maxX);

    // Separate front and back foot readings
    //const frontFootReadings = adjustedReadings.filter(r => r.adjustedX >= xMidpoint); // before fixing inverts
    //const backFootReadings = adjustedReadings.filter(r => r.adjustedX < xMidpoint);   // before fixing inverts
    const frontFootReadings = pressureData.filter(r => r.x <= xMidpoint);   // after fixing inverts
    const backFootReadings = pressureData.filter(r => r.x > xMidpoint);     // after fixing inverts

    // Calculate total pressure
    const totalPressure = pressureData.reduce((sum, r) => sum + r.value, 0);

    // Process front foot
    const frontFootData = processFootDataFromRecordedSwing(frontFootReadings, totalPressure);

    // Process back foot
    const backFootData = processFootDataFromRecordedSwing(backFootReadings, totalPressure);

    // Update display
    updatePressureDisplayFromRecordedSwing('front', frontFootData);
    updatePressureDisplayFromRecordedSwing('back', backFootData);
}
*/


/*
//calculating with just the per-frame X and Y bounds for heel/toe and front foot/back foot
function processFootDataFromRecordedSwing(footReadings, totalPressure) {
    if (footReadings.length === 0) return { total: 0, toe: 0, heel: 0 };

    const footTotal = footReadings.reduce((sum, r) => sum + r.value, 0);
    const footPercentage = Math.round((footTotal / totalPressure) * 100);

    // Find toe/heel split based on this foot's data
    //const yValues = footReadings.map(r => r.adjustedY);
    const yValues = footReadings.map(r => r.y);
    //const yMidpoint = (Math.min(...yValues) + Math.max(...yValues)) / 2;  //(min + max)/2 gives same as ((max-min)/2)+min
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const yMidpoint = minY + (maxY - minY) / 2;
  
    if (debug == 4) console.log("yMidpoint= " + yMidpoint + "   minY= " + minY + "   maxY= " + maxY);

    //const toeReadings = footReadings.filter(r => r.adjustedY >= yMidpoint);  // <= xMidpoint
    //const heelReadings = footReadings.filter(r => r.adjustedY < yMidpoint);  //  > xMidpoint
    const toeReadings = footReadings.filter(r => r.y >= yMidpoint);  // <= xMidpoint
    const heelReadings = footReadings.filter(r => r.y < yMidpoint);  //  > xMidpoint

    const toeTotal = toeReadings.reduce((sum, r) => sum + r.value, 0);
    const heelTotal = heelReadings.reduce((sum, r) => sum + r.value, 0);

    const toePercentage = Math.round((toeTotal / footTotal) * 100);
    const heelPercentage = Math.round((heelTotal / footTotal) * 100);

    return {
        total: footPercentage,
        toe: toePercentage,
        heel: heelPercentage
    };
}
*/


/*
//this is now the function calculatePressureDistributionFromRecordedSwingUsingRecordedBoundaries below
//updated for whole recording overall x and y bounds for heel/toe and front/back foot
function calculatePressureDistributionFromRecordedSwing(frame) {
    if (!playbackData || playbackData.length === 0 || !frame || frame.pressure.length === 0) return;

    // First, analyze all frames to find overall boundaries
    let overallMinX = Infinity;
    let overallMaxX = -Infinity;
    let frontFootMinY = Infinity;
    let frontFootMaxY = -Infinity;
    let backFootMinY = Infinity;
    let backFootMaxY = -Infinity;

    // Find overall X boundaries and initial foot separation point
    playbackData.forEach(frameData => {
        frameData.pressure.forEach(point => {
            overallMinX = Math.min(overallMinX, point.x);
            overallMaxX = Math.max(overallMaxX, point.x);
        });
    });

    // Calculate the midpoint for front/back foot separation
    const xMidpoint = overallMinX + (overallMaxX - overallMinX) / 2;

    // Now find Y boundaries for each foot across all frames
    playbackData.forEach(frameData => {
        frameData.pressure.forEach(point => {
            if (point.x <= xMidpoint) { // Front foot
                frontFootMinY = Math.min(frontFootMinY, point.y);
                frontFootMaxY = Math.max(frontFootMaxY, point.y);
            } else { // Back foot
                backFootMinY = Math.min(backFootMinY, point.y);
                backFootMaxY = Math.max(backFootMaxY, point.y);
            }
        });
    });

    // Calculate midpoints for toe/heel separation for each foot
    const frontFootYMidpoint = frontFootMinY + (frontFootMaxY - frontFootMinY) / 2;
    const backFootYMidpoint = backFootMinY + (backFootMaxY - backFootMinY) / 2;

    // Now process the current frame using these established boundaries
    const pressureData = frame.pressure;
    const totalPressure = pressureData.reduce((sum, r) => sum + r.value, 0);

    // Separate front and back foot readings using the established xMidpoint
    const frontFootReadings = pressureData.filter(r => r.x <= xMidpoint);
    const backFootReadings = pressureData.filter(r => r.x > xMidpoint);

    // Process front foot using established frontFootYMidpoint
    const frontFootData = processFootDataFromRecordedSwingWithBoundaries(
        frontFootReadings,
        totalPressure,
        frontFootYMidpoint
    );

    // Process back foot using established backFootYMidpoint
    const backFootData = processFootDataFromRecordedSwingWithBoundaries(
        backFootReadings,
        totalPressure,
        backFootYMidpoint
    );

    // Update display
    updatePressureDisplayFromRecordedSwing('front', frontFootData);
    updatePressureDisplayFromRecordedSwing('back', backFootData);

    if (debug == 5) {
        console.log("Overall boundaries:", {
            xRange: { min: overallMinX, max: overallMaxX, mid: xMidpoint },
            frontFoot: { minY: frontFootMinY, maxY: frontFootMaxY, midY: frontFootYMidpoint },
            backFoot: { minY: backFootMinY, maxY: backFootMaxY, midY: backFootYMidpoint }
        });
    }
}
*/


function calculatePressureDistributionFromRecordedSwing(frame) {
    if (!playbackData || playbackData.length === 0 || !frame || frame.pressure.length === 0) return;

    // ISSUE: The frame.pressure data coming from playbackData 
    // already has inversions applied during recording
    // This means we don't need to re-apply inversions here
  
    const method = document.querySelector('input[name="weightDistMethod"]:checked').value;

    if (method === 'calibrated') {
        // Use stance calibration boundaries if available
        if (!stanceCalibrationData) {
            console.warn('Stance calibration data not available, falling back to per-frame method');
            calculatePressureDistributionFromRecordedSwingUsingRecordedBoundaries(frame);
            return;
        }

        // Use the stance calibration boundaries
        const boundaries = stanceCalibrationData;
        const pressureData = frame.pressure;
        
        if (linearFit) {
            //for linear relationship:
            const totalPressure = pressureData.reduce((sum, r) => sum + r.value, 0);            
            // Separate front and back foot readings using calibrated xMidpoint
            const frontFootReadings = pressureData.filter(r => r.x <= boundaries.xRange.mid);
            const backFootReadings = pressureData.filter(r => r.x > boundaries.xRange.mid);
            // Process front foot using calibrated boundaries
            const frontFootData = processFootDataFromRecordedSwingWithBoundaries(
                frontFootReadings,
                totalPressure,  //for linear relationship                
                boundaries.frontFoot.minY + ((boundaries.frontFoot.maxY - boundaries.frontFoot.minY) / 2)
            );
            // Process back foot using calibrated boundaries
            const backFootData = processFootDataFromRecordedSwingWithBoundaries(
                backFootReadings,
                totalPressure,  //for linear relationship                
                boundaries.backFoot.minY + ((boundaries.backFoot.maxY - boundaries.backFoot.minY) / 2)
            );
            // Update display
            updatePressureDisplayFromRecordedSwing('front', frontFootData);
            updatePressureDisplayFromRecordedSwing('back', backFootData);          
        }
        else{          
            // Calculate total weight instead of total pressure
            const totalWeight = pressureData.reduce((sum, r) => sum + zValueToWeight(r.value), 0);  //for power fit relationship
            // Separate front and back foot readings using calibrated xMidpoint
            const frontFootReadings = pressureData.filter(r => r.x <= boundaries.xRange.mid);
            const backFootReadings = pressureData.filter(r => r.x > boundaries.xRange.mid);
            // Process front foot using calibrated boundaries
            const frontFootData = processFootDataFromRecordedSwingWithBoundaries(
                frontFootReadings,
                totalWeight,  //for power fit relationship
                boundaries.frontFoot.minY + ((boundaries.frontFoot.maxY - boundaries.frontFoot.minY) / 2)
            );
            // Process back foot using calibrated boundaries
            const backFootData = processFootDataFromRecordedSwingWithBoundaries(
                backFootReadings,                
                totalWeight,  //for power fit relationship
                boundaries.backFoot.minY + ((boundaries.backFoot.maxY - boundaries.backFoot.minY) / 2)
            );
            // Update display
            updatePressureDisplayFromRecordedSwing('front', frontFootData);
            updatePressureDisplayFromRecordedSwing('back', backFootData);          
        }      
      
    } else {
        // Use boundaries calculated from the entire recording
        calculatePressureDistributionFromRecordedSwingUsingRecordedBoundaries(frame);
    }
}


//for power relationship between weight and z values:
// Also update calculatePressureDistributionFromRecordedSwing for consistency
function calculatePressureDistributionFromRecordedSwingUsingRecordedBoundaries(frame) {
    // Find overall boundaries from the entire recording
    let overallMinX = Infinity;
    let overallMaxX = -Infinity;
    let frontFootMinY = Infinity;
    let frontFootMaxY = -Infinity;
    let backFootMinY = Infinity;
    let backFootMaxY = -Infinity;

    // Find overall X boundaries and initial foot separation point
    playbackData.forEach(frameData => {
        frameData.pressure.forEach(point => {
            overallMinX = Math.min(overallMinX, point.x);
            overallMaxX = Math.max(overallMaxX, point.x);
        });
    });
  
    // Calculate the midpoint for front/back foot separation
    const xMidpoint = overallMinX + (overallMaxX - overallMinX) / 2;
    
    // Now find Y boundaries for each foot across all frames
    playbackData.forEach(frameData => {
        frameData.pressure.forEach(point => {
            if (point.x <= xMidpoint) { // Front foot
                frontFootMinY = Math.min(frontFootMinY, point.y);
                frontFootMaxY = Math.max(frontFootMaxY, point.y);
            } else { // Back foot
                backFootMinY = Math.min(backFootMinY, point.y);
                backFootMaxY = Math.max(backFootMaxY, point.y);
            }
        });
    });
  
    // Calculate midpoints for toe/heel separation for each foot
    const frontFootYMidpoint = frontFootMinY + ((frontFootMaxY - frontFootMinY) / 2);
    const backFootYMidpoint = backFootMinY + ((backFootMaxY - backFootMinY) / 2);
  
    if (linearFit) {
        //for linear fit:
        // Process the current frame using these boundaries
        const pressureData = frame.pressure;
        const totalPressure = pressureData.reduce((sum, r) => sum + r.value, 0);
        // Separate front and back foot readings
        const frontFootReadings = pressureData.filter(r => r.x <= xMidpoint);
        const backFootReadings = pressureData.filter(r => r.x > xMidpoint);
        // Process each foot
        const frontFootData = processFootDataFromRecordedSwingWithBoundaries(
            frontFootReadings,
            totalPressure,
            frontFootYMidpoint
        );
        const backFootData = processFootDataFromRecordedSwingWithBoundaries(
            backFootReadings,
            totalPressure,
            backFootYMidpoint
        );
        // Update display
        updatePressureDisplayFromRecordedSwing('front', frontFootData);
        updatePressureDisplayFromRecordedSwing('back', backFootData);
    }
    else { //for power fit:
        const pressureData = frame.pressure;
        // Calculate total weight instead of total pressure
        const totalWeight = pressureData.reduce((sum, r) => sum + zValueToWeight(r.value), 0);
        const frontFootReadings = pressureData.filter(r => r.x <= xMidpoint);
        const backFootReadings = pressureData.filter(r => r.x > xMidpoint);
        const frontFootData = processFootDataFromRecordedSwingWithBoundaries(
            frontFootReadings,
            totalWeight,
            frontFootYMidpoint
        );
        const backFootData = processFootDataFromRecordedSwingWithBoundaries(
            backFootReadings,
            totalWeight,
            backFootYMidpoint
        );
        updatePressureDisplayFromRecordedSwing('front', frontFootData);
        updatePressureDisplayFromRecordedSwing('back', backFootData);
    }

    if (debug == 4) {
        console.log("Overall boundaries:", {
            xRange: { min: overallMinX, max: overallMaxX, mid: xMidpoint },
            frontFoot: { minY: frontFootMinY, maxY: frontFootMaxY, midY: frontFootYMidpoint },
            backFoot: { minY: backFootMinY, maxY: backFootMaxY, midY: backFootYMidpoint }
        });
    }
  
}



function processFootDataFromRecordedSwingWithBoundaries(footReadings, totalPressure, yMidpoint) {
    if (footReadings.length === 0) return { total: 0, toe: 0, heel: 0 };
  
    // Note: footReadings already have inversion applied from recording
  
    let footPercentage = 0;
    let toePercentage = 0;
    let heelPercentage = 0;
  
    if (linearFit) {
        //for linear relationship:
        const footTotal = footReadings.reduce((sum, r) => sum + r.value, 0);
        footPercentage = Math.round((footTotal / totalPressure) * 100);
        // Separate toe and heel readings using the established yMidpoint
        const toeReadings = footReadings.filter(r => r.y >= yMidpoint);
        const heelReadings = footReadings.filter(r => r.y < yMidpoint);
        // Calculate toe and heel percentages relative to this foot's total pressure
        const toeTotal = toeReadings.reduce((sum, r) => sum + r.value, 0);
        const heelTotal = heelReadings.reduce((sum, r) => sum + r.value, 0);
        //for linear relationship:
        toePercentage = Math.round((toeTotal / footTotal) * 100) || 0;
        heelPercentage = Math.round((heelTotal / footTotal) * 100) || 0;
    }
    else {
        // Convert z-values to weights
        const footWeights = footReadings.map(r => ({
            ...r,
            weight: zValueToWeight(r.value)
        }));
        //for power relationship:
        const totalWeight = footWeights.reduce((sum, r) => sum + r.weight, 0);
        //updated the calc pressure dist functions to send total weight which is already converted from raw z values to weight with the power fit eqn.
        //const allTotalWeight = zValueToWeight(totalPressure); // Convert total pressure to weight
        const allTotalWeight = totalPressure; //already converted from raw z values to weight in the calling function  
        footPercentage = Math.round((totalWeight / allTotalWeight) * 100);        
        // Separate toe and heel readings using the established yMidpoint
        const toeReadings = footWeights.filter(r => r.y >= yMidpoint);
        const heelReadings = footWeights.filter(r => r.y < yMidpoint);          
        // Calculate toe and heel percentages relative to this foot's total weight
        const toeWeight = toeReadings.reduce((sum, r) => sum + r.weight, 0);
        const heelWeight = heelReadings.reduce((sum, r) => sum + r.weight, 0);
        //for power relationship:
        toePercentage = Math.round((toeWeight / totalWeight) * 100) || 0;
        heelPercentage = Math.round((heelWeight / totalWeight) * 100) || 0;
    }
  
    return {
        total: footPercentage,
        toe: toePercentage,
        heel: heelPercentage
    };
  
}


function updatePressureDisplayFromRecordedSwing(foot, data) {
    document.getElementById(`${foot}-percentage`).textContent = data.total;
    document.getElementById(`${foot}-toe-percentage`).textContent = `Toe: ${data.toe}%`;
    document.getElementById(`${foot}-heel-percentage`).textContent = `Heel: ${data.heel}%`;
}


function updateRawDataWithRecordedSwing(frame) {
    const rawData = document.getElementById('raw-data');
    const frameTime = (frame.timestamp - startTime) / 1000;  //timestamps in ms / 1000 => seconds
  
    //rawData.innerHTML = `<div>[${frame.timestamp}] Recorded readings:</div>`;
    rawData.innerHTML = `<div>[${frameTime.toFixed(3)}] Recorded readings:</div>`;
    
    frame.pressure.forEach(reading => {
        rawData.innerHTML += `<div>x: ${reading.x}, y: ${reading.y}, pressure: ${reading.value}</div>`;
    });
  
    if (frame.cop) {
        //rawData.innerHTML += `<div>CoP: x= ${cop.x}, y= ${cop.y}</div>`;  //this is for un-adjusted RAW data
        rawData.innerHTML += `<div>CoP: x= ${frame.cop.x}, y= ${frame.cop.y}</div>`;  //this is for inversion-adjusted cartesion coordinate data display
    }
  
}


function togglePlay() {
    if (isPlaying) {
        stopPlayback();
    } else {
        playForward();
    }
}

function playForward() {
    //stopPlayback();
    if (isPlaying) return;
    isPlaying = true;
    document.getElementById('playPause').textContent = '⏸';
    startPlayback(1);
}

function playReverse() {
    if (isPlaying) return;
    //stopPlayback();
    isPlaying = true;
    document.getElementById('playPause').textContent = '⏸';
    startPlayback(-1);
}

function startPlayback(direction) {
    //const timePerFrameMs = 1000 / 30; // Assuming 30 fps
    //const timePerFrameMs = 1000 / 10; // Assuming 10 fps
    
    //const frame = playbackData[frameIndex];
    const frameLength = playbackData.length;
    const startTime = playbackData[0].timestamp;
    const endTime = playbackData[frameLength - 1].timestamp;
    const timePerFrameMs = (endTime - startTime) / frameLength;
  
    playbackInterval = setInterval(() => {
        if (direction === 1) {
            currentFrameIndex++;
            if (currentFrameIndex >= playbackData.length) {
                stopPlayback();
                return;
            }
        } else {
            currentFrameIndex--;
            if (currentFrameIndex < 0) {
                stopPlayback();
                return;
            }
        }
        showFrame(currentFrameIndex);
    }, timePerFrameMs / settings.playbackSpeed);
}

function stopPlayback() {
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
    isPlaying = false;
    document.getElementById('playPause').textContent = '⏯';
}

function showNextFrame() {
    stopPlayback();
    if (currentFrameIndex < playbackData.length - 1) {
        showFrame(++currentFrameIndex);
    }
}

function showPrevFrame() {
    stopPlayback();
    if (currentFrameIndex > 0) {
        showFrame(--currentFrameIndex);
    }
}

function skipToFrame(index) {
    stopPlayback();
    if (index === -1) index = playbackData.length - 1;
    currentFrameIndex = index;
    showFrame(currentFrameIndex);
}


// Modified handleData function to handle incoming data chunks
function handleData(event) {
    const decoder = new TextDecoder();
    const chunk = decoder.decode(event.target.value);
    
    if (debug == 1) console.log("Received chunk:", chunk);
    
    // Append the new chunk to our buffer
    dataBuffer += chunk;
    
    // Process any complete frames in the buffer
    let newlineIndex;
    while ((newlineIndex = dataBuffer.indexOf('\n')) !== -1) {
        // Extract the complete frame
        const frame = dataBuffer.substring(0, newlineIndex).trim();
        // Remove the processed frame from the buffer
        dataBuffer = dataBuffer.substring(newlineIndex + 1);
        
        if (debug == 1) console.log("Processing complete frame:", frame);
        
        // Process the complete frame
        processFrame(frame);
    }
}

// New function to process complete frames
function processFrame(frame) {
    // Reset clear timeout
    //if (clearTimeout) clearTimeout(clearTimeout);
    if (myClearTimeout) clearTimeout(myClearTimeout);
    
    lastDataTimestamp = Date.now();  //Date.now() is in milliseconds since epoch
    const { readings, cop } = parsePressureData(frame);
    
    // Only update if we have readings
    if (readings.length > 0) {
      
        // Add calibration data collection here
        if (isCalibrating) {
            stanceCalibrationData.push([...readings]); // Store a copy of the readings
            
            // Optional: Check if calibration time is exceeded here
            if (Date.now() - calibrationStartTime >= CALIBRATION_DURATION) {
                finishCalibration();
            }
        }
      
        // Add to history
        dataHistory.push({
            timestamp: lastDataTimestamp,
            readings: readings
        });
        
        // Trim history if needed
        if (dataHistory.length > settings.historyLength) {
            dataHistory = dataHistory.slice(-settings.historyLength);
        }   
      
        if (debug == 6) console.log("dataHistory: ", dataHistory);
      
        if (cop) {
            copHistory.push(cop);  //this adds an element to the end of the array

            // Trim CoP history if needed
            if (copHistory.length > settings.copHistoryLength) {
                copHistory = copHistory.slice(-settings.copHistoryLength);
                //copHistory.pop();  //didn't work
                //copHistory.splice(0, 1);  //this deletes one element from the array at index 0  //i.e. it removes copHistory[0] and shifts everything left
            }
          
            if (debug == 6) console.log("copHistory: ", copHistory);
          
        }
      
      
        //added this above instead, along with the checking of the calibration time
        // Add this near where you process the frame  
          //this stores the current readings when doing Stance Calibration      
        //if (isCalibrating) {
        //    stanceCalibrationData.push([...readings]); // Store a copy of the readings
        //}
      
      
        updateHeatmapWithHistory();
        
        updateRawData(readings, cop);
        updateCoPGraph(); // Add this line
        //calculateFootPressureDistribution(readings);  //this was for only doing front vs back foot  // Add this line where you process new sensor readings      
        calculatePressureDistribution(readings);  //this does front vs back foot with toe vs heel
        //processCoPData(cop);
        processCoPData(readings, cop);
             
    }
  
    
    // Set new clear timeout
    myClearTimeout = setTimeout(() => {
        dataHistory = [];
        heatmapInstance.setData({ data: [] });
      
        //clear the CoP trace drawn on top of the heatmap
        let overlayCanvas = document.getElementById('heatmap-overlay');
        const ctx = overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      
        clearCoPGraph(); // Clear the CoP graph
        updateConnectionInfo('No data received for ' + (settings.clearTime / 1000) + ' seconds - display cleared');
    }, settings.clearTime);
    
}


function parsePressureData(data) {
    try {
        //if (debug == 1) console.log("incoming data = " + data);
      
        // Handle empty frame
        if (data === '[]') {
            return { readings: [], cop: null };
        }

        // Remove outer brackets and check for COP data        
        let cleanData = data.replace(/^\[{1,2}|\]{1,2}$/g, '');  // Handle both single and double brackets
        let copData = null;
      
        if (debug == 1) console.log("cleanData(outer brackets removed)-before cop extract = " + cleanData);

        // Check for and extract COP data
        if (cleanData.includes('cop:')) {
            const [pressureData, cop] = cleanData.split('cop:');
            cleanData = pressureData.replace(/\]$/, ''); // Remove any trailing bracket
            
            if (debug == 1) console.log("cop (after splitting on cop:) = " + cop);
          
            // Remove curly braces and parse CoP coordinates
            const copClean = cop.replace(/{|}|\s/g, '');  // Remove curly braces and any whitespace
            if (debug == 1) console.log("CoP data after cleaning:", copClean);
            
            const copCoords = copClean.split(',').map(Number);
            copData = {
                x: copCoords[0],
                y: copCoords[1]
            };
            
            if (debug == 1) {
                console.log("Pressure data after cop extract:", cleanData);
                console.log("Parsed CoP data:", copData);
            }
        }
      
        if (debug == 1) console.log("cleanData(outer brackets removed)-after cop extract = " + cleanData);

        // Handle single data point case
        if (!cleanData.includes('},{')) {
            // Single data point format: {x,y,value}
            const values = cleanData.replace(/{|}/g, '').split(',').map(Number);
            return {
                readings: [{
                    x: values[0],
                    y: values[1],
                    value: values[2]
                }],
                cop: copData
            };
        }

        // Parse multiple pressure readings
        const readings = cleanData.split('},{').map(reading => {
            const values = reading.replace(/{|}/g, '').split(',').map(Number);
            return {
                x: values[0],
                y: values[1],
                value: values[2]
            };
        });

        return {
            readings,
            cop: copData
        };
    } catch (error) {
        console.error('Error parsing pressure data:', error);
        updateConnectionInfo('Error parsing data: ' + error.message, true);
        return { readings: [], cop: null };
    }
}


// Update status message
function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

// Update connection info
function updateConnectionInfo(message, isError = false) {
    const connectionInfo = document.getElementById('connection-info');
    const timestamp = new Date().toLocaleTimeString();
    const color = isError ? '#ff4444' : '#4CAF50';
    connectionInfo.innerHTML += `<div style="color: ${color}">[${timestamp}] ${message}</div>`;
    connectionInfo.scrollTop = connectionInfo.scrollHeight;
}

// Update raw data display
//function updateRawData(readings) {
function updateRawData(readings, cop) {
    const rawData = document.getElementById('raw-data');
    const timestamp = new Date().toLocaleTimeString();
  
    // Adjust X and Y coordinates based on inversion setting
    const adjustedReadings = readings.map(reading => ({
        ...reading,
        adjustedX: settings.invertX ? (settings.sensorsX - reading.x) : reading.x,
        adjustedY: settings.invertY ? (settings.sensorsY - reading.y) : reading.y,
        adjustedPressure: reading.value
    }));
  
    // Adjust CoP X and Y coordinates based on inversion setting  
    let adjustedCoPx = cop.x;
    let adjustedCoPy = cop.y;  
    // Apply inversion if enabled
    if (settings.invertX) {
        adjustedCoPx = settings.sensorsX - adjustedCoPx;
    }    
    if (settings.invertY) {
        adjustedCoPy = settings.sensorsY - adjustedCoPy;
    }
  
    rawData.innerHTML = `<div>[${timestamp}] Latest readings:</div>`;
    
    adjustedReadings.forEach(adjustedReading => {
        rawData.innerHTML += `<div>x: ${adjustedReading.adjustedX}, y: ${adjustedReading.adjustedY}, pressure: ${adjustedReading.adjustedPressure}</div>`;
    });
  
    if (cop) {
        //rawData.innerHTML += `<div>CoP: x= ${cop.x}, y= ${cop.y}</div>`;  //this is for un-adjusted RAW data
        rawData.innerHTML += `<div>CoP: x= ${adjustedCoPx}, y= ${adjustedCoPy}</div>`;  //this is for inversion-adjusted cartesion coordinate data display
    }
}


//changed to automatically connect and also automatically try to reconnect up to 3 times
async function connectToDevice(device) {
    const MAX_RETRY_ATTEMPTS = 3;
    const RETRY_DELAY = 1000; // 1 second delay between retries
    
    async function attemptConnection(retryCount = 0) {
        try {
            bluetoothDevice = device;
            dataBuffer = '';
            
            updateStatus('Connecting to device...');
            updateConnectionInfo(`Connecting to device: ${device.name || 'Unnamed Device'} (Attempt ${retryCount + 1})`);
            
            // Add disconnect event listener
            device.addEventListener('gattserverdisconnected', handleDisconnection);
            
            const server = await device.gatt.connect();
            updateConnectionInfo('GATT server connected');
            
            // Try Nordic UART first, then Microchip UART
            let service;
            try {
                service = await server.getPrimaryService(MICROCHIP_UART_SERVICE);
                updateConnectionInfo('Connected using Microchip UART Service');
                characteristic = await service.getCharacteristic(MICROCHIP_UART_TX);
            } catch {                
                service = await server.getPrimaryService(NORDIC_UART_SERVICE);
                updateConnectionInfo('Connected using Nordic UART Service');
                characteristic = await service.getCharacteristic(NORDIC_UART_TX);
            }

            characteristic.addEventListener('characteristicvaluechanged', handleData);
            await characteristic.startNotifications();
            
            updateConnectionInfo('Notifications started - ready to receive data');
            updateStatus('Connected and receiving data');
            
            // Reset auto-reconnect state since we successfully connected
            device.autoReconnectEnabled = true;
          
            // Enable disconnect button and disable scan button
            document.getElementById('disconnectButton').disabled = false;
            document.getElementById('scanButton').disabled = true;
          
            
        } catch (error) {
            console.error('Connection error:', error);
            updateConnectionInfo(`Connection failed (Attempt ${retryCount + 1}): ${error.message}`, true);
            
            if (retryCount < MAX_RETRY_ATTEMPTS) {
                updateConnectionInfo(`Retrying connection in ${RETRY_DELAY/1000} seconds...`);
                setTimeout(() => attemptConnection(retryCount + 1), RETRY_DELAY);
            } else {
                updateConnectionInfo('Maximum retry attempts reached. Please try scanning again.', true);
                updateStatus('Connection failed after multiple attempts');
            }
        }
    }
    
    // Start the connection attempt
    await attemptConnection();
}



//changed to automatically connect and also automatically try to reconnect up to 3 times
function handleDisconnection(event) {
    const device = event.target;
    
    if (device.autoReconnectEnabled) {    
        updateConnectionInfo('Device disconnected unexpectedly!', true);
    }
    
    updateStatus('Device disconnected');
    
    // Clear the device list
    //document.getElementById('deviceList').innerHTML = '';
    
    // Reset variables
    characteristic = null;
    dataBuffer = '';
  
    // Update button states
    document.getElementById('disconnectButton').disabled = true;
    document.getElementById('scanButton').disabled = false;
    
    // Only attempt to reconnect if auto-reconnect is still enabled
    if (device.autoReconnectEnabled) {
        updateConnectionInfo('Attempting to reconnect...');
        connectToDevice(device).catch(error => {
            console.error('Auto-reconnect failed:', error);
            updateConnectionInfo('Auto-reconnect failed: ' + error.message, true);
        });
    } else {
        updateConnectionInfo('Device disconnected - scan to reconnect');
    }
  
}


//changed to automatically connect
async function scanForDevices() {
    try {
        updateStatus('Scanning for devices...');
        updateConnectionInfo('Starting device scan...');
        
        const device = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [NORDIC_UART_SERVICE] },
                { services: [MICROCHIP_UART_SERVICE] }
            ]
        });

        updateConnectionInfo(`Device found: ${device.name || 'Unnamed Device'}`);

        // Automatically connect to the device after selection
        await connectToDevice(device);
        
    } catch (error) {
        console.error('Scanning error:', error);
        updateConnectionInfo('Scanning failed: ' + error.message, true);
        updateStatus('Scanning failed: ' + error);
    }
}


async function disconnectDevice() {
    try {
        if (bluetoothDevice && bluetoothDevice.gatt.connected) {
            // Disable auto-reconnect before disconnecting
            bluetoothDevice.autoReconnectEnabled = false;
            await bluetoothDevice.gatt.disconnect();
            updateConnectionInfo('Device disconnected successfully');
            updateStatus('Disconnected');
            
            // Reset variables
            characteristic = null;
            dataBuffer = '';
            dataHistory = [];
            copHistory = [];
            
            // Clear visualizations
            if (heatmapInstance) {
                heatmapInstance.setData({ data: [] });
            }
          
            //clear the CoP trace drawn on top of the heatmap
            let overlayCanvas = document.getElementById('heatmap-overlay');
            const ctx = overlayCanvas.getContext('2d');
            ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
          
            clearCoPGraph();
            
            // Disable disconnect button and enable scan button
            document.getElementById('disconnectButton').disabled = true;
            document.getElementById('scanButton').disabled = false;
            
        } else {
            updateConnectionInfo('No device connected');
        }
    } catch (error) {
        console.error('Disconnect error:', error);
        updateConnectionInfo('Disconnect failed: ' + error.message, true);
    }
}


// Event listeners
document.getElementById('scanButton').addEventListener('click', scanForDevices);
// Add event listener for disconnect button
document.getElementById('disconnectButton').addEventListener('click', disconnectDevice);



document.addEventListener("DOMContentLoaded", () => {
    const settingsToggle = document.getElementById("settingsToggle");
    const settingsSection = document.getElementById("settingsSection");
    const matSettingsToggle = document.getElementById("matSettingsToggle");
    const matSettingsSection = document.getElementById("matSettingsSection");
  
    const debugInformationToggle = document.getElementById("debugInformationToggle");
    const debugInformationSection = document.getElementById("connection-info");

    // Hide sections by default
    settingsSection.style.display = "none";
    matSettingsSection.style.display = "none";
    debugInformationSection.style.display = "none";

    // Add event listeners to toggle visibility
    settingsToggle.addEventListener("change", () => {
        settingsSection.style.display = settingsToggle.checked ? "block" : "none";
    });

    matSettingsToggle.addEventListener("change", () => {
        matSettingsSection.style.display = matSettingsToggle.checked ? "block" : "none";
    });
  
    debugInformationToggle.addEventListener("change", () => {
        debugInformationSection.style.display = debugInformationToggle.checked ? "block" : "none";
    });
  
});

//Add a window resize handler for the ensuring container and canvas both width and height are exact multiples of sensor count
window.addEventListener('resize', debounce(() => {
    adjustContainerDimensions();
    updateHeatmapWithHistory();
}, 250));


//end of code
